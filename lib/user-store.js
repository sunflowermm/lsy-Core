import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import paths from '#utils/paths.js';
import RuntimeUtil from '#utils/runtime-util.js';

const COLLECTION = 'lsy_users';
const DATA_DIR = path.join(paths.data, 'lsy');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

function normalizePassword(password) {
  return String(password ?? '').trim();
}

function assertPassword(password) {
  const pwd = normalizePassword(password);
  if (pwd.length < 4) throw new Error('密码至少 4 位');
  return pwd;
}

function hashPassword(password, salt) {
  return crypto.scryptSync(normalizePassword(password), salt, 64).toString('hex');
}

function sanitizeUsername(username) {
  const u = String(username || '').trim().toLowerCase();
  if (!/^[a-z0-9_-]{2,32}$/.test(u)) {
    throw new Error('用户名仅允许 2-32 位字母、数字、下划线或连字符');
  }
  return u;
}

export default class LsyUserStore {
  _cache = null;
  _cacheAt = 0;
  CACHE_TTL = 5000;

  /**
   * 可选 Mongo：从 mongodb-Core 取 Db；未安装/未 bootstrap 时回落本地 users.json。
   * Runtime database 模块仅 Redis，业务库走对应 Core。
   */
  async _getDb() {
    try {
      const { getDb } = await import('../../mongodb-Core/lib/index.js');
      return getDb();
    } catch {
      return null;
    }
  }

  async _ensureDir() {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }

  async _readFileUsers() {
    try {
      const raw = await fs.readFile(USERS_FILE, 'utf8');
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return [];
      return Array.isArray(data.users) ? data.users : [];
    } catch (err) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
  }

  async _writeFileUsers(users) {
    await this._ensureDir();
    await fs.writeFile(USERS_FILE, JSON.stringify({ users, updatedAt: Date.now() }, null, 2), 'utf8');
    this._cache = null;
  }

  async _listFromMongo() {
    const db = await this._getDb();
    if (!db) return null;
    return db.collection(COLLECTION).find({}).toArray();
  }

  async listUsers() {
    const now = Date.now();
    if (this._cache && now - this._cacheAt < this.CACHE_TTL) {
      return this._cache;
    }
    const mongoUsers = await this._listFromMongo();
    let users = mongoUsers ?? await this._readFileUsers();
    if (!Array.isArray(users)) users = [];
    this._cache = users.filter(Boolean).map((u) => this._publicUser(u));
    this._cacheAt = now;
    return this._cache;
  }

  _publicUser(u) {
    const quota = u.quota ?? 0;
    const used = u.used ?? 0;
    return {
      username: u.username,
      quota,
      used,
      remaining: quota === 0 ? -1 : Math.max(0, quota - used),
      enabled: u.enabled !== false,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt
    };
  }

  async _findRaw(username) {
    const db = await this._getDb();
    if (db) {
      return db.collection(COLLECTION).findOne({ username });
    }
    const users = await this._readFileUsers();
    return users.find((u) => u.username === username) || null;
  }

  async getUser(username) {
    const u = sanitizeUsername(username);
    const raw = await this._findRaw(u);
    return raw ? this._publicUser(raw) : null;
  }

  async verifyPassword(username, password) {
    const u = sanitizeUsername(username);
    const raw = await this._findRaw(u);
    if (!raw || raw.enabled === false) return null;
    const hash = hashPassword(password, raw.salt);
    if (hash !== raw.passwordHash) return null;
    return this._publicUser(raw);
  }

  async upsertUser({ username, password, quota = 100, enabled = true }) {
    const u = sanitizeUsername(username);
    const pwd = assertPassword(password);
    const quotaNum = Math.max(0, Math.floor(Number(quota) || 0));
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(pwd, salt);
    const now = Date.now();
    const existing = await this._findRaw(u);

    const doc = {
      username: u,
      passwordHash,
      salt,
      quota: quotaNum,
      used: existing?.used ?? 0,
      enabled: enabled !== false,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };

    const db = await this._getDb();
    if (db) {
      await db.collection(COLLECTION).updateOne(
        { username: u },
        { $set: doc },
        { upsert: true }
      );
    } else {
      const users = await this._readFileUsers();
      const idx = users.findIndex((x) => x.username === u);
      if (idx >= 0) users[idx] = doc;
      else users.push(doc);
      await this._writeFileUsers(users);
    }
    this._cache = null;
    return this._publicUser(doc);
  }

  async patchUser(username, { password, quota, enabled } = {}) {
    const u = sanitizeUsername(username);
    const existing = await this._findRaw(u);
    if (!existing) throw new Error('用户不存在');
    if (quota != null && Number.isNaN(Number(quota))) {
      throw new Error('配额格式无效');
    }

    const now = Date.now();
    const patch = {
      quota: existing.quota,
      used: existing.used ?? 0,
      enabled: existing.enabled !== false,
      passwordHash: existing.passwordHash,
      salt: existing.salt,
      createdAt: existing.createdAt ?? now,
      updatedAt: now
    };

    if (quota != null) {
      patch.quota = Math.max(0, Math.floor(Number(quota) || 0));
    }
    if (enabled != null) {
      patch.enabled = enabled !== false;
    }

    const pwd = normalizePassword(password);
    if (pwd) {
      patch.salt = crypto.randomBytes(16).toString('hex');
      patch.passwordHash = hashPassword(assertPassword(pwd), patch.salt);
    } else if (!patch.passwordHash || !patch.salt) {
      throw new Error('账号缺少凭据，请设置新密码');
    }

    const doc = { username: u, ...patch };
    const db = await this._getDb();
    if (db) {
      await db.collection(COLLECTION).updateOne(
        { username: u },
        { $set: doc },
        { upsert: false }
      );
    } else {
      const users = await this._readFileUsers();
      const idx = users.findIndex((x) => x.username === u);
      if (idx < 0) throw new Error('用户不存在');
      users[idx] = doc;
      await this._writeFileUsers(users);
    }
    this._cache = null;
    return this._publicUser(doc);
  }

  async updateQuota(username, quota) {
    const u = sanitizeUsername(username);
    const existing = await this._findRaw(u);
    if (!existing) throw new Error('用户不存在');
    const quotaNum = Math.max(0, Math.floor(Number(quota) || 0));
    const now = Date.now();
    const db = await this._getDb();
    if (db) {
      await db.collection(COLLECTION).updateOne(
        { username: u },
        { $set: { quota: quotaNum, updatedAt: now } }
      );
    } else {
      const users = await this._readFileUsers();
      const idx = users.findIndex((x) => x.username === u);
      if (idx < 0) throw new Error('用户不存在');
      users[idx].quota = quotaNum;
      users[idx].updatedAt = now;
      await this._writeFileUsers(users);
    }
    this._cache = null;
    return await this.getUser(u);
  }

  async incrementUsed(username) {
    const u = sanitizeUsername(username);
    const db = await this._getDb();
    if (db) {
      const r = await db.collection(COLLECTION).findOneAndUpdate(
        { username: u },
        { $inc: { used: 1 }, $set: { updatedAt: Date.now() } },
        { returnDocument: 'after' }
      );
      this._cache = null;
      return r?.used ?? 0;
    }
    const users = await this._readFileUsers();
    const idx = users.findIndex((x) => x.username === u);
    if (idx < 0) throw new Error('用户不存在');
    users[idx].used = (users[idx].used ?? 0) + 1;
    users[idx].updatedAt = Date.now();
    await this._writeFileUsers(users);
    return users[idx].used;
  }

  async deleteUser(username) {
    const u = sanitizeUsername(username);
    const db = await this._getDb();
    if (db) {
      await db.collection(COLLECTION).deleteOne({ username: u });
    } else {
      const users = await this._readFileUsers();
      await this._writeFileUsers(users.filter((x) => x.username !== u));
    }
    this._cache = null;
  }

  async resetUsed(username) {
    const u = sanitizeUsername(username);
    const now = Date.now();
    const db = await this._getDb();
    if (db) {
      await db.collection(COLLECTION).updateOne(
        { username: u },
        { $set: { used: 0, updatedAt: now } }
      );
    } else {
      const users = await this._readFileUsers();
      const idx = users.findIndex((x) => x.username === u);
      if (idx < 0) throw new Error('用户不存在');
      users[idx].used = 0;
      users[idx].updatedAt = now;
      await this._writeFileUsers(users);
    }
    this._cache = null;
    return await this.getUser(u);
  }

  async setEnabled(username, enabled) {
    const u = sanitizeUsername(username);
    const existing = await this._findRaw(u);
    if (!existing) throw new Error('用户不存在');
    const now = Date.now();
    const db = await this._getDb();
    if (db) {
      await db.collection(COLLECTION).updateOne(
        { username: u },
        { $set: { enabled: enabled !== false, updatedAt: now } }
      );
    } else {
      const users = await this._readFileUsers();
      const idx = users.findIndex((x) => x.username === u);
      if (idx < 0) throw new Error('用户不存在');
      users[idx].enabled = enabled !== false;
      users[idx].updatedAt = now;
      await this._writeFileUsers(users);
    }
    this._cache = null;
    return await this.getUser(u);
  }

  _randomBootstrapPassword() {
    return crypto.randomBytes(12).toBase64().replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
  }

  async ensureDefaultUser(defaultUsername, defaultPassword, defaultQuota) {
    const u = sanitizeUsername(defaultUsername);
    const existing = await this._findRaw(u);
    if (existing) return;
    const pwd = normalizePassword(defaultPassword) || this._randomBootstrapPassword();
    await this.upsertUser({
      username: u,
      password: pwd,
      quota: defaultQuota
    });
    if (!normalizePassword(defaultPassword)) {
      RuntimeUtil.makeLog(
        'warn',
        `[lsy-Core] 已创建默认账号 "${u}"，未配置 defaultPassword，初始密码见下条 info 日志，请尽快修改`,
        'LsyUserStore'
      );
      RuntimeUtil.makeLog('info', `[lsy-Core] 默认账号 ${u} 初始密码: ${pwd}`, 'LsyUserStore');
    } else {
      RuntimeUtil.makeLog('info', `[lsy-Core] 已创建默认账号: ${u}`, 'LsyUserStore');
    }
  }
}

let instance = null;
export function getLsyUserStore() {
  if (!instance) instance = new LsyUserStore();
  return instance;
}
