---
title: 我做了个零构建博客：写 Markdown、git push 就发布
date: 2026-06-26
summary: 没有 Hugo、没有 Jekyll、没有 node_modules、没有 CI。仓库本身就是网站——写一个 Markdown 文件、push，一个约 400 行的原生 JS 引擎就把它渲染出来。这篇讲它怎么跑，以及我踩的那个限流坑。
wechat_url:
tags: [博客, 原生JS, GitHubPages, Markdown, 自托管]
---

<!-- 中文版。English: index.md（站内点语言按钮切换）。 -->

# 我做了个零构建博客：写 Markdown、git push 就发布

## 开头

我试过的每个"简单"博客，开口都要我先做同一件事：装一个静态站点生成器，学它的模板语法，跑一遍构建，再盯着部署流水线别出岔子。可我想要的只有一句话——**写一个 Markdown 文件，让它出现在网上。**

于是我做了个**只干这一件事**、别的什么都不干的最小东西。没有 Hugo、没有 Jekyll、没有 Astro、没有 `node_modules`、没有要盯着看的 CI。你加一个文件夹，`git push`，文章就上线了。你现在看的这个博客就是它，这篇就讲它怎么实现。

整个思路一句话说完：**Git 仓库本身就是网站。**

---

## 1. 起因：一个本该很轻的东西被搞重了

博客在结构上几乎什么都不是：一个文章列表，加一个渲染单篇的办法。可主流做法却把它变成一条工具链——生成器、主题系统、构建命令、部署 action，外加一个比你这辈子要写的所有字都大的 `node_modules`。

这里面每一环，都是横在"我写完了"和"它上线了"之间、随时可能坏掉的东西。我想让这两者之间只隔**一次 `git push`**：不用构建、不用等、不用半夜因为某个生成器升了大版本而 debug。

## 2. 关键招：把渲染交给浏览器

不提前生成 HTML，而是让网站**在浏览器里、按需**把自己拼出来：

```
   写 Markdown                git push                 GitHub Pages
  posts/<日期>-slug/   ──────────────────►   main   ──────────────────►   index.html + assets/
        index.md                                                                 │
                                                                                 │  在浏览器里
            ┌─────────────────────────────────────────────────────────────────────┘
            ▼
   列出文章（标题 / 日期 / 摘要 / 标签）
   posts/<目录>/index.md ──►  marked + DOMPurify + highlight.js  ──►  渲染成文章
```

这张图里没有任何我自己的服务器。GitHub Pages 托管一个静态 `index.html` 加一个约 400 行的原生 JS 引擎。引擎做三件事：

1. **找文章**：读仓库的 `posts/` 目录。
2. **取内容**：把选中文章的 `index.md` 当纯文本拉下来。
3. **渲染**：用 [marked](https://marked.js.org/) 把 Markdown 转 HTML，用 [DOMPurify](https://github.com/cure53/DOMPurify) 消毒，用 [highlight.js](https://highlightjs.org/) 给代码上色。

库都从 CDN 加载，应用外壳像装好的 App 一样被缓存。这就是全部架构。所谓"数据库"，就是那棵文件夹树。

## 3. 白送的那些功能

因为文章列表是**推导出来的**、不是手维护的，一大堆杂活直接消失了：

- 🗂 **自动索引**：丢一个文章文件夹进去，它就出现在首页，最新在前。没有列表要改。
- 🔗 **自动上一篇/下一篇**：导航由文章顺序生成。
- 🖼 **相对路径图片**：写 `images/diagram.png`，引擎**按文章**解析，所以两篇文章可以各有一张 `images/cover.png` 而不打架。
- 💬 **评论**：走 GitHub Discussions（[Giscus](https://giscus.app)），没有第三方追踪。
- 🌓 **暗色模式**跟随系统，代码高亮也分明暗。

写一篇文章就是：

```
posts/
└─ 2026-06-26-zero-build-blog/
   ├─ index.md      # frontmatter + 正文
   └─ images/       # 用 images/x.png 引用
```

```markdown
---
title: 我的文章
date: 2026-06-26
summary: 首页卡片上显示的一句话。
tags: [博客, 原生JS]
---

正文从这里开始……
```

Push，完事。

## 4. 我踩的那个坑：GitHub API 限流

第一版更"纯"：首页加载时**实时**调**匿名 GitHub Contents API** 列文章。理论上很美——零存储状态，目录列表永远是唯一真相。

然后首页开始对一部分访客返回 **403**。

匿名 GitHub API 的限额是**每小时每 IP 60 次**。在共享网络、运营商级 NAT 后面（以及任何刷新了几次的人那里），这点额度一下就没了，列目录的请求就失败。一个首页时不时打不开的博客，不算博客。

修法既不丢"仓库是唯一真相"的精神，又不必为每次访问交 API 税：一个零依赖的小脚本 [`scripts/gen-posts.mjs`](https://github.com/ZerbLion/zrxl_blog/blob/main/scripts/gen-posts.mjs) 扫描每个 `posts/<slug>/index.md`，解析它的 frontmatter，写出一个静态 `posts.json`。引擎优先读这个文件——不调 API、不限流、不 403。

为了不破坏作者"只管 push"的承诺，一个 GitHub Actions 工作流会在每次 push 时跑这个脚本、把重新生成的 `posts.json` 提交回去。所以索引仍然是从文章推导出来的，只是把推导**从"访客浏览器、每次都算"挪到了"CI、每次 push 算一次"**。脚本里的 frontmatter 解析器，刻意和客户端引擎里的那个一模一样——这样 CI 索引到的和浏览器渲染的，永远不会对不上。

## 5. 不靠框架的双语

每篇文章可以带两个文件：`index.md`（英文，默认）和 `index.zh.md`（中文）。frontmatter 声明它们的关系：

```markdown
lang: en
translations: [zh]
```

引擎看到 `translations` 就显示一个语言切换按钮，点一下切到 `index.zh.md`。没有 i18n 库、没有路由配置——两个文件、两行 frontmatter。

## 6. 老实说说取舍

这套路子是**故意做窄的**，代价值得讲清楚：

- **仓库必须公开。** 引擎（和这套"不构建"的理念）默认任何人都能拉到原始 Markdown。它不是用来写私密博客的。
- **渲染在客户端。** 首屏要等 JS + CDN 库。对文字博客几乎无感；但若你追求极致首屏或极致 SEO，预渲染会更好。
- **中国大陆访问**还在 roadmap 上——GitHub Pages 在国内时好时坏，下一步是做个 Cloudflare Pages / 自托管镜像。

但这些都不动摇核心收益：从**想法**到**发布**，只隔一次提交。

## 7. 自己拿去用

引擎是 MIT 协议（开放的是机器，不是我的文字）。Fork 它，把 `assets/app.js` 里的 `CONFIG.repo` 指向你的仓库，在 `main` 上开 GitHub Pages，你就有了一个"写文章=写文件"的博客。

→ **[github.com/ZerbLion/zrxl_blog](https://github.com/ZerbLion/zrxl_blog)**

如果它帮你省下了又一次折腾静态站点生成器的功夫，给个 ⭐ 对我意义很大。
