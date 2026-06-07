import { getLsyUserStore } from './user-store.js';

async function loadUser(username) {
  const store = getLsyUserStore();
  const user = await store.getUser(username);
  if (!user) return { ok: false, error: '用户不存在', code: 401 };
  if (!user.enabled) return { ok: false, error: '账号已禁用', code: 403 };
  if (user.quota > 0 && user.used >= user.quota) {
    return {
      ok: false,
      error: `调用次数已用尽 (${user.used}/${user.quota})`,
      code: 429,
      remaining: 0,
      used: user.used,
      quota: user.quota
    };
  }
  const remaining = user.quota > 0 ? Math.max(0, user.quota - user.used) : -1;
  return { ok: true, used: user.used, remaining, quota: user.quota };
}

/** 仅检查配额，不扣减 */
export async function checkQuota(username) {
  return loadUser(username);
}

/** 对话成功后扣减一次 */
export async function consumeQuota(username) {
  const pre = await loadUser(username);
  if (!pre.ok) return pre;
  const store = getLsyUserStore();
  const used = await store.incrementUsed(username);
  const user = await store.getUser(username);
  const quota = user?.quota ?? pre.quota;
  const remaining = quota > 0 ? Math.max(0, quota - used) : -1;
  return { ok: true, used, remaining: remaining === Infinity ? -1 : remaining, quota };
}

/** @deprecated 请用 checkQuota + consumeQuota */
export async function checkAndConsumeQuota(username) {
  const pre = await checkQuota(username);
  if (!pre.ok) return pre;
  return consumeQuota(username);
}

export async function getUsageInfo(username) {
  const store = getLsyUserStore();
  const user = await store.getUser(username);
  if (!user) return null;
  return {
    quota: user.quota,
    used: user.used,
    remaining: user.quota > 0 ? Math.max(0, user.quota - user.used) : -1
  };
}
