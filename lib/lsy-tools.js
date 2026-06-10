import {
  buildWebFetchRuntime,
  buildWebSearchRuntime,
  runWebFetch,
  runWebSearch
} from '../../system-Core/lib/crawl/index.js';
import { getLsyConfig } from '../commonconfig/lsy.js';
import { auditToolUse, formatAuditDetail } from './audit.js';
import {
  FILE_CFG,
  resolveWorkspaceContext,
  resolveUsername,
  runInWorkspace,
  convertDocument,
  exportMarkdownDoc,
  aiReadFile,
  aiWriteFile,
  buildWorkspaceIndex,
  listWorkspaceFiles
} from './workspace-tools.js';
import { assertAiReadable, assertAiWritable, normRel } from './path-policy.js';
import { isImagePath, analyzeWorkspaceImage } from './image-vision.js';

const GH_PROXY = 'https://gh-proxy.com';

const TOOL_TIMEOUT_MS = {
  view_image: 120_000,
  web_fetch: 60_000,
  web_search: 45_000,
  run: 90_000,
  gh_clone: 180_000,
  convert_document: 120_000,
  export_doc: 120_000,
  default: 45_000
};

const BINARY_READ_EXT = new Set([
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.zip', '.rar', '.7z', '.gz', '.tar', '.exe', '.dll', '.wasm', '.mp3', '.mp4'
]);

function isBinaryReadPath(filePath) {
  const ext = normRel(filePath).slice(normRel(filePath).lastIndexOf('.')).toLowerCase();
  return BINARY_READ_EXT.has(ext);
}

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} 超时 (${Math.round(ms / 1000)}s)`)), ms);
    })
  ]).finally(() => clearTimeout(timer));
}

export const LSY_TOOL_SPECS = [
  {
    name: 'read',
    description: '读取工作区文本文件（不含 chats/；图片请用 view_image）',
    input_schema: {
      type: 'object',
      properties: { filePath: { type: 'string' } },
      required: ['filePath']
    }
  },
  {
    name: 'view_image',
    description: '识图：分析 uploads/ project/ output/ 下的 png/jpg/gif/webp 图片',
    input_schema: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: '如 uploads/photo.png' },
        prompt: { type: 'string', description: '可选：关注点，如提取图中文字' }
      },
      required: ['filePath']
    }
  },
  {
    name: 'write',
    description: '写入 uploads/ project/ output/ 下的文件',
    input_schema: {
      type: 'object',
      properties: { filePath: { type: 'string' }, content: { type: 'string' } },
      required: ['filePath', 'content']
    }
  },
  {
    name: 'grep',
    description: '在工作区搜索文本',
    input_schema: {
      type: 'object',
      properties: { pattern: { type: 'string' }, filePath: { type: 'string' } },
      required: ['pattern']
    }
  },
  {
    name: 'list_files',
    description: '列出 uploads/ project/ output/ 文件（不含 chats）；无 dirPath 时返回三区完整索引',
    input_schema: {
      type: 'object',
      properties: { dirPath: { type: 'string' } }
    }
  },
  {
    name: 'export_doc',
    description: '将 output/*.md 导出为 docx（自动 pandoc/soffice，失败则保留 md）',
    input_schema: {
      type: 'object',
      properties: { filePath: { type: 'string', description: '如 output/report.md' } },
      required: ['filePath']
    }
  },
  {
    name: 'convert_document',
    description: 'doc/docx/pdf → txt/md，输出到同目录',
    input_schema: {
      type: 'object',
      properties: {
        filePath: { type: 'string' },
        targetFormat: { type: 'string', enum: ['txt', 'md'] }
      },
      required: ['filePath']
    }
  },
  {
    name: 'run',
    description: '白名单 shell：pandoc/npm/node/python/git status 等',
    input_schema: {
      type: 'object',
      properties: { command: { type: 'string' } },
      required: ['command']
    }
  },
  {
    name: 'web_search',
    description: '开放域网页搜索（同 AGT web.web_search；配置 aistream.crawl.webSearch）',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string' }, maxResults: { type: 'number' } },
      required: ['query']
    }
  },
  {
    name: 'web_fetch',
    description: '抓取 URL（SSRF 防护）',
    input_schema: {
      type: 'object',
      properties: { url: { type: 'string' }, extractMode: { type: 'string', enum: ['markdown', 'text'] } },
      required: ['url']
    }
  },
  {
    name: 'gh_clone',
    description: '克隆 GitHub 仓库到 project/（需管理员开启）',
    input_schema: {
      type: 'object',
      properties: { repo: { type: 'string' }, targetDir: { type: 'string' } },
      required: ['repo']
    }
  }
];

async function withTool(ctx, name, fn) {
  const user = resolveUsername(ctx);
  const ms = TOOL_TIMEOUT_MS[name] ?? TOOL_TIMEOUT_MS.default;
  try {
    const result = await withTimeout(fn(), ms, toolLabel(name) || name);
    const ok = result?.success !== false;
    const detail = ok ? '' : formatAuditDetail(result?.error || result?.hint || '');
    await auditToolUse(user, name, { ok, detail });
    return result;
  } catch (err) {
    await auditToolUse(user, name, { ok: false, detail: err.message });
    return { success: false, error: err.message };
  }
}

function toolLabel(name) {
  const labels = {
    read: '读取', view_image: '识图', write: '写入', run: '命令',
    web_search: '搜索', web_fetch: '抓取', export_doc: '导出'
  };
  return labels[name] || name;
}

export function toolResultContent(result) {
  if (typeof result === 'string') return result;
  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}

export async function executeLsyTool(name, args, ctx) {
  const cfg = FILE_CFG;
  switch (name) {
    case 'read':
      return withTool(ctx, name, async () => {
        const rel = normRel(args.filePath);
        if (isImagePath(rel)) {
          return {
            success: false,
            error: 'read 不能读取图片二进制',
            hint: `请改用 view_image({ filePath: "${rel}" }) 进行识图`
          };
        }
        if (isBinaryReadPath(rel)) {
          return {
            success: false,
            error: 'read 不支持该二进制格式',
            hint: `请用 convert_document 转为 txt/md，或图片用 view_image：${rel}`
          };
        }
        const { tools, workspace } = await resolveWorkspaceContext(ctx);
        const r = await aiReadFile(tools, workspace, args.filePath);
        if (!r.success) return r;
        let content = r.content;
        const truncated = content.length > cfg.maxReadChars;
        if (truncated) content = content.slice(0, cfg.maxReadChars);
        return { success: true, data: { path: r.path, content, truncated } };
      });
    case 'view_image':
      return withTool(ctx, name, async () =>
        analyzeWorkspaceImage(ctx, args.filePath, args.prompt)
      );
    case 'write':
      return withTool(ctx, name, async () => {
        const { tools, workspace } = await resolveWorkspaceContext(ctx);
        return aiWriteFile(tools, workspace, args.filePath, args.content);
      });
    case 'grep':
      return withTool(ctx, name, async () => {
        const { tools } = await resolveWorkspaceContext(ctx);
        if (args.filePath) assertAiReadable(args.filePath);
        return tools.grep(args.pattern, args.filePath, {
          caseSensitive: false,
          lineNumbers: true,
          maxResults: cfg.grepMaxResults
        });
      });
    case 'list_files':
      return withTool(ctx, name, async () => {
        const { username } = await resolveWorkspaceContext(ctx);
        const dir = args.dirPath ? normRel(assertAiReadable(args.dirPath)) : '';
        if (dir) {
          const items = await listWorkspaceFiles(username, {
            subdir: dir.replace(/\/$/, ''),
            maxDepth: 8
          });
          return {
            success: true,
            data: {
              dir,
              entries: items.map((i) => ({ type: i.type, path: i.path, size: i.size ?? 0 }))
            }
          };
        }
        const index = await buildWorkspaceIndex(username);
        const flat = [];
        for (const sub of ['uploads', 'project', 'output']) {
          const sec = index.sections[sub];
          if (!sec) continue;
          for (const d of sec.dirs) flat.push({ type: 'dir', path: `${d.path}/` });
          for (const f of sec.files) flat.push({ type: 'file', path: f.path, size: f.size ?? 0 });
          if (sec.omitted > 0) {
            flat.push({ type: 'note', path: `${sub}/ … +${sec.omitted} 更多`, size: 0 });
          }
        }
        return { success: true, data: { dir: '(uploads+project+output)', entries: flat } };
      });
    case 'export_doc':
      return withTool(ctx, name, async () => {
        const { workspace } = await resolveWorkspaceContext(ctx);
        return exportMarkdownDoc(workspace, args.filePath);
      });
    case 'convert_document':
      return withTool(ctx, name, async () => {
        const { workspace } = await resolveWorkspaceContext(ctx);
        return convertDocument(workspace, args.filePath, args.targetFormat || 'txt');
      });
    case 'run':
      return withTool(ctx, name, async () => {
        const { workspace } = await resolveWorkspaceContext(ctx);
        try {
          const data = await runInWorkspace(workspace, args.command);
          return { success: true, data };
        } catch (err) {
          return { success: false, error: err.message };
        }
      });
    case 'web_search':
      return withTool(ctx, name, async () => {
        const query = String(args.query || '').trim();
        if (!query) return { success: false, error: 'query 必填' };
        const count =
          typeof args.maxResults === 'number' && Number.isFinite(args.maxResults)
            ? Math.min(10, Math.max(1, Math.floor(args.maxResults)))
            : undefined;
        const rt = buildWebSearchRuntime();
        const out = await runWebSearch({ query, count }, rt);
        if (out.result?.error) {
          return {
            success: false,
            error: out.result.message || out.result.error,
            data: { query, engine: out.provider, fallbackFrom: out.fallbackFrom }
          };
        }
        const results = Array.isArray(out.result?.results) ? out.result.results : [];
        return {
          success: true,
          data: {
            query,
            engine: out.provider,
            fallbackFrom: out.fallbackFrom,
            count: results.length,
            results
          }
        };
      });
    case 'web_fetch':
      return withTool(ctx, name, async () => {
        const url = String(args.url || '').trim();
        if (!url) return { success: false, error: 'url 必填' };
        const rt = buildWebFetchRuntime();
        const result = await runWebFetch({
          url,
          extractMode: args.extractMode === 'text' ? 'text' : 'markdown',
          maxChars: rt.maxCharsCap,
          maxResponseBytes: rt.maxResponseBytes,
          maxRedirects: rt.maxRedirects,
          timeoutSeconds: rt.timeoutSeconds,
          cacheTtlMs: rt.cacheTtlMs,
          userAgent: rt.userAgent,
          readabilityEnabled: rt.readabilityEnabled,
          firecrawlEnabled: rt.firecrawlEnabled,
          firecrawlApiKey: rt.firecrawlApiKey,
          firecrawlBaseUrl: rt.firecrawlBaseUrl,
          firecrawlOnlyMainContent: rt.firecrawlOnlyMainContent,
          firecrawlMaxAgeMs: rt.firecrawlMaxAgeMs,
          firecrawlProxy: rt.firecrawlProxy,
          firecrawlStoreInCache: rt.firecrawlStoreInCache,
          firecrawlTimeoutSeconds: rt.firecrawlTimeoutSeconds
        });
        return { success: true, data: result };
      });
    case 'gh_clone':
      return withTool(ctx, name, async () => {
        const lsyCfg = await getLsyConfig();
        if (lsyCfg.tools?.allowGhClone !== true) {
          return { success: false, error: 'gh_clone 未开启，请联系管理员' };
        }
        const { workspace } = await resolveWorkspaceContext(ctx);
        let repo = String(args.repo || '').trim().replace(/^https:\/\/github.com\//, '').replace(/\.git$/, '');
        if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return { success: false, error: 'repo: owner/name' };
        const dirName = args.targetDir || repo.split('/').pop();
        const rel = assertAiWritable(`project/${dirName}`.replace(/\\/g, '/'));
        const cmd = `git clone --depth 1 "${GH_PROXY}/https://github.com/${repo}.git" "${rel}"`;
        const data = await runInWorkspace(workspace, cmd, 180_000);
        return { success: true, data: { repo, path: rel, output: data.output } };
      });
    default:
      return { success: false, error: `未知工具: ${name}` };
  }
}

export async function executeLsyToolForAnthropic(name, args, ctx) {
  const result = await executeLsyTool(name, args, ctx);
  return toolResultContent(result);
}

export function listLsyAnthropicTools({ allowGhClone = false } = {}) {
  return LSY_TOOL_SPECS.filter((t) => t.name !== 'gh_clone' || allowGhClone);
}
