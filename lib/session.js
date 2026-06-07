import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import paths from '#utils/paths.js';
import { getRedis } from '#infrastructure/database/index.js';

const SESSION_PREFIX = 'lsy:session:';
const SESSION_DIR = path.join(paths.data, 'lsy', 'sessions');
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export default class LsySession {
  async _saveFile(token, data) {
    await fs.mkdir(SESSION_DIR, { recursive: true });
    await fs.writeFile(path.join(SESSION_DIR, `${token}.json`), JSON.stringify(data), 'utf8');
  }

  async _readFile(token) {
    try {
      const raw = await fs.readFile(path.join(SESSION_DIR, `${token}.json`), 'utf8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async _deleteFile(token) {
    try {
      await fs.unlink(path.join(SESSION_DIR, `${token}.json`));
    } catch { /* ignore */ }
  }

  createToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  async create(username) {
    const token = this.createToken();
    const data = { username, createdAt: Date.now(), expiresAt: Date.now() + SESSION_TTL_MS };
    const redis = getRedis()?.isOpen ? getRedis() : null;
    if (redis) {
      await redis.setEx(`${SESSION_PREFIX}${token}`, Math.floor(SESSION_TTL_MS / 1000), JSON.stringify(data));
    } else {
      await this._saveFile(token, data);
    }
    return { token, expiresAt: data.expiresAt };
  }

  async verify(token) {
    if (!token) return null;
    const redis = getRedis()?.isOpen ? getRedis() : null;
    let data = null;
    if (redis) {
      const raw = await redis.get(`${SESSION_PREFIX}${token}`);
      if (raw) data = JSON.parse(raw);
    } else {
      data = await this._readFile(token);
    }
    if (!data || data.expiresAt < Date.now()) {
      if (token) await this.destroy(token);
      return null;
    }
    return { username: data.username };
  }

  async destroy(token) {
    if (!token) return;
    const redis = getRedis()?.isOpen ? getRedis() : null;
    if (redis) {
      await redis.del(`${SESSION_PREFIX}${token}`);
    } else {
      await this._deleteFile(token);
    }
  }
}

let instance = null;
export function getLsySession() {
  if (!instance) instance = new LsySession();
  return instance;
}

export function extractBearerToken(req) {
  const auth = req.headers?.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return req.headers?.['x-lsy-token'] || req.body?.token || null;
}
