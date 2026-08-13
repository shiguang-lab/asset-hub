# AI 原生知识与数字资产平台——项目立项书

**项目名称：** 待定  
**项目代号：** Agentic Asset Workspace  
**文档版本：** V1.0  
**项目阶段：** 立项评审  
**核心原则：** Asset First · Modular Capabilities · AI Everywhere · Agent When Needed

---

# 一、项目概述

## 1.1 项目背景

当前个人和企业在日常工作中会持续产生大量数字内容，包括：

- Markdown 文档
- HTML 页面
- PDF
- 产品方案
- 技术文档
- 调研报告
- 数据表
- 行业资料
- 知识库资料
- AI 生成内容
- 在线演示
- Dashboard
- 各类结构化数据

这些内容通常分散在多个系统中，例如：

```text
GitHub / GitLab
飞书 / Notion / Confluence / 语雀
网盘
本地文件
AI 聊天记录
临时网页
各类 SaaS
```

对于中小公司而言，尤其存在以下问题：

1. 专业文档管理平台存在一定采购成本；
2. Markdown、HTML 等代码类文档缺少简单的在线管理和发布渠道；
3. 文档、知识库、调研、演示、数据分析分散在不同工具；
4. AI 产生的内容往往停留在聊天记录中，无法形成长期资产；
5. AI Research 能完成一次性调研，但难以形成持续可维护的数据和知识；
6. 复杂 AI 任务通常依赖用户持续在线，缺少真正的无人值守执行能力；
7. 企业知识难以直接提供给 Claude、Cursor、ChatGPT 等外部 Agent 使用。

随着 AI 从“回答问题”逐渐向“执行工作”发展，未来用户需要的不再只是 AI Chat，而是：

> **能够让人与 AI 一起生产、管理、发布和持续维护数字知识资产的平台。**

---

# 二、项目定位

## 2.1 产品定位

本项目定位为：

> **AI 原生知识与数字资产工作空间。**

英文可暂定义为：

> **AI Native Knowledge & Asset Workspace**

平台围绕数字资产提供：

- 在线文档
- HTML 托管
- 知识库
- 数据管理
- 深度调研
- H5 在线演示
- AI 能力
- Agent
- 无人值守任务
- 发布与分享
- MCP / API

但这些能力之间**不是固定流程关系**。

用户可以只使用其中某一种能力，也可以根据需要自由组合。

---

## 2.2 产品不是一个“大而全办公平台”

项目不定位为：

- Word 替代品
- PowerPoint 替代品
- Canva 替代品
- Notion 替代品
- 飞书替代品
- 单纯 AI Research 产品
- 单纯知识库产品

产品真正的核心是：

> **Asset + AI + Agent + Online**

即：

> 让数字内容成为长期在线资产，并让 AI 和 Agent 可以持续参与这些资产的创建、理解、转换和维护。

---

# 三、核心产品理念

## 3.1 Asset First

平台最核心的对象不是 Chat，也不是 Agent，而是：

> **Asset。**

所有具有长期价值的内容，都应该沉淀为 Asset。

主要包括：

```text
Document
HTML
Dataset
Report
Presentation
Chart
Dashboard
Source
```

每个 Asset 都可以拥有：

- 唯一 URL
- Owner
- Version
- Permission
- Tag
- Folder
- Relation
- Publish 状态
- Knowledge 状态
- 来源信息
- 更新历史

这样 AI 的产出就不再只是一段聊天内容，而是一个真正可以持续使用的数字资产。

---

## 3.2 Modular Capabilities

平台所有主要能力都应该支持独立使用。

例如：

### 在线文档

用户可以只：

```text
创建 Markdown
↓
在线编辑
↓
保存
↓
分享 / 发布
```

完全不使用 AI。

---

### 知识库

用户可以只：

```text
上传资料
↓
建立知识库
↓
搜索
↓
AI 问答
```

不需要 Research。

---

### H5 在线演示

用户可以直接：

```text
Markdown
↓
选择模板
↓
生成 H5 Presentation
↓
在线访问
```

不需要先创建 Research。

---

### Research

用户可以：

```text
输入主题
↓
Agent 调研
↓
生成 Report
```

生成之后是否加入知识库、生成在线演示，由用户自行选择。

因此产品坚持：

> **弱耦合、强组合。**

---

## 3.3 AI Everywhere

AI 应作为增强能力存在于整个产品中。

例如：

### 文档

- 改写
- 摘要
- 翻译
- 扩写
- 解释
- 生成章节

### 知识库

- Ask
- Summary
- 信息提取

### Dataset

- 数据分析
- 趋势发现
- Chart 生成

### Presentation

- 内容拆分
- Slide 结构规划
- 文案优化

### Research

- Planning
- 信息分析
- 结论生成

但：

> **不用 AI 时，基础产品仍然完整可用。**

---

## 3.4 Agent When Needed

不是所有 AI 操作都需要 Agent。

系统将 AI 执行能力分为三级。

### Level 1：AI Function

适合：

- 改写
- 摘要
- 翻译
- 标题生成
- 简单分类

特点：

```text
单次模型调用 / Code
秒级完成
```

---

### Level 2：Workflow

适合：

- Markdown → H5 在线演示
- Document → Summary
- Dataset → Chart
- Report → Presentation

特点：

```text
固定流程
Code + Model + Template
```

无需复杂 Agent Planning。

---

### Level 3：Agent Task

适合：

- 深度行业调研
- 调研数百个产品
- 多数据源采集
- 竞品分析
- 长时间任务
- 定时任务
- 持续监控

特点：

```text
Planner
+
Tools
+
SubTask
+
Retry
+
后台运行
```

---

# 四、产品整体能力架构

平台整体可以理解为：

```text
                         Workspace
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
        Assets            Knowledge           Tasks
          │                                     │
   ┌──────┼─────────┐                         Agent
   │      │         │                           │
Document Data  Presentation                 Research
   │      │         │                           │
   └──────┴─────────┴───────────┬───────────────┘
                                │
                              Actions
                                │
                 ┌──────────────┼──────────────┐
                 │              │              │
            AI Function      Workflow      Agent Task
                                │
                      Publish / Share / MCP
```

其中：

> **Asset 是平台底座。**

而：

- Knowledge
- Presentation
- Research
- Agent
- Publish

都是围绕 Asset 提供的能力。

---

# 五、核心产品模块

## 5.1 在线文档与数字资产管理

提供面向：

- Markdown
- HTML
- PDF
- Dataset
- Report
- Presentation

等内容的统一在线管理。

主要能力：

- 创建
- 上传
- 编辑
- 在线查看
- Folder
- Tag
- Search
- Version
- Permission
- Publish
- Share

这一层本身就是一个可以独立成立的产品。

特别适合：

- 开发团队
- 小型企业
- 独立开发者
- AI 重度用户

解决：

> Markdown / HTML 等内容缺乏低成本在线管理和分享渠道的问题。

---

# 六、知识库

用户可以把已有 Asset 或外部文件加入 Knowledge Base。

典型关系：

```text
Asset
  ↑
  │
Knowledge Source
  │
  ↓
Knowledge Base
```

同一个 Asset 可以被多个知识库使用。

Knowledge Base 提供：

- Keyword Search
- Semantic Search
- Hybrid Search
- AI Ask
- Citation

知识库不与文档强绑定。

用户既可以：

> “先有文档，再加入知识库。”

也可以：

> “直接上传资料创建知识库。”

---

# 七、H5 在线演示

平台中的 Presentation 指：

> **基于 HTML / CSS / JavaScript 的在线演示文稿。**

不是 PowerPoint 文件。

主要使用场景：

```text
Markdown → Presentation

Report → Presentation

Dataset → Presentation

Research → Presentation
```

核心优势：

- 无需下载
- URL 直接访问
- 手机 / PC 可访问
- 全屏演示
- 动画
- 图表
- 视频
- 交互组件
- 在线更新
- 分享
- 访问统计
- 自定义模板

Presentation 本身也是 Asset。

例如：

```text
Document Asset
      │
  generated_from
      ↓
Presentation Asset
```

两者存在关系，但不是强绑定。

---

# 八、Research

Research 负责解决复杂的信息搜集和分析问题。

典型流程：

```text
Define Goal
↓
Planning
↓
Search
↓
Read
↓
Extract
↓
Normalize
↓
Cross Validate
↓
Analyze
↓
Generate Findings
↓
Generate Report
```

主要输出：

- Report
- Sources
- Findings

可选输出：

- Dataset
- Presentation

Research 完成以后：

> 用户自行决定如何继续使用这些 Asset。

---

# 九、Expert Agent

C 端提供自研 Expert Agent。

Agent 的目标不是做普通聊天机器人，而是：

> **帮助用户真正完成复杂知识工作。**

Agent 能力包括：

- Goal Understanding
- Planning
- Tool Selection
- Search
- Browser
- Knowledge
- Code
- Data Analysis
- SubTask
- Asset Creation
- Asset Update

未来可以逐渐沉淀不同 Expert Skill，例如：

- Industry Research
- Competitive Intelligence
- Company Research
- Technical Research
- Product Analysis

---

# 十、无人值守任务

这是项目的重要差异化能力。

复杂任务创建 Task 后：

```text
用户创建任务
↓
Task 持久化
↓
后台 Worker 执行
↓
用户关闭页面
↓
任务继续
↓
完成
↓
通知用户
```

Task Runtime 需要支持：

- Queue
- Checkpoint
- Retry
- SubTask
- Parallel
- Recovery
- Progress
- Cost Tracking

例如：

> 调研东南亚 300 个金融 App。

系统可以长时间后台执行，而不要求用户保持浏览器连接。

这使产品从：

> AI Assistant

向：

> AI Worker

演进。

---

# 十一、行业数据能力

长期来看，行业数据可能成为平台最重要的壁垒之一。

Research 在执行过程中不应该只是生成最终报告。

还应该逐步沉淀结构化 Entity：

```text
Company

Product

App

Website

Technology

Funding

Job

News

Market

Metric
```

例如：

```text
Company
 ├─ Products
 ├─ Apps
 ├─ Website
 ├─ Technology
 ├─ Funding
 ├─ Jobs
 └─ News
```

随着 Research 数量增加：

```text
更多 Research
↓
更多 Entity
↓
更完整 Dataset
↓
下一次 Research 更快
↓
成本更低
↓
结果更好
```

最终形成：

> **Industry Intelligence Dataset。**

---

# 十二、Evidence 与可信度

AI Research 最大问题之一是：

> 用户不知道结论从哪里来。

因此项目将 Evidence 作为重要基础能力。

形成：

```text
Source
↓
Evidence
↓
Finding
↓
Conclusion
```

例如：

Report 中：

> 某市场增长约 21%。

用户点击引用后可以查看：

- 来源
- 原文 Evidence
- 发布时间
- 抓取时间
- Source URL
- Finding Confidence

同一套 Evidence 可以被：

- Report
- Document
- Presentation
- Dashboard

共同引用。

---

# 十三、Living Asset

传统文档是：

> Snapshot。

平台未来希望支持：

> Living Asset。

例如：

```text
Dataset
↓
Report
↓
Presentation
```

当 Dataset 更新：

```text
Dataset v2
↓
检测到依赖变化
↓
Report / Presentation 标记 Possibly Outdated
```

用户可以选择：

> Update with Latest Data。

系统再通过 Workflow 或 Agent 更新对应 Asset。

默认不自动覆盖用户已有内容。

---

# 十四、Publish 与资源分享

Publish 不只是一个短链功能。

平台提供统一在线发布能力。

Visibility：

```text
Private

Workspace

Unlisted

Public
```

进一步支持：

- Short URL
- Password
- Expire Time
- Allow Download
- Custom Domain
- SEO
- Analytics

因此：

```text
Markdown
Report
HTML
Presentation
Dashboard
```

都可以成为在线可访问资产。

这一能力既解决内部分享，也可以形成公开传播和获客。

---

# 十五、MCP / API

平台除了 C 端产品外，同时提供 MCP / API。

未来可提供：

```text
search_assets

read_asset

search_knowledge

create_asset

update_asset

create_task

get_task

research

publish_asset
```

使：

- Claude
- ChatGPT
- Cursor
- Claude Code
- 其他 Agent

可以直接访问平台中的知识与资产。

平台因此可以同时扮演：

> **C 端 Workspace**

以及：

> **Agent Knowledge & Asset Backend。**

---

# 十六、多模型与 Code First

系统不采用：

> 所有任务全部调用最强模型。

而是通过 Workflow 和 Model Router，根据任务类型选择执行方式。

---

## 16.1 Code First

确定性任务优先代码执行。

例如：

- JSON Parse
- CSV Parse
- HTML Parse
- Sort
- Filter
- Deduplicate
- Statistics
- Transform
- Chart Render
- Template Render

优势：

- 成本低
- 结果稳定
- 延迟低

---

## 16.2 Cheap Model

适合：

- 分类
- Entity Extraction
- Keyword
- 简单 Summary
- Routing

---

## 16.3 Strong Model

仅用于：

-复杂 Planning
- Reasoning
- Deep Research
- 综合分析
- 最终结论

目标是：

> **在达到相似甚至更好结果的前提下，降低单位任务模型成本。**

这将形成项目的重要工程与利润优势。

---

# 十七、产品核心优势

综合来看，项目优势可以分为四层。

## 17.1 基础产品优势

- Markdown / HTML 在线管理
- 在线 Asset
- Publish
- Share
- Web Presentation
- Knowledge Base

解决用户当前就存在的问题。

---

## 17.2 AI Native 优势

- AI Function
- Knowledge Ask
- Workflow
- Research
- Asset Conversion

AI 深入每个模块，而不是只有一个 Chat 页面。

---

## 17.3 Agent Automation 优势

- Long-running Task
- Background Execution
- SubTask
- Scheduler
- Monitor
- Living Asset

帮助用户真正把工作交出去。

---

## 17.4 长期壁垒

- Industry Dataset
- Expert Skill
- Research Workflow
- Evidence
- Agent Runtime
- User Assets
- Cost Engine

这部分决定项目长期竞争力。

---

# 十八、目标用户

## 18.1 个人专业用户

包括：

- 产品经理
- 开发者
- 市场人员
- 创业者
- 咨询人员
- 投资研究人员
- AI 重度用户

---

## 18.2 中小企业

典型需求：

- 在线文档
- 知识库
- 技术资料
- 分享
- AI
- 私有 Workspace

---

## 18.3 研发与技术团队

重点使用：

- Markdown
- HTML
- Git
- API Docs
- Architecture
- Knowledge
- MCP

---

## 18.4 研究与咨询团队

重点使用：

- Research
- Dataset
- Report
- Evidence
- Presentation
- Monitoring

---

# 十九、产品获客策略

平台天然可以通过多个独立入口获客。

## 19.1 Markdown / HTML Online

例如：

> 免费 Markdown 在线发布。

降低用户第一次使用成本。

---

## 19.2 Knowledge Base

例如：

> 建立自己的 AI 知识库。

---

## 19.3 Web Presentation

例如：

> Markdown 一键生成在线演示。

---

## 19.4 Research

例如：

> AI 完成行业调研。

---

## 19.5 Agent

例如：

> 把需要几个小时完成的调研任务交给 AI 后台执行。

不同入口最终进入统一：

```text
Workspace
+
Asset
```

体系。

形成交叉转化。

---

# 二十、商业模式

## 20.1 Free

主要用于获客。

可包含：

- Markdown
- HTML
- Public Asset
- Basic Knowledge
- Basic Presentation
- Share
- Basic AI

---

## 20.2 Pro

重点变现 AI 与私有资产。

包含：

- Private Assets
- More Storage
- Research
- Agent Task
- Advanced AI
- More Knowledge
- Advanced Presentation
- Scheduled Task

建议收费方式：

> **订阅 + Credits。**

---

## 20.3 Team / Business

包含：

- Team Workspace
- Member
- Permission
- Audit
- Git
- Private MCP
- Custom Domain
- Usage Control

---

## 20.4 Intelligence

长期高级商业模式。

包括：

- Industry Dataset
- Competitive Intelligence
- Monitoring
- Weekly Report
- API
- MCP Data Service

---

# 二十一、项目 MVP 范围

MVP 需要验证产品底层模型是否成立，而不是一次把所有功能做满。

---

## P0：基础资产能力

- Account
- Personal Workspace
- Asset
- Folder
- Tag
- Search
- Version
- Publish
- Share

---

## P0：Documents

- Markdown
- HTML
- Online Preview
- Auto Save

---

## P0：Knowledge

- Knowledge Base
- Upload
- Add Asset
- Index
- Search
- Ask
- Citation

---

## P0：Web Presentation

- Markdown → Presentation
- 基础 Template
- Presentation Editor
- Player
- Publish

---

## P0：AI

- Rewrite
- Translate
- Summarize
- Basic Workflow

---

## P0：Research / Agent

- Web Research
- Expert Agent
- Background Task
- Sources
- Citation
- Report

---

## P0：MCP

- Search Asset
- Read Asset
- Search Knowledge

---

# 二十二、后续规划

## P1

重点完善平台化和团队能力：

- Team Workspace
- Permission
- Dataset
- Git Sync
- Scheduled Task
- Living Asset
- Custom Domain
- Analytics
- Advanced Presentation
- MCP Write

---

## P2

形成长期壁垒：

- Monitoring
- Industry Dataset
- Knowledge Graph
- Expert Skills
- Workflow Marketplace
- Agent Marketplace
- Enterprise SSO
- Approval Workflow

---

# 二十三、明确不做

项目早期明确不进入：

- Word 类完整富文本编辑器
- PowerPoint 文件编辑器
- Canva 类自由设计器
- IM
- Jira
- 完整项目管理
- 音视频会议
- 完整 Office 套件

避免产品边界失控。

---

# 二十四、核心指标

## 24.1 北极星指标

建议：

> **Weekly Active Assets**

即每周真正产生使用行为的 Asset 数量。

使用行为包括：

- 阅读
- 编辑
- 发布
- 分享
- AI 使用
- Knowledge 使用
- MCP 使用
- Agent 更新

这一指标比：

> Chat Messages

更符合产品长期价值。

---

## 24.2 组合指标

重点观察：

```text
Document → Knowledge

Document → Presentation

Research → Knowledge

Research → Presentation

Knowledge → Agent
```

用于判断：

> 各模块之间是否真正产生组合价值。

---

## 24.3 Agent 指标

- Task Completion Rate
- Task Failure Rate
- Retry Rate
- Human Intervention Rate
- Average Cost
- Average Duration

---

## 24.4 Publish 指标

- Published Assets
- Shared Assets
- Public Views
- Share Conversion

---

# 二十五、项目主要风险

## 25.1 产品边界过大

这是最大风险。

控制原则：

> 所有功能必须围绕 Asset 或 Agent Knowledge Work 展开。

---

## 25.2 单模块竞争激烈

Markdown、Knowledge、Research、Presentation 均存在成熟竞品。

因此：

> 单模块负责获客，组合能力和 Agent/Data 才负责长期竞争力。

---

## 25.3 Agent 稳定性

解决方式：

- Workflow 优先
- Structured Output
- Retry
- Checkpoint
- Eval
- Code First
- Evidence

---

## 25.4 AI 成本

解决：

- Model Router
- Cheap Model
- Code First
- Cache
- Batch
- Token Control

---

## 25.5 HTML 安全

HTML / Presentation 必须采用：

- 独立 Origin
- Sandbox
- CSP
- Resource Limit
- Network Permission

---

# 二十六、项目成功判断

MVP 阶段重点验证以下五件事情。

### 第一，单模块是否成立

用户是否愿意只使用：

- Markdown
- Knowledge
- Presentation

而获得明确价值。

### 第二，Asset 模型是否成立

用户是否愿意长期保留平台里的内容。

### 第三，组合价值是否成立

用户是否自然执行：

```text
Document → Knowledge
Document → Presentation
Research → Presentation
```

### 第四，Agent 委托是否成立

用户是否愿意：

> 提交复杂任务后离开页面，等待后台执行结果。

### 第五，结果是否真正成为资产

Research / AI 输出是否会被：

- 再打开
- 修改
- 发布
- 分享
- 加入 Knowledge
- 提供给 MCP
- 被后续 Agent 使用

---

# 二十七、项目最终价值

本项目最终希望解决的不是：

> “如何让 AI 再回答一个问题。”

而是：

> **如何让人与 AI 共同完成知识工作，并让工作成果成为长期存在、持续增值的数字资产。**

项目最终产品公式为：

```text
Asset Platform
+
Documents
+
Knowledge
+
Web Presentation
+
Research
+
Agent Runtime
+
Publish
+
MCP
+
Industry Data
```

核心产品原则：

> **Asset First**

资产是平台核心。

> **Modular Capabilities**

各能力可以独立使用。

> **Weak Coupling, Strong Composition**

不强制流程，但能力可以自由组合。

> **AI Everywhere**

AI 增强所有环节。

> **Agent When Needed**

复杂任务才使用 Agent。

最终形成：

> **一个既可以简单当作 Markdown/HTML 在线文档平台使用，也可以逐步升级为知识库、在线演示、Research 平台，并最终承载复杂无人值守 Agent 任务的 AI 原生知识与数字资产工作空间。**