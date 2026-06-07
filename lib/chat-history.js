import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { ensureUserWorkspace } from './user-workspace.js';

async function listChatFiles(username) {
  const dir = path.join(await ensureUserWorkspace(username), 'chats');
  await fs.mkdir(dir, { recursive: true });
  const files = await fs.readdir(dir);
  return files.filter((f) => f.endsWith('.json'));
}

export async function listChats(username) {
  const dir = path.join(await ensureUserWorkspace(username), 'chats');
  await fs.mkdir(dir, { recursive: true });
  const files = await listChatFiles(username);
  const chats = [];
  for (const file of files) {
    try {
      const raw = await fs.readFile(path.join(dir, file), 'utf8');
      const data = JSON.parse(raw);
      chats.push({
        id: data.id || file.replace('.json', ''),
        title: data.title || '新对话',
        updatedAt: data.updatedAt || 0,
        messageCount: Array.isArray(data.messages) ? data.messages.length : 0
      });
    } catch { /* skip corrupt */ }
  }
  chats.sort((a, b) => b.updatedAt - a.updatedAt);
  return chats;
}

export async function getChat(username, chatId) {
  const file = path.join(await ensureUserWorkspace(username), 'chats', `${chatId}.json`);
  try {
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveChat(username, chatId, { title, messages }) {
  const dir = path.join(await ensureUserWorkspace(username), 'chats');
  await fs.mkdir(dir, { recursive: true });
  const id = chatId || crypto.randomBytes(8).toString('hex');
  const existing = await getChat(username, id);
  const data = {
    id,
    title: title || existing?.title || '新对话',
    messages: messages ?? existing?.messages ?? [],
    updatedAt: Date.now(),
    createdAt: existing?.createdAt ?? Date.now()
  };
  await fs.writeFile(path.join(dir, `${id}.json`), JSON.stringify(data, null, 2), 'utf8');
  return data;
}

export async function deleteChat(username, chatId) {
  const file = path.join(await ensureUserWorkspace(username), 'chats', `${chatId}.json`);
  try {
    await fs.unlink(file);
    return true;
  } catch {
    return false;
  }
}

export function createChatId() {
  return crypto.randomBytes(8).toString('hex');
}
