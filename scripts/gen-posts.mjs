#!/usr/bin/env node
// 生成静态文章清单 posts.json（零依赖，Node 原生）。
//
// 用法：node scripts/gen-posts.mjs
//
// 扫描 posts/<slug>/index.md 的 frontmatter（title / date / summary / tags），
// 按日期倒序写出根目录 posts.json。首页引擎优先读它 —— 不调用 GitHub API，
// 因此不会再撞匿名接口的限流（每小时 60 次/IP，会导致首页 403）。
//
// 由 .github/workflows/build-posts.yml 在每次 push 时自动跑并提交，作者照常只管 push。

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const POSTS = 'posts';

// 与引擎 app.js 的 parseFrontmatter 保持一致：按第一个冒号切，去掉首尾引号，tags 支持 [a, b]
function parseFrontmatter(md) {
  const m = md.replace(/^﻿/, '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if (val.startsWith('[') && val.endsWith(']')) {
      val = val.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    } else {
      val = val.replace(/^["']|["']$/g, '');
    }
    fm[key] = val;
  }
  return fm;
}

function parseDir(name) {
  const m = name.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
  return m ? { date: m[1], slug: m[2] } : { date: '', slug: name };
}

let entries;
try {
  entries = await readdir(path.join(ROOT, POSTS), { withFileTypes: true });
} catch {
  entries = [];
}

const posts = [];
for (const e of entries) {
  if (!e.isDirectory()) continue;
  let md;
  try {
    md = await readFile(path.join(ROOT, POSTS, e.name, 'index.md'), 'utf8');
  } catch {
    continue;
  }
  const fm = parseFrontmatter(md);
  const { date, slug } = parseDir(e.name);
  posts.push({
    dir: e.name,
    title: fm.title || slug,
    date: fm.date || date,
    summary: fm.summary || '',
    tags: Array.isArray(fm.tags) ? fm.tags : fm.tags ? [fm.tags] : [],
  });
}

posts.sort((a, b) => String(b.date).localeCompare(String(a.date)));

await writeFile(path.join(ROOT, 'posts.json'), JSON.stringify(posts, null, 2) + '\n');
console.log(`posts.json 已生成：${posts.length} 篇`);
