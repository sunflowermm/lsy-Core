const SLASH_COMMANDS = [
  { cmd: '/read', desc: '读取工作区文件', template: '请读取并总结 uploads/ 下的文件：' },
  { cmd: '/doc', desc: '生成 docx', template: '生成文档到 output/：先 write output/标题.md，再 export_doc 导出 docx，并告知下载路径。主题：' },
  { cmd: '/convert', desc: '文档转 txt', template: '将 uploads/ 中的 docx 用 convert_document 转为 txt 并总结：' },
  { cmd: '/search', desc: '网页搜索', template: '搜索并总结：' },
  { cmd: '/code', desc: '写代码/改项目', template: '在工作区中完成以下编程任务：\n1. list_files 了解结构\n2. read 相关文件\n3. write/run 实现\n4. 运行测试验证\n\n任务：' },
  { cmd: '/run', desc: '执行命令', template: '在工作区执行并解释结果：' },
  { cmd: '/clone', desc: '克隆仓库（需管理员开启）', template: '若 gh_clone 可用，克隆到 project/ 并分析：' },
  { cmd: '/analyze', desc: '分析上传文档', template: '分析 uploads/ 中最新上传的文件：先 convert_document（如需要）再 read，给出要点。' },
  { cmd: '/image', desc: '识图分析', template: '请用 view_image 分析 uploads/ 中的图片并总结：' }
];

const API = '';
const TOKEN_KEY = 'lsy_token';

const $ = (sel) => document.querySelector(sel);
const loginView = $('#login-view');
const appView = $('#app-view');
const messagesEl = $('#messages');
const chatListEl = $('#chat-list');
const fileListEl = $('#file-list');
const chatTitleEl = $('#chat-title');
const inputEl = $('#input');
const composer = $('#composer');
const sendBtn = $('#send-btn');
const usageBadge = $('#usage-badge');
const cmdPanel = $('#cmd-panel');
const cmdGrid = $('#cmd-grid');

let token = localStorage.getItem(TOKEN_KEY);
let currentChatId = null;
let messages = [];
let streaming = false;
let msgNodes = [];
let streamAbort = null;
let openToolBlockId = null;
const { showToast, setStatus } = window.LsyUi || {};

function headers(extra = {}) {
  const h = { Authorization: `Bearer ${token}`, ...extra };
  if (!h['Content-Type'] && !(extra instanceof FormData)) {
    h['Content-Type'] = 'application/json';
  }
  return h;
}

async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, { ...opts, headers: headers(opts.headers) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || `HTTP ${res.status}`);
  const { success, message, ...payload } = json;
  return payload;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const { toolLabel, renderAuditHtml, renderToolChipHtml, renderToolDetailHtml } = window.LsyAudit || {};

function ensureBlocks(m) {
  if (m.blocks?.length) return m.blocks;
  const blocks = [];
  for (const [i, t] of (m.tools || []).entries()) {
    blocks.push({
      type: 'tool',
      id: t.id || `legacy-${i}`,
      name: t.name,
      status: t.status || 'done',
      ok: t.ok !== false,
      summary: t.summary || '',
      detail: t.detail || '',
      args: t.args || {}
    });
  }
  if (m.content) blocks.push({ type: 'text', content: m.content });
  m.blocks = blocks;
  return blocks;
}

function findToolBlock(blocks, t) {
  if (t.id) {
    const byId = blocks.find((b) => b.type === 'tool' && b.id === t.id);
    if (byId) return byId;
  }
  return [...blocks].reverse().find(
    (b) => b.type === 'tool' && b.name === t.name && b.status === 'running'
  );
}

function renderMessageBody(m) {
  ensureBlocks(m);
  const hasBody = m.blocks.some((b) => (b.type === 'text' && b.content) || b.type === 'tool');
  if (m.thinking && !hasBody) {
    return '<div class="msg-blocks"><div class="msg-content thinking-line">思考中…</div></div>';
  }
  let toolIdx = 0;
  const parts = m.blocks.map((b) => {
    if (b.type === 'text') return renderContent(b.content);
    if (b.type === 'tool') {
      const chip = renderToolChipHtml
        ? renderToolChipHtml(b, toolIdx++)
        : `<span class="tool-chip">${escapeHtml(toolLabel?.(b.name) ?? b.name)}</span>`;
      return `<div class="block-tool">${chip}</div>`;
    }
    return '';
  });
  return `<div class="msg-blocks">${parts.join('')}</div>`;
}

function bindToolChipHandlers(bubble, m) {
  bubble.querySelectorAll('.tool-chip-btn').forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.toolId;
      const block = ensureBlocks(m).find((b) => b.type === 'tool' && b.id === id);
      showToolDetail(block);
    };
  });
}

function showToolDetail(block) {
  const dlg = $('#tool-dialog');
  const wrap = $('#tool-detail');
  if (!block || !dlg || !wrap) return;
  openToolBlockId = block.id || null;
  wrap.innerHTML = renderToolDetailHtml
    ? renderToolDetailHtml(block)
    : `<p>${escapeHtml(toolLabel?.(block.name) ?? block.name)}</p>`;
  dlg.showModal();
}

function refreshOpenToolDetail() {
  if (!openToolBlockId || !$('#tool-dialog')?.open) return;
  const m = messages.at(-1);
  if (!m) return;
  const block = ensureBlocks(m).find((b) => b.type === 'tool' && b.id === openToolBlockId);
  if (block) showToolDetail(block);
}

function finalizeRunningTools(m, reason = '已中断') {
  ensureBlocks(m);
  for (const b of m.blocks) {
    if (b.type === 'tool' && b.status === 'running') {
      b.status = 'done';
      b.ok = false;
      b.summary = reason;
      b.detail = reason;
    }
  }
  for (const t of m.tools || []) {
    if (t.status === 'running') {
      t.status = 'done';
      t.ok = false;
      t.summary = reason;
    }
  }
}

function clearThinking(m) {
  if (m?.thinking) m.thinking = false;
}

function renderContent(text) {
  if (!text) return '';
  const body = window.LsyMarkdown?.render?.(text);
  if (body != null) return `<div class="msg-content md-body">${body}</div>`;
  return `<div class="msg-content">${escapeHtml(text).replace(/\n/g, '<br>')}</div>`;
}

function appendTextBlock(m, delta) {
  if (!delta) return;
  ensureBlocks(m);
  m.content = (m.content || '') + delta;
  const last = m.blocks.at(-1);
  if (last?.type === 'text') last.content += delta;
  else m.blocks.push({ type: 'text', content: delta });
}

function showLogin() {
  loginView.classList.remove('hidden');
  appView.classList.add('hidden');
}

function showApp() {
  loginView.classList.add('hidden');
  appView.classList.remove('hidden');
  renderCommands();
}

function renderCommands() {
  cmdGrid.innerHTML = SLASH_COMMANDS.map((c) =>
    `<button type="button" class="cmd-chip" data-template="${encodeURIComponent(c.template)}">
      <strong>${c.cmd}</strong><span>${c.desc}</span>
    </button>`
  ).join('');
  cmdGrid.querySelectorAll('.cmd-chip').forEach((btn) => {
    btn.onclick = () => {
      inputEl.value = decodeURIComponent(btn.dataset.template);
      inputEl.focus();
    };
  });
}

function renderEmptyState() {
  messagesEl.innerHTML = `
    <div class="empty-state">
      <strong>李诗雅</strong>
      <p>上传文件到工作区，或用斜杠指令开始任务</p>
      <p class="hint">Agent 会调用工具读写你的工作区，而非仅聊天</p>
    </div>`;
  msgNodes = [];
}

function buildMsgNode(m, idx) {
  const div = document.createElement('div');
  div.className = `msg ${m.role}${m.thinking ? ' thinking' : ''}`;
  div.dataset.idx = String(idx);
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  if (m.role === 'assistant') {
    bubble.innerHTML = renderMessageBody(m);
    bindToolChipHandlers(bubble, m);
  } else {
    bubble.textContent = m.content;
  }
  div.appendChild(bubble);
  return div;
}

function renderMessages(full = true) {
  if (!messages.length && !streaming) {
    renderEmptyState();
    return;
  }
  if (full) {
    messagesEl.innerHTML = '';
    msgNodes = messages.map((m, i) => {
      const node = buildMsgNode(m, i);
      messagesEl.appendChild(node);
      return node;
    });
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function updateLastAssistant() {
  const m = messages.at(-1);
  if (!m || m.role !== 'assistant') return;
  let node = msgNodes.at(-1);
  if (!node || node.dataset.idx !== String(messages.length - 1)) {
    node = buildMsgNode(m, messages.length - 1);
    const empty = messagesEl.querySelector('.empty-state');
    if (empty) empty.remove();
    messagesEl.appendChild(node);
    msgNodes.push(node);
  }
  const bubble = node.querySelector('.bubble');
  node.classList.toggle('thinking', Boolean(m.thinking));
  bubble.innerHTML = renderMessageBody(m);
  bindToolChipHandlers(bubble, m);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function applyToolEvent(tools) {
  if (!tools?.length) return;
  const m = messages.at(-1);
  if (!m || m.role !== 'assistant') return;
  ensureBlocks(m);
  m.tools = m.tools || [];
  for (const t of tools) {
    if (t.status === 'running') {
      clearThinking(m);
      const block = {
        type: 'tool',
        id: t.id || `${t.name}-${Date.now()}`,
        name: t.name,
        status: 'running',
        args: t.args || {},
        ok: null
      };
      m.blocks.push(block);
      m.tools.push({ id: block.id, name: t.name, status: 'running' });
    } else if (t.status === 'done') {
      const hit = findToolBlock(m.blocks, t);
      if (hit) {
        hit.status = 'done';
        hit.ok = t.ok !== false;
        hit.summary = t.summary || '';
        hit.detail = t.detail || '';
      }
      const tHit = m.tools.find((x) => x.id === hit?.id)
        || m.tools.find((x) => x.name === t.name && x.status === 'running');
      if (tHit) {
        tHit.status = 'done';
        tHit.ok = t.ok !== false;
        tHit.summary = t.summary;
        tHit.detail = t.detail;
      } else {
        m.tools.push({
          id: t.id,
          name: t.name,
          status: 'done',
          ok: t.ok !== false,
          summary: t.summary,
          detail: t.detail
        });
      }
    }
  }
  updateLastAssistant();
  refreshOpenToolDetail();
}

function renderChatList(chats) {
  chatListEl.innerHTML = '';
  if (!chats?.length) {
    chatListEl.innerHTML = '<div class="sidebar-empty">暂无对话 · 点击 ＋ 开始</div>';
    return;
  }
  for (const c of chats) {
    const item = document.createElement('div');
    item.className = `chat-item${c.id === currentChatId ? ' active' : ''}`;
    item.textContent = c.title || '新对话';
    item.title = c.title || '新对话';
    item.onclick = () => loadChat(c.id);
    chatListEl.appendChild(item);
  }
  const active = chatListEl.querySelector('.chat-item.active');
  active?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

const FILE_SECTIONS = [
  { dir: 'output', label: 'output' },
  { dir: 'uploads', label: 'uploads' },
  { dir: 'project', label: 'project' }
];

function renderFiles(files) {
  const all = (files || []).filter((f) => f.type === 'file');
  if (!all.length) {
    fileListEl.innerHTML = '<div class="file-empty">暂无文件 · 上传用 ↑ · AI 生成物在 output/</div>';
    return;
  }
  const parts = [];
  for (const { dir, label } of FILE_SECTIONS) {
    const items = all.filter((f) => f.path.startsWith(`${dir}/`));
    if (!items.length) continue;
    parts.push(`<div class="file-group-label">${label}/</div>`);
    for (const f of items) {
      const name = f.path.replace(new RegExp(`^${dir}/`), '');
      parts.push(
        `<button type="button" class="file-item file-dl" data-path="${escapeHtml(f.path)}" title="点击下载 ${escapeHtml(f.path)}">${escapeHtml(name)}</button>`
      );
    }
  }
  fileListEl.innerHTML = parts.join('');
  fileListEl.querySelectorAll('.file-dl').forEach((btn) => {
    btn.onclick = () => downloadWorkspaceFile(btn.dataset.path).catch((err) => showToast?.(err.message, true));
  });
}

async function downloadWorkspaceFile(relPath) {
  const res = await fetch(`${API}/api/lsy/files/download?path=${encodeURIComponent(relPath)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || '下载失败');
  }
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = relPath.split('/').pop() || 'download';
  a.click();
  URL.revokeObjectURL(a.href);
}

async function loadFiles() {
  try {
    const { files } = await api('/api/lsy/files');
    renderFiles(files);
  } catch (err) {
    fileListEl.innerHTML = `<div class="file-empty">加载失败 · <button type="button" class="link-btn" id="files-retry">重试</button></div>`;
    $('#files-retry')?.addEventListener('click', loadFiles);
    showToast?.(err.message || '工作区加载失败', true);
  }
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp)$/i;

async function uploadFiles(fileList) {
  if (!fileList?.length) return;
  if (streaming) {
    showToast?.('请等待当前回复完成后再上传', true);
    return;
  }
  for (const f of fileList) {
    if (IMAGE_EXT_RE.test(f.name) && f.size > MAX_IMAGE_BYTES) {
      showToast?.(`图片「${f.name}」超过 8MB，请压缩后上传（识图上限）`, true);
      return;
    }
  }
  const input = $('#file-input');
  setStatus?.('上传中…', 'busy');
  try {
    const fd = new FormData();
    for (const f of fileList) fd.append('files', f);
    const res = await fetch(`${API}/api/lsy/files/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || '上传失败');
    await loadFiles();
    const names = (data.files || []).map((f) => f.path).join('、');
    if (names) {
      const hasImage = (data.files || []).some((f) => /\.(png|jpe?g|gif|webp|bmp)$/i.test(f.path || ''));
      let hint = `我已上传：${names}，请分析这些文件。`;
      if (hasImage) hint += ' 图片请用 view_image 识图，不要用 read。';
      inputEl.value = (inputEl.value ? inputEl.value + '\n' : '') + hint;
    }
    showToast?.('上传成功');
  } catch (err) {
    showToast?.(err.message, true);
  } finally {
    if (input) input.value = '';
    setStatus?.('');
  }
}

async function refreshUsage() {
  const { usage: u } = await api('/api/lsy/me');
  usageBadge.textContent = u.remaining === -1
    ? `已用 ${u.used} 次 · 无限制`
    : `剩余 ${u.remaining} / ${u.quota} 次`;
}

async function loadChats() {
  const { chats } = await api('/api/lsy/chats');
  renderChatList(chats || []);
}

async function loadChat(id) {
  try {
    const { chat } = await api(`/api/lsy/chats/${id}`);
    currentChatId = chat.id;
    messages = (chat.messages || []).map((m) => ({
      ...m,
      tools: Array.isArray(m.tools) ? m.tools : [],
      blocks: Array.isArray(m.blocks) ? m.blocks : undefined
    }));
    chatTitleEl.textContent = chat.title || '对话';
    renderMessages(true);
    await loadChats();
  } catch (err) {
    showToast?.(err.message || '加载对话失败', true);
  }
}

function newChat() {
  currentChatId = null;
  messages = [];
  chatTitleEl.textContent = '新对话';
  renderMessages(true);
  loadChats();
}

async function streamChat(userMsg) {
  if (streaming) return;
  streaming = true;
  sendBtn.disabled = true;
  inputEl.disabled = true;
  streamAbort = new AbortController();
  setStatus?.('思考中…', 'busy');
  $('#stop-btn')?.classList.remove('hidden');

  messages.push({ role: 'user', content: userMsg });
  messages.push({ role: 'assistant', content: '', tools: [], blocks: [], thinking: true });
  renderMessages(true);

  const assistant = messages.at(-1);

  try {
    const res = await fetch(`${API}/api/lsy/chat/completions`, {
      method: 'POST',
      headers: headers(),
      signal: streamAbort.signal,
      body: JSON.stringify({
        messages: messages.slice(0, -1).map((m) => ({ role: m.role, content: m.content })),
        chatId: currentChatId,
        stream: true
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (res.status === 429 && err.usage) {
        usageBadge.textContent = `剩余 0 / ${err.usage.quota ?? '?'} 次`;
      }
      throw new Error(err.message || `HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') continue;
        try {
          const json = JSON.parse(payload);
          if (json.lsy_error) {
            throw new Error(json.lsy_error.message || '对话失败');
          }
          if (json.lsy_tools) {
            applyToolEvent(json.lsy_tools);
            const running = assistant.blocks?.filter((b) => b.type === 'tool' && b.status === 'running').length;
            if (running) setStatus?.(`正在调用工具 (${running})…`, 'busy');
            continue;
          }
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            clearThinking(assistant);
            appendTextBlock(assistant, delta);
            setStatus?.('');
            updateLastAssistant();
          }
        } catch (e) {
          if (e instanceof SyntaxError) continue;
          throw e;
        }
      }
    }

    clearThinking(assistant);
    if (assistant.blocks?.some((b) => b.type === 'tool' && b.status === 'running')) {
      finalizeRunningTools(assistant, '连接中断');
    }

    await loadChats();
    if (!currentChatId) {
      const { chats } = await api('/api/lsy/chats');
      if (chats?.[0]) {
        currentChatId = chats[0].id;
        chatTitleEl.textContent = chats[0].title || '对话';
      }
    }
    await Promise.all([refreshUsage(), loadFiles()]);
  } catch (err) {
    if (err.name === 'AbortError') {
      finalizeRunningTools(assistant, '已停止');
      assistant.content = (assistant.content || '') + (assistant.content ? '\n\n' : '') + '[已停止生成]';
    } else {
      finalizeRunningTools(assistant, '失败');
      assistant.content = (assistant.content || '') + (assistant.content ? '\n\n' : '') + `[错误] ${err.message}`;
      showToast?.(err.message, true);
      setStatus?.(err.message, 'error');
    }
    clearThinking(assistant);
    updateLastAssistant();
  } finally {
    streaming = false;
    sendBtn.disabled = false;
    inputEl.disabled = false;
    streamAbort = null;
    $('#stop-btn')?.classList.add('hidden');
    setStatus?.('');
  }
}

function handleSlashInput() {
  const v = inputEl.value;
  if (v === '/') {
    cmdPanel.classList.remove('hidden');
    return;
  }
  if (!v.startsWith('/')) cmdPanel.classList.add('hidden');
  const match = SLASH_COMMANDS.find((c) => v.startsWith(c.cmd + ' ') || v === c.cmd);
  if (match && v === match.cmd) {
    inputEl.value = match.template;
  }
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = $('#login-error');
  const submitBtn = $('#login-form button[type="submit"]');
  errEl.classList.add('hidden');
  submitBtn.disabled = true;
  submitBtn.textContent = '登录中…';
  try {
    const { token: loginToken } = await api('/api/lsy/login', {
      method: 'POST',
      body: JSON.stringify({ username: $('#username').value.trim(), password: $('#password').value })
    });
    token = loginToken;
    localStorage.setItem(TOKEN_KEY, token);
    showApp();
    await Promise.all([loadChats(), loadFiles(), refreshUsage()]);
    renderMessages(true);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '进入';
  }
});

composer.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (streaming) return;
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = '';
  inputEl.style.height = 'auto';
  cmdPanel.classList.add('hidden');
  await streamChat(text);
});

inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    composer.requestSubmit();
  }
});
inputEl.addEventListener('input', () => {
  handleSlashInput();
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 160) + 'px';
});

$('#new-chat').onclick = newChat;
$('#logout').onclick = () => { localStorage.removeItem(TOKEN_KEY); token = null; showLogin(); };
$('#toggle-cmds').onclick = () => cmdPanel.classList.toggle('hidden');
$('#file-input').onchange = (e) => uploadFiles(e.target.files);
$('#upload-trigger').onclick = () => { if (!streaming) $('#file-input').click(); };

const agentsDialog = $('#agents-dialog');
const agentsEditor = $('#agents-editor');

async function openAgentsEditor() {
  try {
    const { content } = await api('/api/lsy/workspace/agents');
    agentsEditor.value = content || '';
    agentsDialog.showModal();
  } catch (err) {
    showToast?.(err.message, true);
  }
}

async function saveAgents() {
  const btn = $('#agents-save');
  btn.disabled = true;
  btn.textContent = '保存中…';
  try {
    await api('/api/lsy/workspace/agents', {
      method: 'PUT',
      body: JSON.stringify({ content: agentsEditor.value })
    });
    agentsDialog.close();
    showToast?.('规则已保存');
  } catch (err) {
    showToast?.(err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = '保存';
  }
}

async function openAuditViewer() {
  const listEl = $('#audit-list');
  listEl.innerHTML = '<div class="audit-empty">加载中…</div>';
  $('#audit-dialog').showModal();
  try {
    const { entries } = await api('/api/lsy/workspace/audit?limit=50');
    listEl.innerHTML = renderAuditHtml ? renderAuditHtml(entries || []) : '<div class="audit-empty">审计模块未加载</div>';
  } catch (err) {
    listEl.innerHTML = `<div class="audit-empty">${escapeHtml(err.message)}</div>`;
  }
}

$('#edit-agents').onclick = openAgentsEditor;
$('#view-audit').onclick = openAuditViewer;
$('#agents-cancel').onclick = () => agentsDialog.close();
agentsDialog.querySelector('form').addEventListener('submit', (e) => {
  e.preventDefault();
  saveAgents();
});
$('#audit-close').onclick = () => $('#audit-dialog').close();
$('#tool-close').onclick = () => { openToolBlockId = null; $('#tool-dialog').close(); };
$('#tool-dialog')?.addEventListener('cancel', (e) => {
  e.preventDefault();
  openToolBlockId = null;
  $('#tool-dialog').close();
});

function toggleSidebar(open) {
  const sidebar = document.querySelector('.sidebar');
  const overlay = $('#sidebar-overlay');
  const show = open ?? !sidebar?.classList.contains('open');
  sidebar?.classList.toggle('open', show);
  overlay?.classList.toggle('show', show);
}

$('#sidebar-toggle')?.addEventListener('click', () => toggleSidebar());
$('#sidebar-overlay')?.addEventListener('click', () => toggleSidebar(false));
$('#stop-btn')?.addEventListener('click', () => {
  if (streamAbort) streamAbort.abort();
});

async function boot() {
  if (!token) return showLogin();
  try {
    await api('/api/lsy/me');
    showApp();
    await Promise.all([loadChats(), loadFiles(), refreshUsage()]);
    renderMessages(true);
  } catch (err) {
    localStorage.removeItem(TOKEN_KEY);
    token = null;
    showLogin();
    const errEl = $('#login-error');
    if (errEl && err.message) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  }
}

boot();
