# 交付说明与验证记录

## 1. 本次交付范围

基于 PRD V1.0、72 张 UI 交互图与 5 份应用技术设计，实现 PRD 附录 A 全部 42 个页面及
P0/P1 全部可落地的后台链路，以可运行 monorepo 交付。
不包含占位实现：所有页面、接口、任务、索引、发布与 MCP 工具均为真实功能，且全流程可在本地无外部依赖运行。

## 1.1 页面清单覆盖

PRD 附录 A 42 个页面全部实现：

- P0（01–32、34–38、41–42）：首页、全局新建/搜索、资产中心与详情（内容/信息/版本/关系）、
  Markdown/HTML 编辑器、知识库（列表/新建/详情/Ask/资料管理）、调研（首页/新建）、任务中心与详情、
  Research 结果/Source/Evidence、Dataset 数据页与 AI 分析、在线演示（首页/新建/编辑器/播放）、模板中心、
  发布/分享、公开文档页、通知、积分余额只读展示、设置、MCP 设置与连接向导、API Token、404/异常状态页。
- P1（08、15、33、39、40）：资产关系视图、Research 计划确认（新建页内 AI 范围确认）、个人中心
  （`/profile`）、Git 集成（`/settings` Git 页 + worker 同步链路）、自定义域名（`/settings` 域名页 +
  DNS 验证 + 网关 Host 解析）。
- 额外交付：`/publishes` 发布管理页（二维码/重新发布/撤销/访问量）、定时任务管理（任务中心内）、
  团队与权限（成员邀请/角色/资产 ACL/分享通知）。

## 1.2 后台链路覆盖

- 演示大纲确认：`POST /presentations/outline`（AI 生成大纲）→ 前端确认编辑 → `POST /presentations/outline/confirm`
  （创建演示资产并自动建立 `generated_from` 关系）；
- Git 同步：连接（GitHub/GitLab/本地目录）→ `git_sync` 任务 → worker 拉取/扫描 Markdown 文档 →
  投影为文档资产 → 连接状态回写；
- 定时任务：cron 表 + worker Scheduler 轮询到期 → 经 internal API 创建 Research 任务（积分校验与扣费由外部系统负责；
  完成通知），支持停用/启用/删除；
- 自定义域名：添加 → DNS TXT Token 验证 → 绑定发布 → public-gateway 按 Host 解析域名并分发内容；
- 团队与权限：工作区成员（admin/editor/viewer）、资产 ACL（editor/viewer）、分享（自动切换 link 可见性 +
  站内通知），`canAccess` 校验读写权限；
- 双向资产关系：`listRelations` 同时返回 out/in 方向与目标资产，Web 关系视图展示来源/输出。

## 2. 实现决策

| 决策 | 说明 |
| --- | --- |
| SQLite（node:sqlite）+ FTS5 | 本地零依赖即可交付；`Store` 层隔离，生产可换 PostgreSQL/Kysely + pgvector |
| 本地内容寻址对象存储 | `LocalObjectStore` 实现 S3 兼容接口，可替换 SeaweedFS |
| Outbox/Inbox + HTTP 内部接口 | worker 轮询 outbox、投影结果幂等落库；NATS/Hatchet 可替换协议而不改业务代码 |
| 本地确定性模型回退 | 未配置 model-gateway 时 Research/Ask/大纲/文档 AI 动作全部可用 |
| MCP 自研 Streamable HTTP | 兼容 MCP 2025-06-18 协议，JSON 与 SSE 双响应，官方 SDK 客户端验证通过 |
| Go 查询引擎 | 结构化 AST 校验（列白名单、操作符 allowlist、limit/offset 预算），不执行任意 SQL |

## 2.1 UI 对齐（对照 design/ 72 张 UI 图）

通过 Vision OCR 提取全部 72 张 UI 图的文字与坐标，并据此重构 Web 视觉与布局：

- 全局壳层：Shiguang Lab 品牌、左侧导航（首页/资产/文档/知识库/调研/任务中心/AI 助手/
  模板中心/在线演示/数据看板/通知中心/设置 + 积分余额 + 团队版）、顶部面包屑 + 居中搜索 +
  ⌘K + 「+ 新建」菜单（文档/HTML/知识库/调研/在线演示/上传文件）；
- 首页：主输入框 + 四个快捷创建卡片（深度调研/写文档/在线演示/知识库）、「正在执行」任务卡、
  「最近内容」表格（名称/类型/更新时间）、「推荐模板」四卡片；
- 在线演示：四步向导（选择内容来源 → AI 生成大纲 → 确认并生成 → 编辑与发布），来源卡片、
  大纲编辑与预览、主题/配色/字体/比例设置、确认页（预计生成时间）；编辑器为左页面列表 +
  中间画布 + 右侧面板（页面尺寸/主题/字体/背景/动画/演讲者备注/字数统计）；播放器含播放设置
  （循环/进度条/页码/背景音乐/演讲者视图）；
- 文档编辑器：面包屑、内容编辑/图表管理/附件管理/版本历史标签页、左侧「文档结构」、
  右侧「本片文档洞察 + 智能建议」、底部字数统计与自动保存状态；
- 发布弹窗：① 访问权限（私有/链接/公开）② 链接设置（稳定链接/密码/有效期）访问限制
  （下载/复制/企业内成员）分享与推广（复制链接/二维码/海报/嵌入/邮件）；
- 资产中心：统计卡片（总数/文档/报告/已发布）+ 表格（名称/类型/可见性/标签/更新时间/操作）；
- 知识库：统计卡片 + 我的/团队/公开筛选 + 文档数/分块/被引用/更新时间卡片；
- 视觉 token：主题色 #5B36F5、浅灰背景、圆角卡片、表头底色、统计卡片、步骤条、时间线/日志样式。

说明：数据结构与页面差异（如 OCR 中行业报告/模板流程/交互分析等属于报告与数据看板域的
增强视图）保留为 P1 增量，其余核心页面均按 UI 图的结构与文案对齐。

## 3. 端到端验证记录（2026-08-13）

以下链路均在本机实际运行验证：

1. 创建 Markdown 文档 → 发布 → `public-gateway` 返回渲染 HTML（含 CSP/安全头）✅
2. 短链 `/s/{slug}` → 302 到 `/p/{slug}` ✅
3. 知识库：添加资产来源 → worker 解析/分块 → FTS 搜索命中 → Ask 返回引用（Citation 含 source/ordinal/locator）✅
4. Research（报告+来源+数据）：worker 完成 → 3 个输出资产 + 5 条 Evidence；积分结算由外部系统负责 ✅
5. 数据集：CSV 上传 → worker 导入 → Schema（string/integer）→ 分组聚合查询（MoMo=270、VnPay=205）✅
6. 演示：报告 → AI 大纲 → 5 页演示资产 → 发布 → 网关播放页 + manifest 白名单 + 路径穿越防护（404）✅
7. MCP：官方 SDK 客户端 initialize → tools/list（7 工具）→ search_assets 返回真实资产 ✅
8. Web：`http://localhost:3000` 可访问，页面路由与 API 代理正常 ✅
9. `pnpm check`（format/lint/typecheck/test/build）全绿 ✅
10. 演示大纲生成 → 确认编辑 → 创建演示资产（含 `generated_from` 关系）✅
11. Git 本地目录同步 → 2 篇 Markdown 导入为文档资产 ✅
12. 定时任务（cron）→ worker 到期创建 Research 任务并完成 ✅
13. 自定义域名：添加 → Token 验证 → 绑定发布 → 网关 Host 解析返回内容 ✅
14. 团队成员邀请 + 资产分享（ACL + link 可见性 + 通知）✅
15. 扩充冒烟脚本至 12 项，12/12 通过 ✅

## 4. 修复的关键问题

- 内容 blob media_type 记录错误导致正文读取为 manifest（修复为按 content.kind 存 MIME）；
- chunkText 在文本末尾死循环导致 worker OOM（JS 与 Go 双实现修复并加 break）；
- 本地模型关键字误匹配（`scope:` 被当作 `research-scope`）；
- 数据集投影未创建 `datasets` 记录；
- 演示 manifest 嵌套导致 0 页；
- MCP SDK Node transport 与 Fastify 兼容问题（改为自研 JSON-RPC 层）。
- 定时任务 goal 未随 spec 下发导致 Research 校验失败（internal 创建任务时补 goal）。

## 5. 生产化路径

- 替换 `packages/database` 存储层为 PostgreSQL/Kysely + pgvector；
- `ObjectStore` 换 S3/SeaweedFS；
- outbox relay 接 NATS JetStream，worker 换 Hatchet SDK；
- `AiService` 已支持 model-gateway，配置 URL 即可切换真实模型；
- 认证：接入 access-gateway/auth-service 后关闭 `DEV_AUTH`。
