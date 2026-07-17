/** 李诗雅 · 工具审计展示（对话页 / 管理台共用） */
(function (root) {
  const TOOL_LABELS = {
    read: '读取', view_image: '识图', write: '写入', grep: '搜索', list_files: '列目录',
    export_doc: '导出 docx', convert_document: '转换', run: '命令',
    web_search: '搜索', web_fetch: '抓取', gh_clone: '克隆'
  };

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function toolLabel(name) {
    return TOOL_LABELS[name] || name || '?';
  }

  function toolChipClass(block) {
    if (block.status === 'running') return 'tool-chip running';
    if (block.ok === false) return 'tool-chip fail';
    return 'tool-chip done';
  }

  function toolChipLabel(block) {
    const base = toolLabel(block.name);
    if (block.status === 'running') return `${base}…`;
    if (block.summary) return `${base} · ${block.summary}`;
    return base;
  }

  function renderToolChipHtml(block, idx = 0) {
    const cls = toolChipClass(block);
    const name = toolLabel(block.name);
    const delay = Math.min(idx, 8) * 40;
    let inner;
    let title;
    if (block.status === 'running') {
      inner = `<span class="tool-chip-name">${escapeHtml(name)}…</span>`;
      title = `${name}…`;
    } else if (block.summary) {
      inner = `<span class="tool-chip-name">${escapeHtml(name)}</span><span class="tool-chip-meta">${escapeHtml(block.summary)}</span>`;
      title = `${name} · ${block.summary}`;
    } else {
      inner = `<span class="tool-chip-name">${escapeHtml(name)}</span>`;
      title = name;
    }
    return `<button type="button" class="${cls} tool-chip-btn" data-tool-id="${escapeHtml(block.id || '')}" style="animation-delay:${delay}ms" title="${escapeHtml(title)}">${inner}</button>`;
  }

  function renderToolDetailHtml(block) {
    if (!block) return '';
    const ok = block.ok !== false && block.status !== 'running';
    const args = block.args && typeof block.args === 'object'
      ? Object.entries(block.args).map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(String(v))}</dd>`).join('')
      : '';
    return `<article class="tool-detail-card${ok ? '' : ' fail'}">
      <header class="tool-detail-head">
        <span class="audit-tool">${escapeHtml(toolLabel(block.name))}</span>
        <span class="audit-badge ${block.status === 'running' ? 'run' : ok ? 'ok' : 'fail'}">${block.status === 'running' ? '执行中' : ok ? '成功' : '失败'}</span>
      </header>
      ${block.summary ? `<p class="tool-detail-summary">${escapeHtml(block.summary)}</p>` : ''}
      ${args ? `<dl class="kv-list compact">${args}</dl>` : ''}
      ${block.detail ? `<pre class="tool-detail-body">${escapeHtml(block.detail)}</pre>` : ''}
    </article>`;
  }

  function renderAuditHtml(entries) {
    if (!entries?.length) return '<div class="audit-empty">暂无审计记录</div>';
    return entries.map((e, i) => {
      const ok = e.ok !== false;
      const t = new Date(e.ts || 0).toLocaleString();
      const detail = ok ? '' : (e.detail || '失败');
      return `<article class="audit-card${ok ? '' : ' fail'}" style="animation-delay:${Math.min(i, 12) * 30}ms">
        <header class="audit-card-head">
          <span class="audit-tool">${escapeHtml(toolLabel(e.tool))}</span>
          <span class="audit-badge ${ok ? 'ok' : 'fail'}">${ok ? '成功' : '失败'}</span>
        </header>
        <time class="audit-time">${escapeHtml(t)}</time>
        ${detail ? `<p class="audit-detail">${escapeHtml(detail)}</p>` : ''}
      </article>`;
    }).join('');
  }

  root.LsyAudit = {
    escapeHtml,
    toolLabel,
    toolChipClass,
    toolChipLabel,
    renderToolChipHtml,
    renderToolDetailHtml,
    renderAuditHtml
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
