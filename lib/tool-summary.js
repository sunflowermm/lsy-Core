/** 工具结果摘要，供 SSE / 前端详情展示 */

function trunc(s, n = 120) {
  const t = String(s ?? '').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

function pickPath(args) {
  return args?.filePath || args?.path || args?.dirPath || '';
}

export function sanitizeToolArgs(name, args = {}) {
  const out = { ...args };
  if (name === 'write' && typeof out.content === 'string' && out.content.length > 200) {
    out.content = `${out.content.slice(0, 200)}… (${out.content.length} 字)`;
  }
  if (name === 'run' && typeof out.command === 'string') {
    out.command = trunc(out.command, 300);
  }
  return out;
}

export function summarizeToolUse(name, args = {}, result = {}) {
  if (result.success === false) {
    const err = result.error || '失败';
    return { ok: false, summary: trunc(err, 80), detail: err };
  }

  const data = result.data;
  switch (name) {
    case 'read':
      return { ok: true, summary: pickPath(args) || '已读', detail: `读取 ${pickPath(args)}` };
    case 'view_image':
      return {
        ok: true,
        summary: pickPath(args) || '已识图',
        detail: String(data?.analysis || '')
      };
    case 'write':
      return { ok: true, summary: pickPath(args) || '已写', detail: `写入 ${pickPath(args)}` };
    case 'grep':
      return {
        ok: true,
        summary: `${data?.matches?.length ?? data?.count ?? 0} 处`,
        detail: `pattern: ${args.pattern || ''}`
      };
    case 'list_files':
      return {
        ok: true,
        summary: `${data?.entries?.length ?? 0} 项`,
        detail: data?.dir ? `目录 ${data.dir}` : '三区索引'
      };
    case 'export_doc':
      return {
        ok: true,
        summary: data?.output || pickPath(args),
        detail: data?.engine ? `via ${data.engine}` : `导出 ${pickPath(args)}`
      };
    case 'convert_document':
      return {
        ok: true,
        summary: data?.outputPath || pickPath(args),
        detail: `转换 ${pickPath(args)} → ${args.targetFormat || 'txt'}`
      };
    case 'run':
      return {
        ok: data?.exitCode === 0 || data?.exitCode == null,
        summary: (data?.exitCode ?? 0) === 0 ? 'exit 0' : `exit ${data?.exitCode ?? '?'}`,
        detail: trunc(data?.output || data?.stderr || '', 400)
      };
    case 'web_search':
      return {
        ok: true,
        summary: `${data?.results?.length ?? 0} 条 · ${data?.engine || 'search'}`,
        detail: (data?.results || [])
          .slice(0, 5)
          .map((r, i) => `${i + 1}. ${r.title || r.url}\n   ${r.url}`)
          .join('\n')
      };
    case 'web_fetch':
      return {
        ok: true,
        summary: trunc(args.url, 60),
        detail: `抓取 ${args.url}`
      };
    case 'gh_clone':
      return {
        ok: true,
        summary: data?.path || args.repo,
        detail: `克隆 ${args.repo || ''} → ${data?.path || ''}`
      };
    default:
      return { ok: true, summary: '完成', detail: '' };
  }
}

export function blocksToTools(blocks = []) {
  return blocks
    .filter((b) => b.type === 'tool')
    .map((b) => ({
      id: b.id,
      name: b.name,
      status: b.status || 'done',
      ok: b.ok,
      summary: b.summary,
      detail: b.detail
    }));
}
