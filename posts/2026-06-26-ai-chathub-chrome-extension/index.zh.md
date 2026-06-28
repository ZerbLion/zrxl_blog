---
title: AI ChatHub：一个多 AI 并排的浏览器侧边栏扩展——API 聚合与「标签页编排」两条腿走路
date: 2026-06-26
summary: 用 WXT + React 19 写的 MV3 侧边栏扩展，一个输入框把同一问题同时发给多个 AI 窗格。最有意思的决定是同时塞了两套引擎——干净的 OpenAI 兼容流式模式，和一套驱动你"已登录标签页"的 webtab 模式——因为每套单独都不够。
wechat_url:
tags: [浏览器扩展, AI, 前端, 开源, 折腾]
---

<!-- 中文版。English: index.md（站内点语言按钮切换）。 -->

# AI ChatHub：一个多 AI 并排的浏览器侧边栏扩展——API 聚合与「标签页编排」两条腿走路

> 这是一个我后来*暂停*了的*骨架*项目的复盘。我把它写出来，是因为其中的架构取舍才是有意思的部分——包括一条我实现了、然后刻意做成可选项的路。诚实的 caveat 见文末。

## 开头

我想要一个浏览器侧边栏：我输入一个问题，多个 AI 各占一栏、并排回答。画面很好想象；真正有意思的问题是*每一栏怎么和它的模型对话*。最后我在同一个扩展里塞了两套完全不同的引擎——而"为什么这么做"就是全部的故事。

技术栈：用 WXT + React 19 + TypeScript + Tailwind 写的 Manifest V3 扩展。一个侧边栏，N 个窗格，底部一个输入框；点发送，广播给每一栏。

---

## 1. 故意做两套引擎

每个窗格可以跑在两种模式之一，甚至能混搭——一栏走 API、另一栏走已登录的网页标签页：

- **API 模式**（默认）：POST 到 OpenAI 兼容的 `/chat/completions`、`stream: true`，逐 token 渲染。干净、快、真流式。代价：你得有 API key，而且按 token 付费。
- **webtab 模式**：打开（或复用）你已经登录的 ChatGPT / Claude / Gemini 标签页，把 prompt 注入它的输入框，再从 DOM 里把回答读回来。好处：蹭你已有的订阅，不要 API key。代价：它脆，做不到逐 token 流式（一次性把整段回吐），而且——这是对别人网站的浏览器自动化——违反人家的服务条款。

两套单独都不让人满意，这恰恰是它俩都存在的理由。API 模式是靠得住的默认项；webtab 是"用你已经付了钱的东西"的逃生口，藏在一个开关后面。

## 2. MV3 的教训：长任务别放 Service Worker

Manifest V3 希望你的后台逻辑放在 Service Worker 里。但 Service Worker 会被浏览器**中途回收**——而一次 AI 生成，正是那种会被干到一半的长任务。

所以这里的 background 脚本只干一件事：点工具栏图标时让 Chrome 打开侧边栏。就这。所有编排逻辑都放在**侧边栏页面**里，只要面板开着它就活着。面板自己调 `tabs.query` / `tabs.create`、直接给 content script 发消息。跟平台的生命周期硬刚是输家游戏；修法是别把需要持续运行的活，放在平台觉得可以随时清掉的地方。

权限刻意精简：`sidePanel`、`storage`、`tabs`、`scripting`，加一个短短的 host 白名单。

## 3. 值得留下的几块

几块我在任何类似项目里都会复用的东西：

- **一个输入框，N 个独立上下文。** 广播函数在每次发送前各自拼上*该窗格自己的历史*，所以追问时每一栏都保持各自独立的线程。token/完成/出错事件按窗格下标分发。
- **27 行的 SSE 解析器。** 不引 SDK——就是 `ReadableStream` + `TextDecoder({ stream: true })`，按换行切、处理被切在半行的 chunk、吞掉非 JSON 的心跳行。因为它只假设 OpenAI 兼容的 SSE，任何这样的端点都能直接接。
- **能扛住 React 的注入。** 往受控 React 输入框里写东西，直接设 `.value` 没用——框架不认。你得用原型的 value setter *并且*派发一个真的 `input` 事件；对 ChatGPT 的 ProseMirror 这种 contenteditable，用 `execCommand('insertText')`，再不行就伪造一个 paste 事件。三段兜底，因为每个站点的编辑器都不一样。
- **判断"写完了没"。** 对一个流式的网页 UI，完成靠两层判定：先等停止按钮出现、再消失；然后确认回复文本连续约 1 秒没变。任一信号单独都不靠谱。

## 4. 诚实的部分（以及它和「scraping is dead」的关系）

我之前写过：靠抓网页来聚合 AI 是一条死路。这个项目就是第一手证据：webtab 模式*就是*那条死路，被真刀真枪实现了一遍。住在代码里，那种脆是具体的：

- 那些 DOM 选择器，用项目自己的话说，"极易随网站改版失效，是长期维护的重点负担"。只有 ChatGPT 的选择器是真的测过的；Claude 和 Gemini 是占位。
- 它是对已登录会话的浏览器自动化，违反这些服务的条款，随时可能失效或让你的账号被标记。

所以我没押注它。默认是 API 模式；webtab 是一个带 README 警告的、需手动开启的逃生口。这就是这篇和上一篇的区别：上一篇给的是*结论*（"scraping 已死，转 API"）；这篇是*物证*——我把那条死路造了出来，而代码本身就在对冲它。

## 5. 诚实的取舍

- **它是个骨架，而且暂停了。** API 模式端到端能跑，但不是成品。
- **还没有图标和上架素材**——构建会警告；这是上架前的杂活。
- **webtab 没有 token 流式**，只有 ChatGPT 验证过，而且天生有 ToS 风险。
- **Claude 的原生 API 没接**——API 模式说的是 OpenAI 兼容，接 Claude 得单独写一个 provider。

值得留下的不是这个产品，而是这个形状：一个接口背后两套可互换的引擎、把编排挪出 Service Worker、以及一条被架构当作"负债"来对待的 scraping 路。

→ **[github.com/ZerbLion/AI_Chat_ChromeExtension](https://github.com/ZerbLion/AI_Chat_ChromeExtension)**
