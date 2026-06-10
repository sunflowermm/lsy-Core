import { saveChat, createChatId } from './chat-history.js';
import { runLsyAgent } from './lsy-agent-run.js';
import { getLsyLlmConfig } from './llm-config.js';
import { sanitizeToolArgs, blocksToTools } from './tool-summary.js';
import { writeSSEChunk, createOpenAIChunk } from '#utils/sse-openai.js';

function sseChunk(id, model, delta, finishReason = null, extra = {}) {
  return createOpenAIChunk({
    id,
    created: Math.floor(Date.now() / 1000),
    model,
    delta: delta || {},
    finishReason,
    extra
  });
}

function emitTools(res, id, model, tools) {
  if (!res || res.writableEnded || !tools?.length) return;
  writeSSEChunk(res, { ...sseChunk(id, model, {}), lsy_tools: tools });
}

function emitStreamError(res, id, model, message) {
  if (!res || res.writableEnded) return;
  writeSSEChunk(res, { ...sseChunk(id, model, {}), lsy_error: { message } });
}

function findToolBlock(blocks, tool) {
  if (tool.id) {
    const byId = blocks.find((b) => b.type === 'tool' && b.id === tool.id);
    if (byId) return byId;
  }
  return [...blocks].reverse().find(
    (b) => b.type === 'tool' && b.name === tool.name && b.status === 'running'
  );
}

function failRunningTools(tracker, res, id, modelName, reason) {
  const events = [];
  for (const block of tracker.blocks) {
    if (block.type !== 'tool' || block.status !== 'running') continue;
    block.status = 'done';
    block.ok = false;
    block.summary = reason;
    block.detail = reason;
    events.push({
      id: block.id,
      name: block.name,
      status: 'done',
      ok: false,
      summary: reason,
      detail: reason
    });
  }
  for (const t of tracker.toolsUsed) {
    if (t.status === 'running') {
      t.status = 'done';
      t.ok = false;
      t.summary = reason;
      t.detail = reason;
    }
  }
  if (events.length) emitTools(res, id, modelName, events);
}

function createStreamTracker(res, id, modelName) {
  const blocks = [];
  const toolsUsed = [];

  const appendText = (delta) => {
    if (!delta) return;
    const last = blocks.at(-1);
    if (last?.type === 'text') last.content += delta;
    else blocks.push({ type: 'text', content: delta });
  };

  return {
    blocks,
    toolsUsed,
    failRunning: (reason) => failRunningTools({ blocks, toolsUsed }, res, id, modelName, reason),
    onTextDelta: (delta) => appendText(delta),
    onToolStart: (tool) => {
      const block = {
        type: 'tool',
        id: tool.id || `${tool.name}-${Date.now()}`,
        name: tool.name,
        status: 'running',
        args: tool.args || {}
      };
      blocks.push(block);
      toolsUsed.push({ ...block });
      if (res) {
        emitTools(res, id, modelName, [{
          id: block.id,
          name: block.name,
          status: 'running',
          args: block.args
        }]);
      }
    },
    onToolUse: (tool) => {
      const hit = findToolBlock(blocks, tool);
      if (hit) {
        hit.status = 'done';
        hit.ok = tool.ok !== false;
        hit.summary = tool.summary || '';
        hit.detail = tool.detail || '';
      }
      const tHit = toolsUsed.find((t) => t.id === hit?.id)
        || toolsUsed.find((t) => t.name === tool.name && t.status === 'running');
      if (tHit) {
        tHit.status = 'done';
        tHit.ok = tool.ok !== false;
        tHit.summary = tool.summary || '';
        tHit.detail = tool.detail || '';
      }
      if (res) {
        emitTools(res, id, modelName, [{
          id: hit?.id || tool.id,
          name: tool.name,
          status: 'done',
          ok: tool.ok !== false,
          summary: tool.summary,
          detail: tool.detail
        }]);
      }
    }
  };
}

function appendTruncationNote(tracker, total, writeDelta) {
  const note = '\n\n[已达工具轮次上限，回复可能不完整]';
  tracker.onTextDelta(note);
  writeDelta?.(note);
  return total + note;
}

export async function runLsyChat({ username, messages, chatId, title, stream, res }) {
  const llmCfg = await getLsyLlmConfig();
  const modelName = llmCfg.model;
  const id = `lsy_${Date.now()}`;

  const tracker = createStreamTracker(null, id, modelName);
  const hooks = {
    onToolStart: (tool) => {
      tool.args = sanitizeToolArgs(tool.name, tool.args || {});
      tracker.onToolStart(tool);
    },
    onToolUse: tracker.onToolUse
  };

  if (!stream) {
    let content;
    let truncated = false;
    try {
      ({ content, truncated } = await runLsyAgent({
        username,
        messages,
        ...hooks,
        onTextDelta: tracker.onTextDelta
      }));
    } catch (err) {
      tracker.failRunning(err.message || '执行失败');
      throw err;
    }
    if (truncated) {
      content = appendTruncationNote(tracker, content || '', null);
    }
    const cid = chatId || createChatId();
    await saveChat(username, cid, {
      title: title || String(messages.at(-1)?.content || '').slice(0, 40) || '新对话',
      messages: [
        ...messages,
        {
          role: 'assistant',
          content,
          blocks: tracker.blocks,
          tools: blocksToTools(tracker.blocks)
        }
      ]
    });
    return { content, chatId: cid, blocks: tracker.blocks, tools: blocksToTools(tracker.blocks) };
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const live = createStreamTracker(res, id, modelName);
  let total = '';
  let first = true;
  let clientGone = false;
  res.on('close', () => { clientGone = true; });

  try {
    const { content, truncated } = await runLsyAgent({
      username,
      messages,
      onToolStart: (tool) => {
        tool.args = sanitizeToolArgs(tool.name, tool.args || {});
        live.onToolStart(tool);
      },
      onToolUse: live.onToolUse,
      onTextDelta: (delta) => {
        if (!delta || clientGone) return;
        total += delta;
        live.onTextDelta(delta);
        writeSSEChunk(res, sseChunk(id, modelName, first ? { role: 'assistant', content: delta } : { content: delta }));
        first = false;
      }
    });

    if (!total && content) {
      total = content;
      if (!live.blocks.some((b) => b.type === 'text')) {
        live.blocks.push({ type: 'text', content: total });
      }
    }
    if (truncated) {
      total = appendTruncationNote(live, total, (note) => {
        writeSSEChunk(res, sseChunk(id, modelName, { content: note }));
      });
    }

    if (!clientGone) {
      writeSSEChunk(res, sseChunk(id, modelName, {}, 'stop'));
      writeSSEChunk(res, '[DONE]');
      res.end();
    }
  } catch (err) {
    const msg = err.message || '对话失败';
    live.failRunning(msg);
    if (!clientGone && !res.writableEnded) {
      emitStreamError(res, id, modelName, msg);
      writeSSEChunk(res, sseChunk(id, modelName, { content: `\n\n[错误] ${msg}` }));
      writeSSEChunk(res, sseChunk(id, modelName, {}, 'stop'));
      writeSSEChunk(res, '[DONE]');
      res.end();
    }
    if (!clientGone) throw err;
    return { chatId: chatId || null, content: total, aborted: true };
  }

  if (clientGone) return { chatId: chatId || null, content: total, aborted: true };

  const cid = chatId || createChatId();
  await saveChat(username, cid, {
    title: title || String(messages.at(-1)?.content || '').slice(0, 40) || '新对话',
    messages: [
      ...messages,
      {
        role: 'assistant',
        content: total,
        blocks: live.blocks,
        tools: blocksToTools(live.blocks)
      }
    ]
  });
  return { chatId: cid, content: total, blocks: live.blocks };
}
