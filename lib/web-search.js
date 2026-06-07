import { getLsyConfig } from '../commonconfig/lsy.js';

const SEARCH_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

function stripTags(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeBingRedirect(href) {
  if (!href) return '';
  if (href.startsWith('http')) return href;
  try {
    const u = new URL(href, 'https://cn.bing.com');
    const target = u.searchParams.get('u') || u.searchParams.get('url');
    if (target) return decodeURIComponent(target);
    return u.href;
  } catch {
    return href;
  }
}

function parseBingHtml(html, max) {
  const results = [];
  const re = /<li[^>]*class="[^"]*b_algo[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  let m;
  while ((m = re.exec(html)) !== null && results.length < max) {
    const block = m[1];
    const link = block.match(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!link) continue;
    const url = decodeBingRedirect(link[1]);
    if (!url.startsWith('http') || url.includes('bing.com/ck/a')) continue;
    results.push({ url: url.slice(0, 500), title: stripTags(link[2]).slice(0, 200) });
  }
  return results;
}

function parseBaiduHtml(html, max) {
  const results = [];
  const re = /<h3[^>]*class="[^"]*t[^"]*"[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null && results.length < max) {
    const url = m[1].startsWith('http') ? m[1] : `https://www.baidu.com${m[1]}`;
    if (url.includes('baidu.com/link?')) {
      /* 保留百度跳转链接，web_fetch 仍可跟随 */
    }
    results.push({ url: url.slice(0, 500), title: stripTags(m[2]).slice(0, 200) });
  }
  return results;
}

function parseDuckText(text, max) {
  const results = [];
  for (const line of String(text || '').split('\n')) {
    const m = line.match(/https?:\/\/[^\s]+/);
    if (m && !m[0].includes('duckduckgo.com') && results.length < max) {
      results.push({ url: m[0].slice(0, 500), title: line.trim().slice(0, 200) });
    }
  }
  return results;
}

async function fetchSearchHtml(url, timeoutMs = 15_000) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'User-Agent': SEARCH_UA
    },
    redirect: 'follow'
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function searchBingCn(query, max) {
  const html = await fetchSearchHtml(
    `https://cn.bing.com/search?q=${encodeURIComponent(query)}&setlang=zh-CN`
  );
  const results = parseBingHtml(html, max);
  if (!results.length) throw new Error('Bing CN 无结果');
  return { engine: 'bing-cn', results };
}

async function searchBaidu(query, max) {
  const html = await fetchSearchHtml(
    `https://www.baidu.com/s?wd=${encodeURIComponent(query)}&rn=${Math.min(max, 10)}`
  );
  const results = parseBaiduHtml(html, max);
  if (!results.length) throw new Error('百度无结果');
  return { engine: 'baidu', results };
}

async function searchDuckDuckGo(query, max) {
  const html = await fetchSearchHtml(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
  );
  const results = parseDuckText(html.replace(/<[^>]+>/g, '\n'), max);
  if (!results.length) throw new Error('DuckDuckGo 无结果');
  return { engine: 'duckduckgo', results };
}

const PROVIDERS = {
  'bing-cn': searchBingCn,
  baidu: searchBaidu,
  duckduckgo: searchDuckDuckGo
};

const AUTO_CHAIN = ['bing-cn', 'baidu', 'duckduckgo'];

/**
 * 国内服务器优先 Bing CN / 百度；海外可回退 DuckDuckGo。
 * lsy.yaml → search.provider: auto | bing-cn | baidu | duckduckgo
 */
export async function runWebSearch(query, maxResults = 6) {
  const q = String(query || '').trim();
  if (!q) return { success: false, error: 'query 必填' };

  const max = Math.min(10, Math.max(1, Math.floor(maxResults || 6)));
  const cfg = await getLsyConfig();
  const provider = cfg.search?.provider || 'auto';

  const tryList =
    provider === 'auto'
      ? AUTO_CHAIN
      : PROVIDERS[provider]
        ? [provider]
        : AUTO_CHAIN;

  const errors = [];
  for (const key of tryList) {
    const fn = PROVIDERS[key];
    if (!fn) continue;
    try {
      const { engine, results } = await fn(q, max);
      return { success: true, data: { query: q, results, engine } };
    } catch (err) {
      errors.push(`${key}: ${err.message || String(err)}`);
    }
  }

  return {
    success: false,
    error: `搜索不可用（${errors.join('；') || '无可用引擎'}）`
  };
}
