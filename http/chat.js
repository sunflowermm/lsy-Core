import { HttpResponse } from '#utils/http-utils.js';
import { requireUser } from './auth.js';
import { checkQuota, consumeQuota, getUsageInfo } from '../lib/usage-limiter.js';
import { listChats, getChat, deleteChat } from '../lib/chat-history.js';
import { getLsyConfig } from '../commonconfig/lsy.js';
import { runLsyChat } from '../lib/chat-runner.js';
import { listAgentEndpoints } from '#utils/llm/agent-session.js';

export default {
  name: 'lsy-chat',
  dsc: '李诗雅 Agent 对话与历史',
  priority: 92,

  routes: [
    {
      method: 'GET',
      path: '/api/lsy/llm/endpoints',
      systemAuth: false,
      handler: HttpResponse.asyncHandler(async (req, res) => {
        const session = await requireUser(req, res);
        if (!session) return;
        HttpResponse.success(res, {
          endpoints: listAgentEndpoints({ protocol: 'anthropic', hasApiKey: true })
        });
      }, 'lsy.llm.endpoints')
    },

    {
      method: 'GET',
      path: '/api/lsy/chats',
      systemAuth: false,
      handler: HttpResponse.asyncHandler(async (req, res) => {
        const session = await requireUser(req, res);
        if (!session) return;
        HttpResponse.success(res, { chats: await listChats(session.username) });
      }, 'lsy.chats.list')
    },

    {
      method: 'GET',
      path: '/api/lsy/chats/:chatId',
      systemAuth: false,
      handler: HttpResponse.asyncHandler(async (req, res) => {
        const session = await requireUser(req, res);
        if (!session) return;
        const chat = await getChat(session.username, req.params.chatId);
        if (!chat) return HttpResponse.notFound(res, '对话不存在');
        HttpResponse.success(res, { chat });
      }, 'lsy.chats.get')
    },

    {
      method: 'DELETE',
      path: '/api/lsy/chats/:chatId',
      systemAuth: false,
      handler: HttpResponse.asyncHandler(async (req, res) => {
        const session = await requireUser(req, res);
        if (!session) return;
        await deleteChat(session.username, req.params.chatId);
        HttpResponse.success(res, null, '已删除');
      }, 'lsy.chats.delete')
    },

    {
      method: 'POST',
      path: '/api/lsy/chat/completions',
      systemAuth: false,
      handler: HttpResponse.asyncHandler(async (req, res) => {
        const session = await requireUser(req, res);
        if (!session) return;

        if ((await getLsyConfig()).enabled === false) {
          return HttpResponse.error(res, new Error('李诗雅 Agent 已禁用'), 503, 'lsy.chat');
        }

        const quota = await checkQuota(session.username);
        if (!quota.ok) {
          return res.status(quota.code || 429).json({ success: false, message: quota.error, usage: quota });
        }

        const { messages, chatId, title, stream: wantStream = true } = req.body || {};
        if (!Array.isArray(messages) || !messages.length) {
          return HttpResponse.validationError(res, 'messages 不能为空');
        }

        try {
          const result = await runLsyChat({
            username: session.username,
            messages,
            chatId,
            title,
            stream: wantStream,
            res: wantStream ? res : null
          });
          await consumeQuota(session.username);
          if (!wantStream) {
            return HttpResponse.success(res, { ...result, usage: await getUsageInfo(session.username) });
          }
        } catch (err) {
          if (!res.headersSent) {
            return HttpResponse.error(res, err, 500, 'lsy.chat');
          }
          const id = `lsy_${Date.now()}`;
          res.write(`data: ${JSON.stringify({
            id,
            lsy_error: { message: err.message || '对话失败' },
            lsy_tools: [{ name: '_', status: 'done', ok: false, summary: '失败', detail: err.message }]
          })}\n\n`);
          res.write(`data: ${JSON.stringify({ id, choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();
        }
      }, 'lsy.chat.completions')
    }
  ]
};
