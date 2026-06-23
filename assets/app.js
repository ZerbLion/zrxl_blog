/* Zerb's Blog — 零构建博客引擎
 * 三个借鉴来的概念，自己重写、更简洁：
 *   1) GitHub Pages + 客户端渲染：把 posts/<dir>/index.md 渲染成有样式的网页
 *   2) GitHub 做评论系统：用 Giscus（基于 GitHub Discussions）
 *   3) 文章列表自动生成：读 GitHub API 列出 posts/ 下的文件夹，无需手维护索引
 * 改仓库名后，只改下面 CONFIG.repo / giscus.repo 即可。 */
const CONFIG = {
  repo: 'ZerbLion/zrxl_blog',   // ← owner/repo，改名仓库后改这里
  branch: 'main',
  postsDir: 'posts',
  giscus: {
    repo: 'ZerbLion/zrxl_blog',
    repoId: 'R_kgDOTA_3bA',                 // data-repo-id
    category: 'Announcements',
    categoryId: 'DIC_kwDOTA_3bM4C_qMH',     // data-category-id（Announcements 分类）
  },
};

const app = document.getElementById('app');
document.getElementById('year').textContent = new Date().getFullYear();

// 站点 UI 文案：跟随当前阅读语言（localStorage 'lang'，默认英文）
function currentLang() { return localStorage.getItem('lang') === 'zh' ? 'zh' : 'en'; }
const STR = {
  en: { back: '← Back to posts', loadingList: 'Loading posts…', empty: 'No posts yet.',
        listErr: 'Failed to load list: ', rate: 'If this is GitHub API rate limiting (60/hr for anonymous), just try again shortly.',
        loadingPost: 'Loading…', postErr: 'Failed to load post: ', older: '← Older', newer: 'Newer →',
        footer: 'Plain Markdown · no build · push to publish.' },
  zh: { back: '← 返回列表', loadingList: '加载文章列表…', empty: '还没有文章。',
        listErr: '列表加载失败：', rate: '若是 GitHub API 限流（匿名每小时 60 次），稍后再试即可。',
        loadingPost: '加载文章…', postErr: '文章加载失败：', older: '← 更早', newer: '更新 →',
        footer: '纯 Markdown · 免构建 · push 即发布。' },
};
function t(k, lang) { return STR[lang || currentLang()][k]; }
function applyChrome(lang) {
  const f = document.getElementById('tagline'); if (f) f.textContent = t('footer', lang);
  document.documentElement.lang = (lang || currentLang()) === 'zh' ? 'zh-CN' : 'en';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// 解析 YAML frontmatter（只需支持简单 key: value 与 tags: [a, b]）
function parseFrontmatter(md) {
  const m = md.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: md };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if (val.startsWith('[') && val.endsWith(']')) {
      val = val.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    } else {
      val = val.replace(/^["']|["']$/g, '');
    }
    meta[key] = val;
  }
  return { meta, body: m[2] };
}

// "2026-06-21-some-slug" -> { date, slug }
function parseDir(name) {
  const m = name.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
  return m ? { date: m[1], slug: m[2] } : { date: '', slug: name };
}

async function fetchText(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url.split('/').pop() + ' → ' + r.status);
  return r.text();
}

async function listPosts() {
  const api = `https://api.github.com/repos/${CONFIG.repo}/contents/${CONFIG.postsDir}?ref=${CONFIG.branch}`;
  const r = await fetch(api, { headers: { Accept: 'application/vnd.github+json' } });
  if (!r.ok) throw new Error('GitHub API ' + r.status);
  const items = await r.json();
  const dirs = items.filter(it => it.type === 'dir').map(it => it.name);
  const posts = await Promise.all(dirs.map(async name => {
    const { date, slug } = parseDir(name);
    let meta = {};
    try { meta = parseFrontmatter(await fetchText(`${CONFIG.postsDir}/${name}/index.md`)).meta; } catch (e) {}
    return {
      dir: name,
      title: meta.title || slug,
      date: meta.date || date,
      summary: meta.summary || '',
      tags: Array.isArray(meta.tags) ? meta.tags : [],
    };
  }));
  posts.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return posts;
}

let _postsCache = null;
// 列表缓存：同一会话里 renderList / renderPost 复用，省 GitHub API 调用（匿名每小时 60 次）。
async function getPosts() {
  if (!_postsCache) _postsCache = await listPosts();
  return _postsCache;
}

async function renderList() {
  applyChrome();
  app.innerHTML = `<p class="state">${t('loadingList')}</p>`;
  try {
    const posts = await getPosts();
    document.title = "Zerb's Blog";
    if (!posts.length) { app.innerHTML = `<p class="empty">${t('empty')}</p>`; return; }
    app.innerHTML = '<ul class="post-list">' + posts.map(p => `
      <li class="post-card">
        <a href="#/post/${encodeURIComponent(p.dir)}">
          <h2>${escapeHtml(p.title)}</h2>
          <div class="post-meta">${escapeHtml(p.date)}${p.tags.length ? ' · ' + p.tags.map(escapeHtml).join(' / ') : ''}</div>
          ${p.summary ? `<p class="post-summary">${escapeHtml(p.summary)}</p>` : ''}
        </a>
      </li>`).join('') + '</ul>';
    window.scrollTo(0, 0);
  } catch (e) {
    app.innerHTML = `<p class="error">${t('listErr')}${escapeHtml(e.message)}</p>
      <p class="state"><small>${t('rate')}</small></p>`;
  }
}

// 把正文里的相对链接/图片改成相对文章目录解析（如 images/arch.png → posts/<dir>/images/arch.png）
function fixRelativeUrls(root, base) {
  root.querySelectorAll('img[src]').forEach(img => {
    const s = img.getAttribute('src');
    if (s && !/^(https?:|\/\/|\/|#|data:)/.test(s)) img.setAttribute('src', base + s);
    img.setAttribute('loading', 'lazy');
  });
  root.querySelectorAll('a[href]').forEach(a => {
    const h = a.getAttribute('href') || '';
    if (h && !/^(https?:|\/\/|\/|#|mailto:)/.test(h)) a.setAttribute('href', base + h);
    if (/^https?:/.test(a.getAttribute('href') || '')) { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener'); }
  });
}

function mountGiscus(term) {
  const g = CONFIG.giscus;
  if (!g.repoId || !g.categoryId) return; // 还没配置就先不挂
  const wrap = document.createElement('div');
  wrap.className = 'giscus';
  app.appendChild(wrap);
  const s = document.createElement('script');
  s.src = 'https://giscus.app/client.js';
  const attrs = {
    'data-repo': g.repo, 'data-repo-id': g.repoId,
    'data-category': g.category, 'data-category-id': g.categoryId,
    'data-mapping': 'specific', 'data-term': term,
    'data-reactions-enabled': '1', 'data-emit-metadata': '0',
    'data-theme': 'preferred_color_scheme', 'data-lang': currentLang() === 'zh' ? 'zh-CN' : 'en', 'data-loading': 'lazy',
  };
  for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
  s.crossOrigin = 'anonymous'; s.async = true;
  wrap.appendChild(s);
}

const LANG_LABEL = { en: 'English', zh: '中文', 'zh-CN': '中文', ja: '日本語' };

async function renderPost(dir) {
  applyChrome();
  app.innerHTML = `<p class="state">${t('loadingPost')}</p>`;
  const base = `${CONFIG.postsDir}/${dir}/`;
  try {
    // index.md 是默认语言版；frontmatter 里 translations: [zh] 声明有哪些其它语言（文件名 index.<lang>.md）
    const primary = parseFrontmatter(await fetchText(base + 'index.md'));
    const meta = primary.meta;
    const tr = Array.isArray(meta.translations) ? meta.translations
             : (meta.translations ? [meta.translations] : []);
    const langs = [{ code: meta.lang || 'en', file: 'index.md', body: primary.body }]
      .concat(tr.map(c => ({ code: c, file: `index.${c}.md`, body: null })));

    let cur = localStorage.getItem('lang');
    if (!langs.some(l => l.code === cur)) cur = langs[0].code;

    const switcher = langs.length > 1
      ? '<div class="lang-switch">' + langs.map(l =>
          `<button data-lang="${l.code}">${LANG_LABEL[l.code] || l.code}</button>`).join('') + '</div>'
      : '';
    app.innerHTML = `<article class="post"><a class="back" href="#/">${t('back')}</a>${switcher}<div class="post-body"></div></article>`;
    const bodyEl = app.querySelector('.post-body');

    // 切换语言只换正文，不动上一篇/下一篇和评论
    async function load(code) {
      const lang = langs.find(l => l.code === code) || langs[0];
      if (lang.body === null) lang.body = parseFrontmatter(await fetchText(base + lang.file)).body;
      bodyEl.innerHTML = DOMPurify.sanitize(marked.parse(lang.body));
      fixRelativeUrls(bodyEl, base);
      bodyEl.querySelectorAll('pre code').forEach(el => { try { hljs.highlightElement(el); } catch (e) {} });
      app.querySelectorAll('.lang-switch button').forEach(b =>
        b.classList.toggle('active', b.getAttribute('data-lang') === code));
      applyChrome(code);
      const backEl = app.querySelector('.back'); if (backEl) backEl.textContent = t('back', code);
      const pl = app.querySelector('.post-nav .prev .post-nav-label'); if (pl) pl.textContent = t('older', code);
      const nl = app.querySelector('.post-nav .next .post-nav-label'); if (nl) nl.textContent = t('newer', code);
    }
    app.querySelectorAll('.lang-switch button').forEach(btn =>
      btn.addEventListener('click', () => {
        const c = btn.getAttribute('data-lang');
        localStorage.setItem('lang', c);
        load(c);
      }));

    await load(cur);
    document.title = (meta.title || dir) + " · Zerb's Blog";

    // 上一篇/下一篇：与语言无关，渲染一次
    try {
      const posts = await getPosts();
      const i = posts.findIndex(p => p.dir === dir);
      const older = i >= 0 ? posts[i + 1] : null; // 更早
      const newer = i >= 0 ? posts[i - 1] : null; // 更新
      if (older || newer) {
        const cell = (p, side, label) => p
          ? `<a class="${side}" href="#/post/${encodeURIComponent(p.dir)}"><span class="post-nav-label">${label}</span><span class="post-nav-title">${escapeHtml(p.title)}</span></a>`
          : `<span class="${side}"></span>`;
        const nav = document.createElement('nav');
        nav.className = 'post-nav';
        nav.innerHTML = cell(older, 'prev', t('older')) + cell(newer, 'next', t('newer'));
        app.querySelector('.post').appendChild(nav);
      }
    } catch (e) { /* 列表获取失败：不显示上下篇，不影响正文 */ }

    window.scrollTo(0, 0);
    mountGiscus(dir);
  } catch (e) {
    app.innerHTML = `<p class="error">${t('postErr')}${escapeHtml(e.message)}</p><a class="back" href="#/">${t('back')}</a>`;
  }
}

function router() {
  const m = location.hash.replace(/^#/, '').match(/^\/post\/(.+)$/);
  if (m) renderPost(decodeURIComponent(m[1]));
  else renderList();
}

window.addEventListener('hashchange', router);
applyChrome();
router();
