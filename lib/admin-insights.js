import fs from 'fs/promises';
import path from 'path';
import LLMFactory from '#factory/llm/LLMFactory.js';
import { getLsyUserStore } from './user-store.js';
import { ensureUserWorkspace, getUserWorkspace, readUserAgents } from './user-workspace.js';
import { buildWorkspaceIndex } from './workspace-tools.js';
import { getLsyConfig } from '../commonconfig/lsy.js';
import { maskLlmConfigPublic } from './llm-config.js';

async function buildServiceSnapshot() {
  const cfg = await getLsyConfig();
  const provider = String(cfg.llm?.provider || '').trim();
  const profile = provider ? LLMFactory.getProviderConfig(provider) : null;
  return {
    enabled: cfg.enabled !== false,
    llm: maskLlmConfigPublic(cfg.llm || {}, profile),
    defaultQuota: cfg.defaultQuota ?? 100,
    defaultUsername: cfg.defaultUsername || 'demo',
    search: {
      provider: cfg.search?.provider || 'auto'
    },
    tools: {
      allowGhClone: cfg.tools?.allowGhClone === true
    },
    admin: {
      allowLoopbackBypass: cfg.admin?.allowLoopbackBypass === true
    }
  };
}

export async function getAdminStats() {
  const users = (await getLsyUserStore().listUsers()) ?? [];
  let totalUsed = 0;
  let atLimit = 0;
  let enabled = 0;
  for (const u of users) {
    totalUsed += u.used ?? 0;
    if (u.enabled !== false) enabled += 1;
    if (u.quota > 0 && u.used >= u.quota) atLimit += 1;
  }
  return {
    totalUsers: users.length,
    enabledUsers: enabled,
    disabledUsers: users.length - enabled,
    totalUsed,
    usersAtLimit: atLimit,
    service: await buildServiceSnapshot()
  };
}

export async function getUserWorkspaceSummary(username) {
  await ensureUserWorkspace(username);
  const ws = getUserWorkspace(username);
  const index = await buildWorkspaceIndex(username);
  const fileCount = (sub) => index.sections[sub]?.total ?? index.sections[sub]?.files?.length ?? 0;
  let chatFiles = 0;
  try {
    const names = await fs.readdir(path.join(ws, 'chats'));
    chatFiles = names.filter((n) => n.endsWith('.json')).length;
  } catch { /* ignore */ }
  let agentsLength = 0;
  try {
    agentsLength = String(await readUserAgents(username) ?? '').length;
  } catch { /* ignore */ }
  let auditSize = 0;
  try {
    auditSize = (await fs.stat(path.join(ws, 'audit.jsonl'))).size;
  } catch { /* ignore */ }

  return {
    files: {
      uploads: fileCount('uploads'),
      project: fileCount('project'),
      output: fileCount('output'),
      chats: chatFiles
    },
    agentsMdLength: agentsLength,
    auditBytes: auditSize
  };
}
