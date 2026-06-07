import fs from 'fs/promises';
import path from 'path';
import paths from '#utils/paths.js';
import { buildWorkspaceIndex, formatWorkspaceSnapshot } from './workspace-tools.js';
import { readUserAgents, getUserWorkspace } from './user-workspace.js';

export const LSY_SKILL_ROOT = 'core/lsy-Core/skills';
const SKILLS_DIR = path.join(paths.root, ...LSY_SKILL_ROOT.split('/'));
const MAX_SKILLS_CHARS = 48_000;

const AGENT_CORE_RULES = `你是李诗雅，专业 Agent（非普通聊天机器人）。
工作方式：先结论 → 再步骤 → 给可验证结果；需要时用工具，不要空谈。
下方「工作区文件索引」每轮对话自动刷新；写/删文件后索引会更新。
优先 read 处理文本；**png/jpg/gif/webp 图片必须用 view_image 识图，禁止 read 图片**。
上传文档用 convert_document。
回答简洁，关键路径写清（如 output/xxx）；高风险操作先说明再执行。`;

const WORKSPACE_MARKER = '## 工作区文件索引（实时）';
const SKILLS_HEADING = '## 李诗雅 Skills';

function stripFrontmatter(text) {
  if (!text.startsWith('---')) return text;
  const end = text.indexOf('---', 3);
  if (end === -1) return text;
  return text.slice(end + 3).trim();
}

export async function buildLsySkillsPrompt() {
  let entries;
  try {
    entries = await fs.readdir(SKILLS_DIR, { withFileTypes: true });
  } catch {
    return '';
  }
  const parts = [];
  let total = 0;
  for (const ent of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!ent.isDirectory()) continue;
    try {
      const raw = await fs.readFile(path.join(SKILLS_DIR, ent.name, 'SKILL.md'), 'utf8');
      const body = stripFrontmatter(raw).trim();
      if (!body) continue;
      const chunk = `### ${ent.name}\n${body}`;
      if (total + chunk.length > MAX_SKILLS_CHARS) break;
      parts.push(chunk);
      total += chunk.length;
    } catch { /* skip */ }
  }
  if (!parts.length) return '';
  return `${SKILLS_HEADING}\n${parts.join('\n\n')}`;
}

export async function buildAgentSystemPrompt(username) {
  const index = await buildWorkspaceIndex(username);
  const snapshot = formatWorkspaceSnapshot(index);
  const agentsMd = await readUserAgents(username);
  const skills = await buildLsySkillsPrompt();
  return composeSystemPrompt({ agentsMd, skills, snapshot, username });
}

function composeSystemPrompt({ agentsMd, skills, snapshot, username }) {
  return [
    AGENT_CORE_RULES,
    `工作区根目录: ${getUserWorkspace(username)}`,
    '工具: read, view_image, write, grep, list_files, export_doc, convert_document, run, web_search, web_fetch, gh_clone(可选)',
    '生成 docx: write output/x.md → export_doc（勿用绝对路径 run pandoc）',
    '禁止写 AGENTS.md、chats/。',
    '',
    '## 用户 AGENTS.md',
    agentsMd.slice(0, 12_000),
    '',
    WORKSPACE_MARKER,
    snapshot,
    skills || ''
  ].filter(Boolean).join('\n');
}

/** 多轮 tool 循环前仅刷新工作区索引（不重扫 skills） */
export async function refreshAgentSystemPrompt(anthMessages, username) {
  if (!Array.isArray(anthMessages) || anthMessages[0]?.role !== 'system') return;
  const content = anthMessages[0].content || '';
  const head = content.indexOf(WORKSPACE_MARKER);
  if (head < 0) {
    anthMessages[0].content = await buildAgentSystemPrompt(username);
    return;
  }
  const snapshot = formatWorkspaceSnapshot(await buildWorkspaceIndex(username));
  const tailStart = content.indexOf(SKILLS_HEADING, head);
  const prefix = content.slice(0, head + WORKSPACE_MARKER.length);
  const suffix = tailStart >= 0 ? content.slice(tailStart) : '';
  anthMessages[0].content = `${prefix}\n${snapshot}${suffix}`;
}

export async function prepareChatMessages(username, messages) {
  const system = await buildAgentSystemPrompt(username);
  const chatMessages = messages.map((m) => ({
    role: m.role,
    content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
  }));
  chatMessages.unshift({ role: 'system', content: system });
  return chatMessages;
}
