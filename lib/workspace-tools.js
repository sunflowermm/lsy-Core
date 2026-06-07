import path from 'path';
import fs from 'fs/promises';
import { BaseTools } from '#utils/base-tools.js';
import { exec } from '#utils/exec-async.js';
import { assertAiReadable, assertAiWritable, normRel } from './path-policy.js';
import { assertSafeRun } from './run-policy.js';
import { ensureUserWorkspace, getUserWorkspace, isPathInsideWorkspace } from './user-workspace.js';
import { getLsyConfig } from '../commonconfig/lsy.js';

const IS_WINDOWS = process.platform === 'win32';

export const FILE_CFG = {
  maxReadChars: 500_000,
  grepMaxResults: 100,
  runTimeoutMs: 90_000,
  maxCommandOutputChars: 100_000
};

/** 注入 system prompt 的工作区索引上限 */
export const WORKSPACE_INDEX = {
  sections: ['uploads', 'project', 'output'],
  maxDepth: { uploads: 4, project: 8, output: 5 },
  maxFilesPerSection: 300,
  maxSnapshotChars: 14_000
};

const SKIP_DIR_NAMES = new Set(['node_modules', '.git', '__pycache__', '.venv', 'venv', 'dist', 'build', '.next']);

export function resolveUsername(context) {
  const e = context?.e;
  return e?.user_id || e?.lsy_username ? String(e.user_id || e.lsy_username) : null;
}

export async function resolveWorkspaceContext(context) {
  const username = resolveUsername(context);
  if (!username) throw new Error('未绑定用户工作区');
  const workspace = await ensureUserWorkspace(username);
  return { username, workspace, tools: new BaseTools(workspace) };
}

export function guardPath(fullPath, workspace) {
  if (!isPathInsideWorkspace(fullPath, workspace)) throw new Error('路径超出工作区');
  return fullPath;
}

function buildShellCommand(command, workspace) {
  const isPs = /^(Get-|Set-|New-|Remove-|Test-|Invoke-|Start-|Stop-)/i.test(command);
  if (IS_WINDOWS) {
    const ws = workspace.replace(/'/g, "''");
    return isPs
      ? `powershell -NoProfile -Command "Set-Location '${ws}'; ${command.replace(/"/g, '`"')}"`
      : `cd /d "${workspace}" && ${command}`;
  }
  const ws = workspace.replace(/'/g, `'\\''`);
  return `cd '${ws}' && ${command}`;
}

export async function runInWorkspace(workspace, command, timeoutMs = FILE_CFG.runTimeoutMs) {
  const cfg = await getLsyConfig();
  const safeCommand = assertSafeRun(command, { allowGhClone: cfg.tools?.allowGhClone === true });
  const { stdout, stderr } = await exec(buildShellCommand(safeCommand, workspace), {
    maxBuffer: 5 * 1024 * 1024,
    cwd: workspace,
    timeout: timeoutMs,
    env: { ...process.env },
    shell: IS_WINDOWS ? 'cmd.exe' : '/bin/sh'
  });
  let output = (stdout ?? '').trim();
  let truncated = false;
  if (output.length > FILE_CFG.maxCommandOutputChars) {
    output = output.slice(0, FILE_CFG.maxCommandOutputChars);
    truncated = true;
  }
  return { command: safeCommand, output, stderr: (stderr ?? '').trim(), truncated, exitCode: 0 };
}

async function walkDir(dir, base, depth, maxDepth) {
  if (depth > maxDepth) return [];
  const items = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return items;
  }
  for (const ent of entries) {
    if (ent.name.startsWith('.') || ent.name === 'audit.jsonl') continue;
    if (ent.isDirectory() && SKIP_DIR_NAMES.has(ent.name)) continue;
    const rel = path.relative(base, path.join(dir, ent.name)).replace(/\\/g, '/');
    if (rel.startsWith('chats/')) continue;
    if (ent.isDirectory()) {
      items.push({ type: 'dir', path: rel });
      if (depth < maxDepth) items.push(...await walkDir(path.join(dir, ent.name), base, depth + 1, maxDepth));
    } else {
      let size = 0;
      try { size = (await fs.stat(path.join(dir, ent.name))).size; } catch { /* ignore */ }
      items.push({ type: 'file', path: rel, size });
    }
  }
  return items;
}

export async function listWorkspaceFiles(username, { subdir = '', maxDepth = 4 } = {}) {
  await ensureUserWorkspace(username);
  const workspace = getUserWorkspace(username);
  const root = subdir ? path.join(workspace, subdir) : workspace;
  guardPath(root, workspace);
  return walkDir(root, workspace, 0, maxDepth);
}

/** 扫描 uploads / project / output 全部可见文件（供 Agent 索引与 list_files） */
export async function buildWorkspaceIndex(username) {
  await ensureUserWorkspace(username);
  const sections = {};
  let truncated = false;

  for (const sub of WORKSPACE_INDEX.sections) {
    const depth = WORKSPACE_INDEX.maxDepth[sub] ?? 4;
    const items = await listWorkspaceFiles(username, { subdir: sub, maxDepth: depth });
    const files = items.filter((i) => i.type === 'file').sort((a, b) => a.path.localeCompare(b.path));
    const dirs = items.filter((i) => i.type === 'dir').sort((a, b) => a.path.localeCompare(b.path));
    const cap = WORKSPACE_INDEX.maxFilesPerSection;
    if (files.length > cap) {
      truncated = true;
      sections[sub] = { files: files.slice(0, cap), dirs, omitted: files.length - cap, total: files.length };
    } else {
      sections[sub] = { files, dirs, omitted: 0, total: files.length };
    }
  }

  return {
    workspace: getUserWorkspace(username),
    sections,
    truncated
  };
}

export function formatWorkspaceSnapshot(index) {
  if (!index?.sections) return '（无法读取工作区）';
  const blocks = [];

  for (const sub of WORKSPACE_INDEX.sections) {
    const sec = index.sections[sub] || { files: [], dirs: [], omitted: 0, total: 0 };
    const lines = [];
    for (const d of sec.dirs) lines.push(`${d.path}/`);
    for (const f of sec.files) {
      const kb = f.size > 0 ? ` (${Math.max(1, Math.round(f.size / 1024))}KB)` : '';
      lines.push(`${f.path}${kb}`);
    }
    let body = lines.length ? lines.join('\n') : '（空）';
    if (sec.omitted > 0) {
      body += `\n… 另有 ${sec.omitted} 个文件，请 list_files("${sub}/")`;
    }
    blocks.push(`${sub}/ (${sec.total ?? sec.files.length} 个文件)\n${body}`);
  }

  let text = blocks.join('\n\n');
  if (index.truncated) {
    text += '\n\n（部分目录文件过多已截断，用 list_files 查看完整列表）';
  }
  const max = WORKSPACE_INDEX.maxSnapshotChars;
  if (text.length > max) {
    text = `${text.slice(0, max)}\n…（快照字符超限，用 list_files 补充）`;
  }
  return text;
}

export async function aiReadFile(tools, workspace, filePath) {
  assertAiReadable(filePath);
  guardPath(tools.resolvePath(filePath), workspace);
  return tools.readFile(filePath);
}

export async function aiWriteFile(tools, workspace, filePath, content) {
  assertAiWritable(filePath);
  guardPath(tools.resolvePath(filePath), workspace);
  return tools.writeFile(filePath, content);
}

/** output/ 下 md → docx；仅用相对路径；无 pandoc/soffice 时返回 fallback */
export async function exportMarkdownDoc(workspace, filePath) {
  const rel = assertAiReadable(filePath);
  if (!rel.startsWith('output/') || !/\.md$/i.test(rel)) {
    throw new Error('export_doc 仅支持 output/*.md');
  }
  const outRel = rel.replace(/\.md$/i, '.docx');
  assertAiWritable(outRel);

  const tryPandoc = () => runInWorkspace(workspace, `pandoc "${rel}" -o "${outRel}"`, 120_000);
  const trySoffice = () => runInWorkspace(
    workspace,
    `soffice --headless --convert-to docx --outdir output "${rel}"`,
    120_000
  );

  try {
    await tryPandoc();
    return { success: true, data: { source: rel, output: outRel, engine: 'pandoc' } };
  } catch {
    try {
      await trySoffice();
      return { success: true, data: { source: rel, output: outRel, engine: 'soffice' } };
    } catch {
      return {
        success: false,
        error: '服务器未安装 pandoc / LibreOffice，无法生成 docx',
        hint: `已保留 ${rel}，请在工作区 output/ 下载 .md 或联系管理员安装 pandoc`,
        data: { source: rel, fallback: rel }
      };
    }
  }
}

export async function convertDocument(workspace, filePath, targetFormat = 'txt') {
  assertAiReadable(filePath);
  const tools = new BaseTools(workspace);
  const full = guardPath(tools.resolvePath(filePath), workspace);
  const ext = path.extname(full).toLowerCase();
  const fmt = targetFormat.replace(/^\./, '').toLowerCase();
  const dir = path.dirname(normRel(filePath));
  const baseName = path.basename(full, path.extname(full));
  const outRel = assertAiWritable(path.join(dir, `${baseName}.${fmt}`).replace(/\\/g, '/'));

  if (['.txt', '.md', '.json', '.csv'].includes(ext) && fmt === 'txt') {
    const r = await tools.readFile(filePath);
    if (!r.success) return r;
    await tools.writeFile(outRel, r.content);
    return { success: true, data: { source: filePath, output: outRel } };
  }

  const pandocCmd = `pandoc "${path.basename(full)}" -o "${path.basename(outRel)}"`;
  try {
    await runInWorkspace(workspace, pandocCmd, 120_000);
    return { success: true, data: { source: filePath, output: outRel, tool: 'pandoc' } };
  } catch {
    try {
      const sofficeCmd = IS_WINDOWS
        ? `"soffice" --headless --convert-to ${fmt} --outdir "." "${path.basename(full)}"`
        : `soffice --headless --convert-to ${fmt} --outdir . "${path.basename(full)}"`;
      await runInWorkspace(workspace, sofficeCmd, 120_000);
      return { success: true, data: { source: filePath, output: outRel, tool: 'soffice' } };
    } catch (err) {
      return { success: false, error: err.message, hint: '请安装 pandoc 或 LibreOffice' };
    }
  }
}
