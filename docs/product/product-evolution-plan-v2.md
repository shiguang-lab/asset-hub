# Shiguang Asset Hub（知序）V2.0 产品演进规划文档

> 制定日期：2026-11-27  
> 制定依据：基于当前代码库（8 个应用 + 8 个共享包 + `v0.1.0`–`v0.1.25` 实际演进基线）重新定义产品定位、功能图谱与演进路线，取代早期按纯原型设想编写的大而全规划。

---

## 1. 现状重估：代码真正长成了什么？

对照实际运行的代码，当前系统已经明显偏离早期“5 应用全能 PRD”设想，形成了**8 个可部署应用**与一套非常清晰的真实技术壁垒：

1. **高壁垒已成型区**：
   - **文档与路径真源体系**：`assets.path` + `document_folders` + `apps/obsidian-plugin` 构成了“本地 Obsidian Vault ↔ 云端工作台目录树”双向同步基座；编辑器支持 IndexedDB 离线草稿、版本历史、AI 选区 Patch 与 `asset:<id>` 内部引用协议。
   - **HTML-First 演示生成与审校管线**：`apps/worker/src/workflows/presentation.ts` 结合 `apps/render-worker`（Go + `chromedp`）实现了“流式规划 → 单页生成 → 真实浏览器排版溢出/字号/重叠审计 → 视觉评审与自动修复 → 注释编译”，远超常规 JSON 套壳 PPT 工具。
   - **独立 SSR 与公开发布网关**：`apps/ssr`（Next.js）+ `apps/public-gateway`（Go）+ 递归依赖打包（`refs/<assetId>`）构成了完整的公开阅读、短链、密码保护、自定义域名与发布评论数据面。
   - **真实封面渲染系统**：通过 `render-worker` 异步渲染 Markdown/HTML 真实页面缩略图，并通过 SSE 推送前端实时刷新。

2. **高损耗未闭环区（历史包袱与壳化功能）**：
   - **Research & 任务中心壳化**：`collectEvidence` 为假 URL 桩函数，任务详情页内嵌大量硬编码示例报表与假图表；部分任务类型（`publish_bundle`/`export`/`file_process`/`dataset_query`）为空实现。
   - **数据与状态断层**：PostgreSQL 迁移残留布尔整数/计数类型错误、Outbox 非原子抢占、Knowledge 重试与失败态断链、Dataset 导入任务永不完结、Git 同步丢失正文、MCP 发布缺少 Release。
   - **前端路由与 UX 割裂**：V6 Aurora Studio 只覆盖了 6 个核心路由；`/publishes`、`/assistant`、`/datasets`、`/tasks/new` 处于孤立或半孤立状态；跨页面跳转参数（`?asset=` / `?template=` / `?topic=`）在多处失效；搜索预览与知识库面板存在静态占位数据。

---

## 2. V2.0 新产品定位与目标

### 2.1 一句话定位
**面向个人专业创作者与小团队的 AI-Native 知识创作、演示表达与出版工作台（Content-to-Asset Studio）**。

### 2.2 设计原则
1. **Studio First，不做假功能**：宁可把 5 个核心闭环做到 100% 真实可用，也不保留虚假图表、硬编码报告或死按钮。
2. **Local-Cloud Symbiosis（本地与云端共生）**：以 Obsidian / Markdown / HTML 导入导出为高频起点，云端负责组织、引用互联、AI 加工与出版分发。
3. **HTML-First Visual Expression（网页即演示与出版物）**：文档、交互网页、H5 在线演示统一通过真实浏览器管线渲染封面、审计排版并稳定发布。
4. **Open Agent Surface（开放 Agent 底座）**：以可靠的 Knowledge 检索与 MCP 工具层承接外部 AI Agent（Claude / Cursor 等），而非在应用内部重复造低配通用爬虫 Agent。

### 2.3 核心价值闭环
```
本地创作 / 导入 / AI 起草
   │  (Obsidian 同步 · 目录上传 · Markdown/HTML 编辑器 · [[ 资产互链)
   ▼
知识沉淀与检索中枢
   │  (Asset 版本 & 关系图谱 · Knowledge Base 索引/Ask/Citation · Dataset 结构化图表)
   ▼
旗舰表达转化
   │  (文档/知识 → H5 在线演示引擎 · 真实浏览器排版审计 · 实时 AI 改写)
   ▼
高可信对外出版与开放接口
   └─ (SSR 稳定站 · 递归引用打包 · 密码/短链/自定义域名 · 评论协作 · MCP 读写发布)
```

---

## 3. V2.0 重构后的五大产品支柱

### 支柱一：统一创作工作台（Documents + Assets + Obsidian）
- **统一目录与资产视图**：所有资产点击直达其原生工作区（Markdown → 编辑器、HTML → HTML Studio、Dataset → 数据看板、Presentation → 演示编辑器）；资产中心“导入”直接拉起文件/目录导入流。
- **真正可用的编辑器体验**：
  - CodeMirror 支持输入 `[[` 或 `@` 触发实时资产检索联想，自动插入 `[标题](asset:<id>)` 并同步维护 `asset_relations`；
  - 区分“插入图片（仅筛选图片资源/支持直接上传）”“插入文档引用”“知识库片段检索”；
  - 按当前登录用户隔离 IndexedDB 本地草稿；大纲点击直达对应章节；支持历史版本 Diff 对比与一键恢复。
- **Obsidian 插件体验收敛**：对齐单文件绑定模型，彻底清理历史遗留的全局目录强绑定和破坏性删除分支，确保冲突快照隔离保存与幂等创建。

### 支柱二：知识网络与可用 RAG（Knowledge + AI Assistant）
- **索引状态闭环**：`knowledge_sources` 持久化原始对象引用与元信息，单条重试（Retry）可完整重建分块；解析/抓取失败时准确落库 `failed` 状态、写入错误原因并通知前端。
- **确定性 Ask 与可跳转 Citation**：提问改为显式提交（避免输入时逐字符请求模型），严格校验结构化引用返回；点击引用卡片可展开并定位到原文 Chunk 片段。
- **升级 `/assistant` 为真正的工作台助手**：从固定正则路由升级为“可关联工作区知识库与当前资产的 AI 对话与起草工作台”，支持直接生成文档、发起调研或跳转带参创建演示。

### 支柱三：旗舰 H5 在线演示引擎（Presentation Studio）
- **统一全链路入口**：打通首页推荐、模板中心、文档编辑器、资产详情、AI 助手到 `/presentations/new` 的所有参数交接（`assetId`/`asset`/`template`/`topic`/`source`），模板配置透传给生成工作流。
- **所见即所得可靠编辑**：
  - 为演示编辑器补齐真正的防抖自动保存（与顶部保存状态指示一致）；
  - 修复画布元素旋转等属性回传协议，确保修改真实写入 AST；
  - 主题选择器从已加载演示 HTML 状态正确初始化，清除播放器与列表中的硬编码占位文案。
- **真实视觉质检**：保持 Node Worker + Go `render-worker` 协同，补全跨版本读取与重试防吞异常缺陷，打通远端 Skills 注入能力。

### 支柱四：高可信出版与协作网络（Publishing + Gateway + SSR）
- **管理入口闭环**：把发布管理（短链、二维码、重新打包发布、撤销、访问统计）直接接入主导航/设置入口，彻底消除孤立页。
- **发布评论与访客反馈**：在 Web 端补全发布页评论查看与交互，放开公开演示页的评论与在看人数统计，在 SSR 访问时正确记录访问事件。
- **自定义域名与安全隔离**：自定义域名同时支持 Markdown/SSR 与 Presentation/HTML 两种发布产物；生产环境规划独立的 `user-content` 发布域隔离不可信 HTML 脚本。
- **MCP 发布一致化**：MCP `publish_asset` 工具调用后同步构建不可变 Release、更新 `published_url` 并发送事件，确保外部 Agent 发布的链接立即可访问。

### 支柱五：聚焦后的轻量数据与后台任务（Datasets + Tasks）
- **Dataset 定位为轻量数据与图表引擎**：
  - 接入主导航与全局路由；修复导入任务永不完结的问题；
  - 补全多种图表（柱状图/折线图/饼图）全部渲染、可控建图表单（X/Y/分组/聚合）、列名筛选、图表/视图删除；
  - 修复 Go `compute-worker` UTF-8 中文分块截断与分组分页排序逻辑。
- **Tasks & Research 诚实可观测**：
  - 清理任务详情页中所有硬编码静态报告、伪造图表与伪日志，全面改为展示真实任务步骤、实时 SSE/Stream 生成流、真实输出资产与结构化 Evidence；
  - 修复 `git_sync`（正文读取、失败状态回写、本地目录配置、按路径更新去重）与 `Scheduler`（支持非 Research 任务类型）。

---

## 4. 模块收敛与演进优先级

| 优先级 | 目标 | 涵盖范围 |
| --- | --- | --- |
| **Phase 1（当前立即完成）：闭环修复与去伪存真** | 修复所有阻断性 Bug、安全越权、未闭环后台任务、孤立路由与假数据 UI | DB Postgres 兼容、Outbox 原子抢占、IDOR 安全修补、Knowledge 重试/失败态、Dataset 任务完结、Git 同步修复、MCP 发布、Gateway 自定义域名、Web 路由/表单/自动保存/引用联想/`assistant`/`tasks`/`datasets`/`presentations` 修复 |
| **Phase 2（近期深化）：混合检索与格式拓展** | 补强知识复用与文档迁移能力 | `pgvector` Embedding 写入与混合检索、PDF/DOCX 文档导入转 Markdown、`render-worker` 导出高质量 PDF、独立发布域名隔离、Obsidian 插件 HTML 同步与冲突快照重构 |
| **Phase 3（中期扩展）：外部生态与商业化** | 拓展外部数据获取与团队商业化 | 接入真实联网检索 MCP（替换静态 Research 证据收集）、分布式 Cron 调度、外部积分/用量账本对接与存储配额硬拦截 |
