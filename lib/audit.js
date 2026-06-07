import fs from 'fs/promises';
import path from 'path';
import { getUserWorkspace } from './user-workspace.js';

const MAX_AUDIT_BYTES = 512_000;

/** 将 shell 长错误压缩为可读摘要（写入 audit + 前端展示） */
export function formatAuditDetail(detail) {
  const s = String(detail || '').trim();
  if (!s) return '';
  if (/pandoc:\s*not found/i.test(s)) return 'pandoc 未安装（服务器: apt install pandoc）';
  if (/soffice:\s*not found/i.test(s)) return 'LibreOffice 未安装（apt install libreoffice）';
  if (/Command failed:/i.test(s)) {
    const tail = s.replace(/^Command failed:\s*/i, '').replace(/\s+/g, ' ').trim();
    return tail.length > 180 ? `${tail.slice(0, 180)}…` : tail;
  }
  return s.length > 200 ? `${s.slice(0, 200)}…` : s;
}

export async function auditToolUse(username, tool, { ok = true, detail = '' } = {}) {
  if (!username) return;
  const file = path.join(getUserWorkspace(username), 'audit.jsonl');
  const line = `${JSON.stringify({
    ts: Date.now(),
    tool,
    ok,
    detail: formatAuditDetail(detail)
  })}\n`;
  try {
    await fs.appendFile(file, line, 'utf8');
    const st = await fs.stat(file);
    if (st.size > MAX_AUDIT_BYTES) {
      const raw = await fs.readFile(file, 'utf8');
      const lines = raw.trim().split('\n');
      await fs.writeFile(file, lines.slice(-200).join('\n') + '\n', 'utf8');
    }
  } catch { /* 审计失败不阻断主流程 */ }
}

export async function readAuditTail(username, limit = 50) {
  const file = path.join(getUserWorkspace(username), 'audit.jsonl');
  try {
    const raw = await fs.readFile(file, 'utf8');
    const lines = raw.trim().split('\n').filter(Boolean);
    return lines.slice(-limit).map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { raw: line };
      }
    });
  } catch {
    return [];
  }
}
