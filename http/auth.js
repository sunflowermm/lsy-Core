import { HttpResponse } from '#utils/http-utils.js';

import { getLsyUserStore } from '../lib/user-store.js';

import { getLsySession, extractBearerToken } from '../lib/session.js';

import { ensureUserWorkspace } from '../lib/user-workspace.js';

import { getUsageInfo } from '../lib/usage-limiter.js';

import { ensureLsyInit } from '../lib/init.js';



export async function requireUser(req, res) {

  await ensureLsyInit();

  const token = extractBearerToken(req);

  const session = await getLsySession().verify(token);

  if (!session) {

    HttpResponse.unauthorized(res, '请先登录');

    return null;

  }

  const user = await getLsyUserStore().getUser(session.username);

  if (!user?.enabled) {

    HttpResponse.forbidden(res, '账号已禁用');

    return null;

  }

  await ensureUserWorkspace(session.username);

  return session;

}



export default {

  name: 'lsy-auth',

  dsc: '李诗雅 Agent 登录鉴权',

  priority: 90,



  routes: [

    {

      method: 'POST',

      path: '/api/lsy/login',

      systemAuth: false,

      handler: HttpResponse.asyncHandler(async (req, res) => {

        await ensureLsyInit();

        const { username, password } = req.body || {};

        if (!username || !password) {

          return HttpResponse.validationError(res, '请输入账号和密码');

        }

        const user = await getLsyUserStore().verifyPassword(username, password);

        if (!user) {

          return HttpResponse.unauthorized(res, '账号或密码错误');

        }

        await ensureUserWorkspace(user.username);

        const session = await getLsySession().create(user.username);

        HttpResponse.success(res, {

          token: session.token,

          expiresAt: session.expiresAt,

          user

        }, '登录成功');

      }, 'lsy.login')

    },



    {

      method: 'POST',

      path: '/api/lsy/logout',

      systemAuth: false,

      handler: HttpResponse.asyncHandler(async (req, res) => {

        await getLsySession().destroy(extractBearerToken(req));

        HttpResponse.success(res, null, '已退出');

      }, 'lsy.logout')

    },



    {

      method: 'GET',

      path: '/api/lsy/me',

      systemAuth: false,

      handler: HttpResponse.asyncHandler(async (req, res) => {

        const session = await requireUser(req, res);

        if (!session) return;

        const user = await getLsyUserStore().getUser(session.username);

        const usage = await getUsageInfo(session.username);

        HttpResponse.success(res, { user, usage, workspace: session.username });

      }, 'lsy.me')

    }

  ]

};

