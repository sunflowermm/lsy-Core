import { HttpResponse } from '#utils/http-utils.js';
import { getLsyUserStore } from '../lib/user-store.js';
import { getLsyConfig } from '../commonconfig/lsy.js';
import { ensureLsyInit } from '../lib/init.js';
import { readAuditTail } from '../lib/audit.js';
import { withAdminAuth } from '../lib/admin-auth.js';
import { getAdminStats, getUserWorkspaceSummary } from '../lib/admin-insights.js';

function adminRoute(method, path, handler, ctx) {
  return { method, path, systemAuth: false, handler: withAdminAuth(handler, ctx) };
}

export default {
  name: 'lsy-admin',
  dsc: '李诗雅 Agent 管理（须系统 API Key，默认不含 127 免鉴权）',
  priority: 91,

  routes: [
    adminRoute('GET', '/api/lsy/admin/stats', async (_req, res) => {
      await ensureLsyInit();
      const stats = await getAdminStats();
      HttpResponse.success(res, { stats });
    }, 'lsy.admin.stats'),

    adminRoute('GET', '/api/lsy/admin/users', async (_req, res) => {
      await ensureLsyInit();
      const users = await getLsyUserStore().listUsers();
      HttpResponse.success(res, { users });
    }, 'lsy.admin.list'),

    adminRoute('POST', '/api/lsy/admin/users', async (req, res) => {
      await ensureLsyInit();
      const { username, password, quota, enabled } = req.body || {};
      if (!username || password == null || String(password).trim() === '') {
        return HttpResponse.validationError(res, '用户名和密码必填');
      }
      const runtimeConfig = await getLsyConfig();
      const user = await getLsyUserStore().upsertUser({
        username,
        password,
        quota: quota ?? runtimeConfig.defaultQuota,
        enabled: enabled !== false
      });
      HttpResponse.success(res, { user }, '账号已保存');
    }, 'lsy.admin.create'),

    adminRoute('PUT', '/api/lsy/admin/users/:username', async (req, res) => {
      await ensureLsyInit();
      const { username } = req.params;
      const { password, quota, enabled } = req.body || {};
      const user = await getLsyUserStore().patchUser(username, { password, quota, enabled });
      HttpResponse.success(res, { user }, '已更新');
    }, 'lsy.admin.update'),

    adminRoute('DELETE', '/api/lsy/admin/users/:username', async (req, res) => {
      await ensureLsyInit();
      await getLsyUserStore().deleteUser(req.params.username);
      HttpResponse.success(res, null, '已删除');
    }, 'lsy.admin.delete'),

    adminRoute('POST', '/api/lsy/admin/users/:username/reset-used', async (req, res) => {
      await ensureLsyInit();
      const store = getLsyUserStore();
      const user = await store.resetUsed(req.params.username);
      if (!user) return HttpResponse.notFound(res, '用户不存在');
      HttpResponse.success(res, { user }, '已重置用量');
    }, 'lsy.admin.resetUsed'),

    adminRoute('GET', '/api/lsy/admin/users/:username/workspace', async (req, res) => {
      await ensureLsyInit();
      const store = getLsyUserStore();
      const user = await store.getUser(req.params.username);
      if (!user) return HttpResponse.notFound(res, '用户不存在');
      const workspace = await getUserWorkspaceSummary(req.params.username);
      HttpResponse.success(res, { user, workspace });
    }, 'lsy.admin.workspace'),

    adminRoute('GET', '/api/lsy/admin/users/:username/audit', async (req, res) => {
      await ensureLsyInit();
      const store = getLsyUserStore();
      const user = await store.getUser(req.params.username);
      if (!user) return HttpResponse.notFound(res, '用户不存在');
      const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
      const entries = await readAuditTail(req.params.username, limit);
      HttpResponse.success(res, { username: user.username, entries });
    }, 'lsy.admin.audit')
  ]
};
