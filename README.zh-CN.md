<div align="center">

# 📝 zero-build-blog

[English](README.md) · **中文**

**一个零构建、push 即发布的个人博客——写 Markdown、`git push`，GitHub Pages 上就自动渲染成一个干净的网站。没有生成器，没有 CMS，没有流水线。**

[![Live](https://img.shields.io/badge/live-zerblion.github.io-0969da)](https://zerblion.github.io/zero-build-blog/)
![Build](https://img.shields.io/badge/build-none%20(零构建)-2ea44f)
![Stack](https://img.shields.io/badge/stack-Vanilla%20JS%20%2B%20Markdown-f7df1e)
![Hosting](https://img.shields.io/badge/hosting-GitHub%20Pages-1f2328)
![Comments](https://img.shields.io/badge/comments-Giscus-fc521f)
![License](https://img.shields.io/badge/license-MIT-green)

<br/>

[![zero-build-blog 首页](docs/screenshot-home.png)](https://zerblion.github.io/zero-build-blog/)

</div>

---

## 🤔 为什么有这个项目

每个号称"简单"的博客，都要你装一个静态站点生成器、学它的模板、跑一次构建、再盯着部署。我只想要**写一个 Markdown 文件，它就出现在网上。**

`zero-build-blog` 就是能做到这件事的最小东西：

- **没有构建步骤。** 没有 Hugo / Jekyll / Astro，没有 `node_modules`，没有 CI。这个仓库本身就是网站。
- **`git push` 就是部署。** 加个文件夹、push——GitHub Pages 托管，一套约 400 行的原生 JS 引擎负责渲染。
- **一切都在你手里。** Git 仓库里的纯 Markdown。没有数据库、不被锁定，永远可迁移。

## ✨ 你能拿到什么

- 🗂 **自动索引** —— 丢一个文章文件夹进去，它就出现在首页（按时间倒序）。没有需要手维护的列表。
- 🔗 **自动上下篇** —— 文章间导航由文章列表自动生成。
- 💬 **评论** —— 基于 GitHub Discussions 的 [Giscus](https://giscus.app)，不接任何第三方追踪。
- 🌓 **暗色模式** —— 跟随系统主题。
- 🎨 **代码高亮** —— highlight.js，自动适配明暗。
- 🖼 **图片与相对链接** —— 正文里直接写 `images/x.png`，引擎按文章目录解析。
- 🪶 **够轻** —— 一个 `index.html`、约 400 行 JS、一份样式表。库走 CDN，外壳像 App 一样被缓存。

## 🧭 工作原理

```
    写 Markdown                git push                  GitHub Pages
  posts/<日期>-slug/   ──────────────────►   main   ──────────────────►   index.html + assets/
        index.md                                                                 │
                                                                                 │  在浏览器里
            ┌─────────────────────────────────────────────────────────────────────┘
            ▼
   GitHub Contents API  ──►  列出文章   (frontmatter：title / date / summary / tags)
   posts/<dir>/index.md ──►  marked + DOMPurify + highlight.js  ──►  渲染好的文章
                                                                 └─►  Giscus 评论
```

首页通过**公开的 GitHub API** 读取仓库 `posts/` 目录来列文章；每篇文章的 Markdown 在浏览器端拉取并渲染。整个魔法就这一点——**数据源就是 Git 仓库本身。**

## 🚀 自己用一套

```bash
# 1) Fork 后 clone
git clone https://github.com/<你>/<你的博客>.git
cd <你的博客>

# 2) 把引擎指向你的仓库
#    改 assets/app.js → CONFIG.repo（以及 CONFIG.giscus.repo）

# 3) 开启 GitHub Pages：Settings ▸ Pages ▸ 分支 main / 根目录
#    仓库必须是 public —— 引擎用匿名 GitHub API 列文章
```

> **评论（可选）：** 在仓库装上 [giscus app](https://github.com/apps/giscus)，开启 Discussions，然后把 `repoId` / `categoryId` 填进 `assets/app.js`。

## ✍️ 怎么写一篇文章

```
posts/
└─ 2026-06-21-multi-model-ai-gateway/
   ├─ index.md      # frontmatter + 正文
   └─ images/       # 正文里用 images/arch.png 引用
```

```markdown
---
title: 一天搭建自己的多模型 AI 网关
date: 2026-06-21
summary: 一句话简介，显示在首页卡片上。
tags: [自托管, AI, NAS]
---

正文从这里开始……
```

push 上去就行。文章自动出现在首页——不用更新索引，不用跑构建。

## 🗺 路线图

- [ ] RSS / Atom 订阅
- [ ] 标签页
- [ ] 首页文章卡片配封面图
- [ ] 国内稳定访问的镜像（Cloudflare Pages / 自托管）

## 📜 许可

引擎部分（`index.html`、`assets/`）采用 [MIT](LICENSE)。`posts/` 下的文字版权归作者所有——可以抄这套机器，别抄这些字。

---

<div align="center">

一个自己手搓的零构建博客，作者 [**@ZerbLion**](https://github.com/ZerbLion)。<br/>
如果它帮你省掉了又一次折腾静态站点生成器，点个 ⭐ 我会很开心。

</div>
