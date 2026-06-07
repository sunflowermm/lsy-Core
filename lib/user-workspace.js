import fs from 'fs/promises';
import path from 'path';
import paths from '#utils/paths.js';
import { AGENTS_FILE } from './path-policy.js';

const USERS_ROOT = path.join(paths.data, 'lsy', 'users');
const DEFAULT_AGENTS = `# 我的 Agent 规则

在此编写你希望 AI 遵循的说明（语气、领域、禁忌等）。保存后立即生效。

## 示例
- 用简体中文，先结论后步骤
- 处理 uploads/ 文档时先 convert_document 再 read
- 不要删除 uploads/ 里的原始文件
`;

export function getUserWorkspace(username) {
  const safe = String(username || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (!safe) throw new Error('无效用户名');
  return path.join(USERS_ROOT, safe);
}

export function getUploadsDir(username) {
  return path.join(getUserWorkspace(username), 'uploads');
}

function agentsPath(username) {
  return path.join(getUserWorkspace(username), AGENTS_FILE);
}

export async function readUserAgents(username) {
  await ensureUserWorkspace(username);
  try {
    return await fs.readFile(agentsPath(username), 'utf8');
  } catch {
    return DEFAULT_AGENTS;
  }
}

export async function writeUserAgents(username, content) {
  const text = String(content ?? '');
  if (text.length > 32_000) throw new Error('AGENTS.md 超过 32KB 上限');
  await ensureUserWorkspace(username);
  await fs.writeFile(agentsPath(username), text, 'utf8');
  return text;
}

export async function ensureUserWorkspace(username) {
  const ws = getUserWorkspace(username);
  for (const dir of ['uploads', 'project', 'output', 'chats']) {
    await fs.mkdir(path.join(ws, dir), { recursive: true });
  }
  try {
    await fs.access(agentsPath(username));
  } catch {
    await fs.writeFile(agentsPath(username), DEFAULT_AGENTS, 'utf8');
  }
  return ws;
}

export function isPathInsideWorkspace(targetPath, workspace) {
  const resolved = path.resolve(targetPath);
  const base = path.resolve(workspace);
  return resolved === base || resolved.startsWith(base + path.sep);
}
