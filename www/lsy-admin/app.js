const API_KEY_STORAGE = 'lsy_admin_api_key';
let apiKey = sessionStorage.getItem(API_KEY_STORAGE) || '';

const authPanel = document.getElementById('auth-panel');
const mainPanel = document.getElementById('main-panel');
const userTable = document.querySelector('#user-table tbody');
const editDialog = document.getElementById('edit-dialog');
const editForm = document.getElementById('edit-form');
const detailDialog = document.getElementById('detail-dialog');
const formError = document.getElementById('form-error');
const saveBtn = editForm.querySelector('button[type="submit"]');
const usernameHint = document.getElementById('username-hint');
const { renderAuditHtml, escapeHtml } = window.LsyAudit || {};

let editingUsername = null;
const { showToast: uiToast } = window.LsyUi || {};
const authBtn = document.getElementById('auth-btn');

function adminHeaders(extra = {}) {
  const h = { 'Content-Type': 'application/json', ...extra };
  if (apiKey) {
    h['X-API-Key'] = apiKey;
    h['Authorization'] = `Bearer ${apiKey}`;
  }
  return h;
}

async function adminFetch(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { ...adminHeaders(), ...opts.headers }
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || `HTTP ${res.status}`);
  const { success, message, ...payload } = json;
  return payload;
}

function toast(text, isError = false) {
  if (uiToast) uiToast(text, isError);
  else alert(text);
}

function showMain() {
  authPanel.classList.add('hidden');
  mainPanel.classList.remove('hidden');
  document.getElementById('logout-btn').classList.remove('hidden');
}

function showAuth(errMsg = '') {
  authPanel.classList.remove('hidden');
  mainPanel.classList.add('hidden');
  document.getElementById('logout-btn').classList.add('hidden');
  const errEl = document.getElementById('auth-error');
  if (errMsg) {
    errEl.textContent = errMsg;
    errEl.classList.remove('hidden');
  } else {
    errEl.classList.add('hidden');
  }
}

function switchTab(name) {
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.tab === name);
  });
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.add('hidden'));
  document.getElementById(`tab-${name}`).classList.remove('hidden');
}

function renderStats(stats) {
  const s = stats || {};
  const cards = [
    { label: '总用户', value: s.totalUsers ?? 0 },
    { label: '启用', value: s.enabledUsers ?? 0 },
    { label: '禁用', value: s.disabledUsers ?? 0 },
    { label: '总调用', value: s.totalUsed ?? 0 },
    { label: '配额用尽', value: s.usersAtLimit ?? 0 }
  ];
  document.getElementById('stat-grid').innerHTML = cards.map((c) =>
    `<div class="stat-card ink-card"><span class="stat-val">${c.value}</span><span class="stat-label">${c.label}</span></div>`
  ).join('');
}

function renderKv(el, rows) {
  el.innerHTML = rows.map(([k, v]) =>
    `<dt>${escapeHtml ? escapeHtml(k) : k}</dt><dd>${escapeHtml ? escapeHtml(String(v)) : v}</dd>`
  ).join('');
}

async function loadOverview() {
  const { stats } = await adminFetch('/api/lsy/admin/stats');
  renderStats(stats);
  const cfg = stats?.service || {};
  renderKv(document.getElementById('service-kv'), [
    ['服务', cfg.enabled ? '已启用' : '已停用'],
    ['LLM 端点', cfg.llm?.provider || '—'],
    ['模型', cfg.llm?.model || '—'],
    ['LLM 就绪', cfg.llm?.configured ? '是' : '否'],
    ['默认配额', cfg.defaultQuota ?? '—'],
    ['默认账号', cfg.defaultUsername || '—'],
    ['搜索引擎', cfg.search?.provider || '—'],
    ['gh_clone', cfg.tools?.allowGhClone ? '已开启' : '已关闭'],
    ['127 免 Key', cfg.admin?.allowLoopbackBypass ? '已开启' : '已关闭']
  ]);
}

function renderUsers(users) {
  const list = Array.isArray(users) ? users : [];
  userTable.innerHTML = '';
  if (!list.length) {
    userTable.innerHTML = '<tr><td colspan="6" class="hint" style="padding:1rem">暂无用户</td></tr>';
    return;
  }
  for (const u of list) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><button type="button" class="link-name" data-action="detail" data-user="${u.username}">${u.username}</button></td>
      <td>${u.quota === 0 ? '无限制' : u.quota}</td>
      <td>${u.used ?? 0}</td>
      <td>${u.quota === 0 ? '∞' : u.remaining}</td>
      <td class="${u.enabled ? 'badge-ok' : 'badge-off'}">${u.enabled ? '启用' : '禁用'}</td>
      <td class="actions">
        <button data-action="edit" data-user="${u.username}">编辑</button>
        <button data-action="reset" data-user="${u.username}">重置用量</button>
        <button data-action="delete" data-user="${u.username}" class="danger">删除</button>
      </td>
    `;
    userTable.appendChild(tr);
  }
}

async function loadUsers() {
  const { users } = await adminFetch('/api/lsy/admin/users');
  renderUsers(users);
}

function setFormError(msg = '') {
  if (!msg) {
    formError.textContent = '';
    formError.classList.add('hidden');
    return;
  }
  formError.textContent = msg;
  formError.classList.remove('hidden');
}

function openDialog(user = null) {
  editingUsername = user?.username || null;
  document.getElementById('dialog-title').textContent = editingUsername
    ? `编辑 · ${editingUsername}`
    : '新建账号';
  editForm.username.value = editingUsername || '';
  editForm.username.disabled = !!editingUsername;
  usernameHint.classList.toggle('hidden', !editingUsername);
  editForm.password.value = '';
  editForm.password.required = !editingUsername;
  editForm.quota.value = user?.quota ?? 100;
  editForm.enabled.checked = user?.enabled !== false;
  setFormError();
  editDialog.showModal();
  if (!editingUsername) editForm.username.focus();
  else editForm.password.focus();
}

function fmtTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}

async function openUserDetail(username) {
  document.getElementById('detail-title').textContent = `用户 · ${username}`;
  const body = document.getElementById('detail-body');
  body.innerHTML = '<p class="hint">加载中…</p>';
  detailDialog.showModal();
  try {
    const [wsResp, auditResp] = await Promise.all([
      adminFetch(`/api/lsy/admin/users/${encodeURIComponent(username)}/workspace`),
      adminFetch(`/api/lsy/admin/users/${encodeURIComponent(username)}/audit?limit=30`)
    ]);
    const u = wsResp.user || {};
    const w = wsResp.workspace || {};
    const files = w.files || {};
    const auditBlock = renderAuditHtml
      ? `<div class="audit-list">${renderAuditHtml(auditResp.entries || [])}</div>`
      : '<p class="hint">审计模块未加载</p>';
    body.innerHTML = `
      <dl class="kv-list compact">
        <dt>配额</dt><dd>${u.quota === 0 ? '无限制' : u.quota}</dd>
        <dt>已用</dt><dd>${u.used ?? 0}</dd>
        <dt>状态</dt><dd>${u.enabled ? '启用' : '禁用'}</dd>
        <dt>创建</dt><dd>${fmtTime(u.createdAt)}</dd>
        <dt>uploads</dt><dd>${files.uploads ?? 0} 个文件</dd>
        <dt>project</dt><dd>${files.project ?? 0} 个文件</dd>
        <dt>output</dt><dd>${files.output ?? 0} 个文件</dd>
        <dt>chats</dt><dd>${files.chats ?? 0} 个会话文件</dd>
        <dt>AGENTS.md</dt><dd>${w.agentsMdLength ?? 0} 字符</dd>
      </dl>
      <h4 class="section-title">最近工具审计</h4>
      ${auditBlock}
    `;
  } catch (err) {
    body.innerHTML = `<p class="error">${escapeHtml ? escapeHtml(err.message) : err.message}</p>`;
  }
}

async function tryAuth() {
  apiKey = document.getElementById('api-key').value.trim();
  if (!apiKey) {
    showAuth('请填写 AGT 系统 API Key（与控制台相同）');
    return;
  }
  authBtn.disabled = true;
  authBtn.textContent = '验证中…';
  try {
    await adminFetch('/api/lsy/admin/stats');
    sessionStorage.setItem(API_KEY_STORAGE, apiKey);
    showMain();
    await Promise.all([loadOverview(), loadUsers()]);
  } catch (err) {
    sessionStorage.removeItem(API_KEY_STORAGE);
    showAuth(err.message);
  } finally {
    authBtn.disabled = false;
    authBtn.textContent = '进入管理';
  }
}

async function restoreSession() {
  if (!apiKey.trim()) return;
  document.getElementById('api-key').value = apiKey;
  try {
    await adminFetch('/api/lsy/admin/stats');
    showMain();
    await Promise.all([loadOverview(), loadUsers()]);
  } catch {
    sessionStorage.removeItem(API_KEY_STORAGE);
    apiKey = '';
    showAuth();
  }
}

document.getElementById('auth-btn').onclick = tryAuth;
document.getElementById('api-key').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') tryAuth();
});
document.getElementById('logout-btn').onclick = () => {
  sessionStorage.removeItem(API_KEY_STORAGE);
  apiKey = '';
  document.getElementById('api-key').value = '';
  showAuth();
};

document.querySelectorAll('.tab').forEach((tab) => {
  tab.onclick = () => {
    switchTab(tab.dataset.tab);
    if (tab.dataset.tab === 'overview') loadOverview().catch((e) => toast(e.message, true));
    if (tab.dataset.tab === 'users') loadUsers().catch((e) => toast(e.message, true));
  };
});

document.getElementById('add-btn').onclick = () => openDialog(null);
document.getElementById('cancel-btn').onclick = () => editDialog.close();
document.getElementById('detail-close').onclick = () => detailDialog.close();

editDialog.addEventListener('cancel', (e) => {
  e.preventDefault();
  editDialog.close();
});
detailDialog.addEventListener('cancel', (e) => {
  e.preventDefault();
  detailDialog.close();
});

editForm.onsubmit = async (e) => {
  e.preventDefault();
  setFormError();
  const fd = new FormData(editForm);
  const username = String(fd.get('username') || '').trim();
  const password = String(fd.get('password') || '');
  const quotaRaw = fd.get('quota');
  const quota = quotaRaw === '' || quotaRaw == null ? 100 : Number(quotaRaw);
  const enabled = fd.get('enabled') === 'on';

  if (!editingUsername && password.length < 4) {
    setFormError('新建账号密码至少 4 位');
    return;
  }
  if (editingUsername && password && password.length < 4) {
    setFormError('新密码至少 4 位');
    return;
  }
  if (Number.isNaN(quota) || quota < 0) {
    setFormError('配额须为 ≥0 的整数');
    return;
  }

  const body = { quota, enabled };
  if (password) body.password = password;

  saveBtn.disabled = true;
  saveBtn.textContent = '保存中…';
  try {
    if (editingUsername) {
      await adminFetch(`/api/lsy/admin/users/${encodeURIComponent(editingUsername)}`, {
        method: 'PUT',
        body: JSON.stringify(body)
      });
      toast('账号已更新');
    } else {
      await adminFetch('/api/lsy/admin/users', {
        method: 'POST',
        body: JSON.stringify({ username, password, ...body })
      });
      toast('账号已创建');
    }
    editDialog.close();
    await Promise.all([loadUsers(), loadOverview()]);
  } catch (err) {
    setFormError(err.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = '保存';
  }
};

userTable.onclick = async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const user = btn.dataset.user;
  const action = btn.dataset.action;
  try {
    if (action === 'detail') {
      await openUserDetail(user);
    } else if (action === 'edit') {
      const { users } = await adminFetch('/api/lsy/admin/users');
      const u = (users || []).find((x) => x.username === user);
      openDialog(u || { username: user });
    } else if (action === 'reset') {
      if (!confirm(`重置 ${user} 的已用次数？`)) return;
      await adminFetch(`/api/lsy/admin/users/${encodeURIComponent(user)}/reset-used`, { method: 'POST', body: '{}' });
      toast('用量已重置');
      await Promise.all([loadUsers(), loadOverview()]);
    } else if (action === 'delete') {
      if (!confirm(`删除账号 ${user}？工作区文件不会自动删除。`)) return;
      await adminFetch(`/api/lsy/admin/users/${encodeURIComponent(user)}`, { method: 'DELETE' });
      toast('账号已删除');
      await Promise.all([loadUsers(), loadOverview()]);
    }
  } catch (err) {
    toast(err.message, true);
  }
};

restoreSession().catch(() => showAuth());
