# zrxl 的博客

纯 Markdown、免构建，直接在 GitHub 上阅读。文章按时间**倒序**排列，最新的在最上面。

每篇文章在 `posts/<日期>-<英文 slug>/` 下：`index.md` 是正文，`cover.png` 是封面，`images/` 放正文配图。

## 文章列表

<!-- POSTS:START -->
- `2026-06-21` · [一天搭建自己的多模型 AI 网关：把付费订阅变成全家共享入口](posts/2026-06-21-multi-model-ai-gateway/index.md)<br>从 ChatALL 踩坑到自建——用订阅桥 + Open WebUI + NAS，一天搭出全家共享、多模型并排的 AI 入口。<br><sub>🏷 自托管 · AI · NAS · 多模型 · OpenWebUI</sub>
<!-- POSTS:END -->

## 维护（给作者）

新增文章后，运行一次脚本，自动同步**首页文章列表**和每篇文末的**「上一篇 / 下一篇」导航**：

```bash
node scripts/build-index.mjs
```

脚本只读取每篇 `index.md` 的 frontmatter（`title` / `date` / `summary` / `tags`），不依赖任何第三方包。读者侧始终是纯 Markdown，无需构建。
