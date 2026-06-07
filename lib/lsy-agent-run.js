import { createAgentSession } from '#utils/llm/agent-session.js';
import { getLsyConfig } from '../commonconfig/lsy.js';
import { getLsyLlmConfig } from './llm-config.js';
import { prepareChatMessages, refreshAgentSystemPrompt } from './agent-context.js';
import {
  listLsyAnthropicTools,
  executeLsyTool,
  toolResultContent
} from './lsy-tools.js';
import { sanitizeToolArgs, summarizeToolUse } from './tool-summary.js';

export async function runLsyAgent({ username, messages, onTextDelta, onToolStart, onToolUse }) {
  const lsyCfg = await getLsyConfig();
  const llmCfg = await getLsyLlmConfig();
  const tools = listLsyAnthropicTools({ allowGhClone: lsyCfg.tools?.allowGhClone === true });
  const anthMessages = await prepareChatMessages(username, messages);
  const ctx = { e: { user_id: username, lsy_username: username } };

  let truncated = false;
  const session = await createAgentSession({
    provider: llmCfg.provider,
    tools,
    maxToolRounds: llmCfg.maxToolRounds,
    onBeforeRound: async (currentMessages) => {
      await refreshAgentSystemPrompt(currentMessages, username);
    },
    onTruncated: () => { truncated = true; },
    toolExecutor: async (toolUses) => {
      const results = [];
      for (const tu of toolUses) {
        const input = tu.input || {};
        onToolStart?.({ id: tu.id, name: tu.name, args: sanitizeToolArgs(tu.name, input) });
        const result = await executeLsyTool(tu.name, input, ctx);
        onToolUse?.({ id: tu.id, name: tu.name, ...summarizeToolUse(tu.name, input, result) });
        results.push({ tool_use_id: tu.id, content: toolResultContent(result) });
      }
      return results;
    },
  });

  const content = await session.chatStream(anthMessages, (delta) => onTextDelta?.(delta));
  return { content, messages: anthMessages, truncated };
}
