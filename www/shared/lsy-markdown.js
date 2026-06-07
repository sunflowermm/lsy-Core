/** 李诗雅 · 本地 Markdown 渲染（无 CDN，XSS 安全） */
(function (root) {
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function safeUrl(url) {
    const u = String(url || '').trim();
    if (/^(https?:|mailto:)/i.test(u)) return escapeHtml(u);
    return '#';
  }

  function renderInline(text) {
    let s = escapeHtml(text);
    s = s.replace(/`([^`\n]+)`/g, '<code class="md-code">$1</code>');
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
    s = s.replace(/(?<![*\\])\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
    s = s.replace(/(?<![_\\])_([^_\n]+)_(?!_)/g, '<em>$1</em>');
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, href) =>
      `<a href="${safeUrl(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`);
    return s;
  }

  function splitCells(line) {
    const t = line.trim();
    if (!t.startsWith('|')) return null;
    const inner = t.endsWith('|') ? t.slice(1, -1) : t.slice(1);
    return inner.split('|').map((c) => c.trim());
  }

  function isTableSep(line) {
    const cells = splitCells(line);
    if (!cells?.length) return false;
    return cells.every((c) => /^:?-{1,}:?$/.test(c));
  }

  function isHr(line) {
    return /^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim());
  }

  function headerLevel(line) {
    const m = /^(#{1,6})\s+(.+)$/.exec(line.trim());
    if (!m) return null;
    return { level: m[1].length, text: m[2] };
  }

  function ulMatch(line) {
    return /^(\s*)[-*+]\s+(.+)$/.exec(line);
  }

  function olMatch(line) {
    return /^(\s*)\d+\.\s+(.+)$/.exec(line);
  }

  function bqMatch(line) {
    return /^>\s?(.*)$/.exec(line);
  }

  function renderCodeBlock(lang, code) {
    const cls = lang ? ` class="language-${escapeHtml(lang)}"` : '';
    return `<pre class="md-pre"><code${cls}>${escapeHtml(code)}</code></pre>`;
  }

  function renderTable(lines, start) {
    const header = splitCells(lines[start]);
    if (!header || start + 1 >= lines.length || !isTableSep(lines[start + 1])) return null;
    let i = start + 2;
    const rows = [];
    while (i < lines.length) {
      const cells = splitCells(lines[i]);
      if (!cells) break;
      rows.push(cells);
      i += 1;
    }
    const thead = `<thead><tr>${header.map((c) => `<th>${renderInline(c)}</th>`).join('')}</tr></thead>`;
    const tbody = rows.length
      ? `<tbody>${rows.map((r) =>
        `<tr>${r.map((c) => `<td>${renderInline(c)}</td>`).join('')}</tr>`
      ).join('')}</tbody>`
      : '';
    return { html: `<div class="md-table-wrap"><table class="md-table">${thead}${tbody}</table></div>`, next: i };
  }

  function renderList(lines, start, ordered) {
    const items = [];
    let i = start;
    while (i < lines.length) {
      const m = ordered ? olMatch(lines[i]) : ulMatch(lines[i]);
      if (!m) break;
      items.push(`<li>${renderInline(m[2])}</li>`);
      i += 1;
    }
    const tag = ordered ? 'ol' : 'ul';
    return { html: `<${tag} class="md-list">${items.join('')}</${tag}>`, next: i };
  }

  function renderBlockquote(lines, start) {
    const parts = [];
    let i = start;
    while (i < lines.length) {
      const m = bqMatch(lines[i]);
      if (!m) break;
      parts.push(m[1] ? renderInline(m[1]) : '');
      i += 1;
    }
    return { html: `<blockquote class="md-quote">${parts.join('<br>')}</blockquote>`, next: i };
  }

  function renderParagraph(lines, start) {
    const buf = [];
    let i = start;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) break;
      if (isHr(line) || headerLevel(line) || ulMatch(line) || olMatch(line) || bqMatch(line)) break;
      if (splitCells(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) break;
      buf.push(line.trim());
      i += 1;
    }
    if (!buf.length) return { html: '', next: start + 1 };
    return { html: `<p class="md-p">${renderInline(buf.join(' '))}</p>`, next: i };
  }

  function renderBlocks(text) {
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    const out = [];
    let i = 0;
    while (i < lines.length) {
      if (!lines[i].trim()) {
        i += 1;
        continue;
      }
      if (isHr(lines[i])) {
        out.push('<hr class="md-hr">');
        i += 1;
        continue;
      }
      const h = headerLevel(lines[i]);
      if (h) {
        out.push(`<h${h.level} class="md-h${h.level}">${renderInline(h.text)}</h${h.level}>`);
        i += 1;
        continue;
      }
      const table = renderTable(lines, i);
      if (table) {
        out.push(table.html);
        i = table.next;
        continue;
      }
      if (bqMatch(lines[i])) {
        const bq = renderBlockquote(lines, i);
        out.push(bq.html);
        i = bq.next;
        continue;
      }
      if (ulMatch(lines[i])) {
        const list = renderList(lines, i, false);
        out.push(list.html);
        i = list.next;
        continue;
      }
      if (olMatch(lines[i])) {
        const list = renderList(lines, i, true);
        out.push(list.html);
        i = list.next;
        continue;
      }
      const para = renderParagraph(lines, i);
      out.push(para.html);
      i = para.next;
    }
    return out.join('');
  }

  function render(src) {
    const text = String(src ?? '');
    if (!text.trim()) return '';

    const parts = [];
    const re = /```(\w*)\r?\n([\s\S]*?)```/g;
    let last = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) parts.push({ type: 'text', content: text.slice(last, m.index) });
      parts.push({ type: 'code', lang: m[1], content: m[2].replace(/\n$/, '') });
      last = m.index + m[0].length;
    }
    if (last < text.length) parts.push({ type: 'text', content: text.slice(last) });
    if (!parts.length) parts.push({ type: 'text', content: text });

    return parts.map((p) =>
      p.type === 'code' ? renderCodeBlock(p.lang, p.content) : renderBlocks(p.content)
    ).join('');
  }

  root.LsyMarkdown = { render, escapeHtml };
})(typeof globalThis !== 'undefined' ? globalThis : window);
