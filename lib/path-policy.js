/** AI 工具路径策略（网页 Agent 安全边界） */

export const AGENTS_FILE = 'AGENTS.md';
const PROTECTED = ['chats/'];
const WRITABLE = ['uploads/', 'project/', 'output/'];

export function normRel(p) {
  return String(p || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

export function assertAiReadable(relPath) {
  const p = normRel(relPath);
  if (!p) throw new Error('路径不能为空');
  if (PROTECTED.some((pre) => p === pre.slice(0, -1) || p.startsWith(pre))) {
    throw new Error('无权读取该路径');
  }
  return p;
}

export function assertAiWritable(relPath) {
  const p = normRel(relPath);
  if (!p) throw new Error('路径不能为空');
  if (p === AGENTS_FILE || p.startsWith('chats/')) {
    throw new Error('该路径仅用户可在网页编辑，AI 不可写入');
  }
  if (!WRITABLE.some((pre) => p.startsWith(pre))) {
    throw new Error(`AI 仅可写入：${WRITABLE.join(' ')}`);
  }
  return p;
}

export function assertUserDeletable(relPath) {
  const p = normRel(relPath);
  if (!p || p.includes('..') || p.startsWith('chats/') || p === AGENTS_FILE) {
    throw new Error('不可删除该路径');
  }
  return p;
}

export const WRITABLE_DIRS = WRITABLE;
