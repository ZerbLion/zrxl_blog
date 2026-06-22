#!/usr/bin/env node
// 生成博客索引与文章导航（零依赖，Node 原生）。
//
// 用法：
//   node scripts/build-index.mjs
//
// 做两件事：
//   1. 扫描 posts/<slug>/index.md 的 frontmatter（title / date / summary / tags），
//      按日期倒序，重写 README.md 中 <!-- POSTS:START --> 与 <!-- POSTS:END --> 之间的文章列表。
//   2. 在每篇文章末尾的 <!-- NAV:START --> / <!-- NAV:END --> 之间写入
//      「更早一篇 / 返回目录 / 更新一篇」导航（没有标记则自动追加到文末）。
//
// 「纯 Markdown、免构建」：本脚本只是写作时的辅助，读者照常直接在 GitHub 上读 Markdown。

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POSTS_DIR = path.join(ROOT, 'posts');
const README = path.join(ROOT, 'README.md');

const POSTS_START = '<!-- POSTS:START -->';
const POSTS_END = '<!-- POSTS:END -->';
const NAV_START = '<!-- NAV:START -->';
const NAV_END = '<!-- NAV:END -->';

/** 把路径统一成 markdown 用的正斜杠。 */
const toPosix = (p) => p.split(path.sep).join('/');

/** 解析极简 frontmatter：每行 `key: value`，tags 支持 `[a, b, c]`。 */
function parseFrontmatter(md) {
  const text = md.replace(/^﻿/, ''); // 容错：去掉可能的 BOM
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const sep = line.indexOf(': ');
    if (sep === -1) {
      // 形如 `wechat_url:` 的空值
      const k = line.replace(/:\s*$/, '').trim();
      if (k && /:\s*$/.test(line)) fm[k] = '';
      continue;
    }
    const key = line.slice(0, sep).trim();
    let val = line.slice(sep + 2).trim();
    if (val.startsWith('[') && val.endsWith(']')) {
      val = val.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean);
    }
    fm[key] = val;
  }
  return fm;
}

async function collectPosts() {
  let entries;
  try {
    entries = await readdir(POSTS_DIR, { withFileTypes: true });
  } catch {
    return [];
  }
  const posts = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const indexPath = path.join(POSTS_DIR, e.name, 'index.md');
    let md;
    try {
      md = await readFile(indexPath, 'utf8');
    } catch {
      continue; // 没有 index.md 的目录跳过
    }
    const fm = parseFrontmatter(md);
    posts.push({
      slug: e.name,
      dir: path.join(POSTS_DIR, e.name),
      indexPath,
      md,
      title: fm.title || e.name,
      date: fm.date || '',
      summary: fm.summary || '',
      tags: Array.isArray(fm.tags) ? fm.tags : fm.tags ? [fm.tags] : [],
    });
  }
  // 倒序：日期新 → 旧；日期相同按 slug 倒序，保证稳定。
  posts.sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : a.slug < b.slug ? 1 : -1,
  );
  return posts;
}

/** 替换 start/end 标记之间的内容（含换行）；缺标记返回 null。 */
function replaceBetween(text, start, end, replacement) {
  const i = text.indexOf(start);
  const j = text.indexOf(end);
  if (i === -1 || j === -1 || j < i) return null;
  return text.slice(0, i + start.length) + '\n' + replacement + '\n' + text.slice(j);
}

function renderList(posts) {
  if (posts.length === 0) return '_还没有文章。_';
  return posts
    .map((p) => {
      const rel = toPosix(path.relative(ROOT, p.indexPath));
      let s = `- \`${p.date}\` · [${p.title}](${rel})`;
      if (p.summary) s += `<br>${p.summary}`;
      if (p.tags.length) s += `<br><sub>🏷 ${p.tags.join(' · ')}</sub>`;
      return s;
    })
    .join('\n');
}

/** posts 已按 新→旧 排序；i 为当前文章下标。 */
function renderNav(posts, i) {
  const cur = posts[i];
  const newer = posts[i - 1]; // 更新的一篇
  const older = posts[i + 1]; // 更早的一篇
  const link = (target) => toPosix(path.relative(cur.dir, target.indexPath));
  const parts = [];
  if (older) parts.push(`[← 更早：${older.title}](${link(older)})`);
  parts.push('[· 返回目录 ·](../../README.md)');
  if (newer) parts.push(`[更新：${newer.title} →](${link(newer)})`);
  return `---\n\n<sub>${parts.join(' &nbsp;|&nbsp; ')}</sub>`;
}

async function updateReadme(posts) {
  let readme;
  try {
    readme = await readFile(README, 'utf8');
  } catch {
    console.error('✗ 找不到 README.md，跳过列表更新。');
    return;
  }
  const next = replaceBetween(readme, POSTS_START, POSTS_END, renderList(posts));
  if (next === null) {
    console.error(`✗ README.md 缺少 ${POSTS_START} / ${POSTS_END} 标记，跳过列表更新。`);
  } else if (next !== readme) {
    await writeFile(README, next, 'utf8');
    console.log('  ✓ README 文章列表已更新');
  } else {
    console.log('  · README 文章列表无变化');
  }
}

async function injectNav(posts) {
  for (let i = 0; i < posts.length; i++) {
    const p = posts[i];
    const nav = renderNav(posts, i);
    let md;
    if (p.md.includes(NAV_START) && p.md.includes(NAV_END)) {
      md = replaceBetween(p.md, NAV_START, NAV_END, nav);
    } else {
      md = `${p.md.replace(/\s+$/, '')}\n\n${NAV_START}\n${nav}\n${NAV_END}\n`;
    }
    if (md !== p.md) {
      await writeFile(p.indexPath, md, 'utf8');
      console.log('  ✓ 导航已更新:', toPosix(path.relative(ROOT, p.indexPath)));
    } else {
      console.log('  · 导航无变化:', toPosix(path.relative(ROOT, p.indexPath)));
    }
  }
}

async function main() {
  const posts = await collectPosts();
  console.log(`发现 ${posts.length} 篇文章`);
  await updateReadme(posts);
  await injectNav(posts);
  console.log('完成。');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
