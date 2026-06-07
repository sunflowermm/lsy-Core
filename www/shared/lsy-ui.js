/** 李诗雅 · 共用 UI 交互（toast / 状态条） */
(function (root) {
  let toastTimer = null;

  function showToast(text, isError = false) {
    let el = document.getElementById('lsy-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'lsy-toast';
      el.className = 'toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.classList.toggle('error', isError);
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }

  function setStatus(text, mode = '') {
    const el = document.getElementById('stream-status');
    if (!el) return;
    el.textContent = text || '';
    el.className = `stream-status${mode ? ` ${mode}` : ''}`;
    el.classList.toggle('hidden', !text);
  }

  root.LsyUi = { showToast, setStatus };
})(typeof globalThis !== 'undefined' ? globalThis : window);
