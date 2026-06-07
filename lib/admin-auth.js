import crypto from 'crypto';
import { HttpResponse } from '#utils/http-utils.js';
import { isLoopback127Connection } from '#infrastructure/http/auth.js';
import { getLsyConfig } from '../commonconfig/lsy.js';

function extractClientApiKey(req) {
  const h = req?.headers || {};
  const fromHeader = h['x-api-key'] || h['api-key'];
  if (fromHeader) return String(fromHeader).trim();
  const auth = String(h.authorization || '');
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  const q = req?.query?.api_key || req?.query?.apiKey;
  if (q) return String(q).trim();
  return '';
}

function keysMatch(clientKey, serverKey) {
  const a = Buffer.from(String(clientKey));
  const b = Buffer.from(String(serverKey));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * 李诗雅管理 API 鉴权：默认必须携带有效系统 API Key（不受 127 回环免鉴权影响）。
 * 仅当 lsy.yaml → admin.allowLoopbackBypass: true 时，127.* 可走 Bot 全局鉴权逻辑。
 * @returns {object|undefined} 拒绝时返回 HttpResponse 结果
 */
export async function requireAdminApiKey(req, res, bot) {
  const cfg = await getLsyConfig();
  if (cfg.admin?.allowLoopbackBypass === true && bot?.checkApiAuthorization?.(req)) {
    return undefined;
  }

  const serverKey = bot?.apiKey;
  if (!serverKey) {
    return HttpResponse.error(
      res,
      new Error('服务端未加载系统 API Key，请检查 config/server_config/api_key.json'),
      503,
      'lsy.admin.auth'
    );
  }

  const clientKey = extractClientApiKey(req);
  if (!clientKey) {
    const remote = req.socket?.remoteAddress || req.ip || '';
    const hint = isLoopback127Connection(remote)
      ? '即使本机访问，李诗雅管理台也需填写系统 API Key'
      : '请提供系统 API Key（X-API-Key 或 Authorization: Bearer）';
    return HttpResponse.unauthorized(res, hint);
  }

  if (!keysMatch(clientKey, serverKey)) {
    return HttpResponse.unauthorized(res, 'API Key 无效');
  }
  return undefined;
}

export function withAdminAuth(handler, context = 'lsy.admin') {
  return HttpResponse.asyncHandler(async (req, res, bot) => {
    const denied = await requireAdminApiKey(req, res, bot);
    if (denied) return denied;
    return handler(req, res, bot);
  }, context);
}
