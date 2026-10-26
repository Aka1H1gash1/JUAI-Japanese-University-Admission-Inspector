# OpenPaper / Khoj 源码调研与 JUAI 融合建议

调研日期：2026-10-17。

后续实施：阅读器第一阶段已加入 JUAI，包含本地 PDF.js 阅读、目录 / 缩略图、搜索、缩放旋转、选段高亮、笔记、阅读位置与 Markdown 导出。单文档 Agent 问答、原文引用与确认后转存笔记也已接入；多篇综合与结构化字段自动提取写回仍属后续阶段。下文调研描述保留其当时范围。

本轮为公开源码静态调研与 JUAI 代码对照，未部署两个上游项目、未调用模型、未执行测试，未改动 JUAI 的业务实现。下面“已确认”来自所列源码，“建议”是针对 JUAI 的设计判断。

## 1. 结论与调研版本

建议借鉴 OpenPaper 的文档阅读交互、Khoj 的任务配置和资料工具组织方式，沿用 JUAI 的 Vue / Node / SQLite、模型适配、流式侧栏及修改确认机制。首个交付目标是：打开资料、选段提问、带来源回答、点击引用回原文、保存笔记；随后接入募集要项提取与多篇研究比较。

| 项目 | 已核查提交 | 最适合借鉴的部分 |
| --- | --- | --- |
| [OpenPaper](https://github.com/khoj-ai/openpaper/tree/93ad62ffc63998cae0c0488595c67ae7cd8a6ceb) | `93ad62ffc63998cae0c0488595c67ae7cd8a6ceb` | PDF 阅读、选段、批注、回答与原文联动、文献证据归纳 |
| [Khoj](https://github.com/khoj-ai/khoj/tree/ae229ca894c0b80ad84664afcfdde523b5e87057) | `ae229ca894c0b80ad84664afcfdde523b5e87057` | Agent 配置、受限工具循环、文档检索、来源面板、过程事件 |

两者都有自有后端组织的模型与工具调用链。当前所查核心路径不依赖 LangChain AgentExecutor 或 LangGraph 编排；Khoj 使用了一些 LangChain 文档加载、分块和提示词组件。JUAI 首版可以扩展已有工具循环。

## 2. OpenPaper：论文阅读与 Agent

### 2.1 已确认的两条问答链

单篇论文问答可直接向模型提供 PDF 文件内容，并有提取文字降级路径，连同问题和历史生成流式回答。不能把这条链概括成“先向量检索再回答”。

多篇论文会先收集证据：限定在可访问的论文范围，反复调用读文件、正则搜索、按行读取、读摘要、项目内全文检索、找引用、停止等工具；证据阶段与最终生成回答分开。`gather_evidence` 默认最多四轮，项目内全文检索采用 PostgreSQL passage 级索引。首版 JUAI 可先提供分页读取和选中文段上下文，后续再增加跨文档检索。

关键源码：[单篇 PDF 问答](https://github.com/khoj-ai/openpaper/blob/93ad62ffc63998cae0c0488595c67ae7cd8a6ceb/server/app/llm/paper_operations.py#L137)、[证据收集](https://github.com/khoj-ai/openpaper/blob/93ad62ffc63998cae0c0488595c67ae7cd8a6ceb/server/app/llm/evidence_operations.py#L119)、[文件工具](https://github.com/khoj-ai/openpaper/blob/93ad62ffc63998cae0c0488595c67ae7cd8a6ceb/server/app/llm/tools/file_tools.py)、[多篇答案生成](https://github.com/khoj-ai/openpaper/blob/93ad62ffc63998cae0c0488595c67ae7cd8a6ceb/server/app/llm/multi_paper_operations.py#L42)。

OpenPaper 的全文检索使用英文配置，迁到日文募集要项 / 中文问答时必须重新评估分词与召回，不能默认直接适用：[passage 检索实现](https://github.com/khoj-ai/openpaper/blob/93ad62ffc63998cae0c0488595c67ae7cd8a6ceb/server/app/database/crud/paper_crud.py#L605)。

### 2.2 已确认的阅读交互

- 原 PDF 与侧边工具面板并排，面板切换聊天、概览、批注和音频。
- 支持调整两侧宽度、专注阅读，以及手机端布局。
- 文字选区可转为高亮、注释或提问上下文。
- 用户批注保存原文、页号、位置；位置结构包含 bounding rectangle 与多行 rectangles。
- 点击回答引用可以联动 PDF；引用带论文 ID 与原文片段，前端通过原文匹配定位，处理空白、连字等差异。引用中存在原文不等于来源已经充分支持模型结论。
- 前端是 React / Next.js，使用 `react-pdf`、`react-pdf-highlighter-extended` 与 PDF.js。JUAI 的 Vue 页面需要重建相应组件。

在项目多篇聊天中，点击引用可在当前工作区打开 Reader 标签，切换面板时保留阅读器挂载状态和滚动位置。这适合 JUAI 跨研究室资料核对：[ReaderPanel](https://github.com/khoj-ai/openpaper/blob/93ad62ffc63998cae0c0488595c67ae7cd8a6ceb/client/src/components/project/ReaderPanel.tsx)、[引用按钮](https://github.com/khoj-ai/openpaper/blob/93ad62ffc63998cae0c0488595c67ae7cd8a6ceb/client/src/components/utils/CustomCitationLink.tsx)。

关键源码：[阅读页](<https://github.com/khoj-ai/openpaper/blob/93ad62ffc63998cae0c0488595c67ae7cd8a6ceb/client/src/app/(paper)/paper/(protected)/%5Bid%5D/page.tsx>)、[PDF 阅读组件](https://github.com/khoj-ai/openpaper/blob/93ad62ffc63998cae0c0488595c67ae7cd8a6ceb/client/src/components/PdfHighlighterViewer.tsx)、[原文定位](https://github.com/khoj-ai/openpaper/blob/93ad62ffc63998cae0c0488595c67ae7cd8a6ceb/client/src/components/pdf-viewer/findTextPosition.ts)、[高亮类型转换](https://github.com/khoj-ai/openpaper/blob/93ad62ffc63998cae0c0488595c67ae7cd8a6ceb/client/src/components/pdf-viewer/types.ts)。

### 2.3 运行成本

OpenPaper 前端为 Next.js，服务端为 Python / FastAPI，另有 Celery 作业体系。其开发部署包含 PostgreSQL、RabbitMQ、Redis，并涉及 S3 兼容文件存储及模型服务配置。完整引入会增加 JUAI 桌面发行的服务与运行时数量。

来源：[开发部署](https://github.com/khoj-ai/openpaper/blob/93ad62ffc63998cae0c0488595c67ae7cd8a6ceb/docker-compose.dev.yml)、[开发说明](https://github.com/khoj-ai/openpaper/blob/93ad62ffc63998cae0c0488595c67ae7cd8a6ceb/DEVELOPMENT.md)。这些依赖描述的是上游现有实现，JUAI 的同类交互不要求采用相同部署。

## 3. Khoj：Agent、知识库与来源交互

### 3.1 已确认的 Agent 结构

Agent 是配置记录，包含 personality、chat_model、input_tools、output_modes、创建者、可见性等；文件和检索条目可以关联 Agent。JUAI 可将其简化为“读论文 / 看募集要项 / 比较研究室”任务预设，每个预设组合提示词、允许工具和资料范围。

研究循环自行实现：模型选择工具与参数，后端执行，结果整理为研究记录，进入下一轮规划，结束后生成回答。工具按配置及环境可用性过滤，默认研究轮数为五；普通工具有并行执行、重复参数检查和取消处理。

来源：[Agent 数据模型](https://github.com/khoj-ai/khoj/blob/ae229ca894c0b80ad84664afcfdde523b5e87057/src/khoj/database/models/__init__.py#L248)、[研究循环](https://github.com/khoj-ai/khoj/blob/ae229ca894c0b80ad84664afcfdde523b5e87057/src/khoj/routers/research.py)、[依赖](https://github.com/khoj-ai/khoj/blob/ae229ca894c0b80ad84664afcfdde523b5e87057/pyproject.toml)。

### 3.2 已确认的检索与阅读边界

PDF 经 PyMuPDFLoader 提取、文本分块、内容 hash 比较和 embeddings 索引。查询可以语义检索、限定文件或 Agent 范围，使用 pgvector 余弦距离，并有重排路径。PDF 提取主路径没有持续保留足够的页号和坐标 metadata，不能直接借它实现 PDF 页内精确定位。

来源：[PDF 提取](https://github.com/khoj-ai/khoj/blob/ae229ca894c0b80ad84664afcfdde523b5e87057/src/khoj/processor/content/pdf/pdf_to_entries.py)、[文本分块](https://github.com/khoj-ai/khoj/blob/ae229ca894c0b80ad84664afcfdde523b5e87057/src/khoj/processor/content/text_to_entries.py)、[文本检索](https://github.com/khoj-ai/khoj/blob/ae229ca894c0b80ad84664afcfdde523b5e87057/src/khoj/search_type/text_search.py)。

聊天界面提供来源片段悬停、References 面板、文件链接及按行定位全文弹窗。当前查阅路径没有专用的原 PDF 批注阅读器，不能把它与 OpenPaper 的阅读交互等同。

来源：[来源面板](https://github.com/khoj-ai/khoj/blob/ae229ca894c0b80ad84664afcfdde523b5e87057/src/interface/web/app/components/referencePanel/referencePanel.tsx)、[文件链接处理](https://github.com/khoj-ai/khoj/blob/ae229ca894c0b80ad84664afcfdde523b5e87057/src/interface/web/app/components/chatMessage/chatMessage.tsx)、[文件片段](https://github.com/khoj-ai/khoj/blob/ae229ca894c0b80ad84664afcfdde523b5e87057/src/interface/web/app/components/chatMessage/FileContentSnippet.tsx)。

### 3.3 已确认的流协议与部署

当前网页主要使用 WebSocket，另有 `text/plain` HTTP 流与自定义事件分隔符，不能笼统称为标准 SSE。消息、进度、引用和产物分别传输。JUAI 已有 SSE，可沿用协议并扩展事件，无需切换传输方式。

来源：[网页会话入口](https://github.com/khoj-ai/khoj/blob/ae229ca894c0b80ad84664afcfdde523b5e87057/src/interface/web/app/chat/page.tsx)、[事件归并](https://github.com/khoj-ai/khoj/blob/ae229ca894c0b80ad84664afcfdde523b5e87057/src/interface/web/app/common/chatFunctions.ts)。

Khoj 使用 FastAPI 与 Django ORM、PostgreSQL / pgvector，并可加载本地 embeddings / reranker；数据库配置有 pgserver 内嵌 PostgreSQL 路径，不能说必须另开 PG 容器，但它仍非 SQLite 架构。联网搜索、代码沙箱和电脑操作有额外可选服务。

来源：[数据库配置](https://github.com/khoj-ai/khoj/blob/ae229ca894c0b80ad84664afcfdde523b5e87057/src/khoj/app/settings.py)、[部署配置](https://github.com/khoj-ai/khoj/blob/ae229ca894c0b80ad84664afcfdde523b5e87057/docker-compose.yml)。

## 4. JUAI 当前可复用内容与真实缺口

| 现有代码 | 已有能力 | 融合时的处理 |
| --- | --- | --- |
| `local-server/assistant-service.mjs` | 会话、受限工具循环、SSE、资料范围、修改草稿与用户确认 | 增加文档上下文、文档工具、来源事件及阅读产物 |
| `local-server/assistant-provider.mjs` | 用户 API 配置与协议适配 | 沿用；页面图像需要单独扩展多模态适配，不能只把 base64 当文字工具结果 |
| `components/assistant-chat.vue` | 可拖宽侧栏、工具进度、会话和修改记录 | 复用布局；从纯文本改为安全富文本、来源卡片和上下文附件 |
| `components/document-archive.vue` / `documents.ts` | 原文件、元数据、上传归档、浏览器新标签阅读链接 | 增加工作台内文档路由；保留原文件下载能力 |
| `local-server/admission-parser-worker.mjs` | PDF / DOCX / 文本分页提取、PDF 页图像 | 抽为通用解析入口，保留现有招生分析调用者 |
| `analysis-service.mjs` / `analysis-review.vue` | 募集要项 hash、页码、原文出处及逐项采纳 | 复用证据校验与采纳流程；接入统一阅读器定位 |

边界：现有网页助手工具只读结构化资料与已核对招生要求，尚不具备论文全文读取。外部 MCP 已有按任务读募集要项页文字 / 页图像的工具，但仅在相应任务与权限内。

现有 `analysis_documents` 和 `sourceFile()` 限定专攻所属的募集要项，不能将老师论文直接接到该接口就宣称论文阅读已完成。需要通用解析缓存、统一文档授权，以及兼容原招生分析的调用适配。

## 5. 建议的融合产品

### 5.1 统一资料阅读工作台

新增文档详情阅读路由，例如 `/japan-grad/documents/:documentId`。从老师论文、募集要项、过去问都可进入；顶部保留所属大学、研究室、老师及返回入口。

| 可收起的左栏 | 中部主区域 | 右侧可拖宽面板 |
| --- | --- | --- |
| 目录、缩略图、文内搜索、相关资料 | 原文 PDF、选区、高亮、页码 / 缩放 / 旋转、专注阅读 | AI 对话、笔记与批注、资料概览；按当前文档类型提供快捷任务 |

窄屏只保留一个主面板，通过标签切换原文与助手；不把三栏挤到手机宽度。原有全局助手与阅读助手共用会话机制，阅读页接管同一侧栏上下文，避免同时出现两套聊天窗口。

选区菜单：解释、翻译、提问、高亮、添加笔记。提问时显示用户可移除的文档 / 页码 / 原文附件。翻译显示在侧栏，原文仍保持可核对。

回答引用可以悬停看片段、点击跳页并临时高亮。用户持久高亮、AI 引用临时高亮、搜索匹配高亮分别管理，避免每次问答污染用户批注列表。

### 5.2 按场景组织 Agent 工具

建议用同一工具运行机制提供三个任务预设：

1. 论文阅读：研究问题、方法、数据、结论、局限，以及与研究室方向的联系。
2. 募集要项：提取出愿、考试、语言和材料要求，输出有原文依据的待确认字段。
3. 研究室比较：组合用户选中的论文与已有结构化资料，产出比较表、面试准备或联络草稿。

建议首版工具：`list_documents`、`read_document_pages`、`search_document_text`、`read_document_page_image`、`read_annotations`、`propose_note`，以及现有资料查询 / 修改建议工具。名称是建议接口，不代表已实现。

所有工具同时校验文档 ID、实际归属、用户选择范围和文件 hash。把页面当前对象作为建议范围，UI 明确显示“当前文档 / 当前研究室 / 已选多份资料”，服务端仍独立核对权限。

读文档可直接执行；向研究室资料、考试表、材料清单、老师研究方向或邮件草稿写回时，继续走预览与确认。跨论文产物可以先保存为笔记，用户选择关联对象后再采纳为结构化资料。

### 5.3 先补文档与证据数据

建议追加新迁移与数据表，保留原表及已有迁移：

- 文档解析缓存：`documentId + sha256 + parserVersion`，包含真实页序、文本和可恢复的位置数据。
- 文档块：页号、标题 / 段落、规范化文本及字符映射；后续全文 / 语义检索都返回同一证据结构。
- 阅读状态：当前页、缩放和阅读模式。
- 高亮与批注：来源版本、页号、原文、上下文前后缀、多行矩形、颜色和笔记。
- 回答来源：由服务器注册 sourceId；回答只引用已有 sourceId，保留文档 hash、页号、原文和匹配状态。

矩形采用稳定的 PDF 坐标或明确规范的缩放坐标；显示时按当前 viewport、旋转和缩放转换。避免直接保存浏览器滚动后的屏幕像素。文本 offsets 必须基于带版本的规范化文本，并保留映射，不能将不同解析器的 offsets 混用。

用户选区由前端取得矩形；模型引用提供来源原文，由程序确认匹配后定位。模型给出的坐标不能直接作为已验证位置。匹配失败则退回真实页码，并显示定位状态。扫描件无文字时提供按页查看与图像分析，独立标记人工 / 图像核对状态。

首版按页读取和文内搜索即可形成闭环。后续可评估 SQLite FTS5；日文 / 中文分词、短词与语义检索质量需单独评估。需要跨语言语义检索时再引入可选 embeddings，记录模型版本和索引状态。无模型密钥时，原文阅读、手动批注和笔记仍然可用。

## 6. 建议实施顺序与完成标准

### 第一阶段：阅读器基础

PDF 工作台内阅读、页码 / 搜索 / 缩放、可收起布局、阅读位置、选区高亮和笔记持久化。抽出通用解析缓存，真实来源 hash 全程保留。

完成标准：普通 PDF 可选字；刷新后批注仍在；缩放旋转后高亮能重新定位；扫描 PDF 明确提示文字不可读；长文档按需加载。本文不代表这些检查已经执行。

### 第二阶段：单篇问答与引用

复用当前用户模型配置与聊天侧栏，增加当前文档及选区附件；分页工具；来源与回答分开流式传输；回答引用可回到原文。用户可主动选择整篇 PDF 的多模态读取作为后续增强，不默认每轮上传所有 PDF。

完成标准：来源属于当前授权文档和当前文件版本；引用能定位或明确降级；停止生成可生效；没有依据时明确缺失；不自动写入结构化资料。

### 第三阶段：招生与修考业务联动

募集要项提取结果使用同一个阅读器逐项核对，再写入现有出愿信息、考试表和材料待办。老师论文的阅读卡片可生成研究方向摘要、联系信参考点和面试准备草稿，由用户确认关联。

### 第四阶段：多文档比较

按研究室或用户选中的论文集合检索，生成有单元格来源的比较表；把相关属性接到已有自选 Excel 导出。工具和检索结果应有数量 / 字数 / 时间上限，界面展示检索与阅读进度。

## 7. 许可证事实与工程边界

上游两个仓库根 LICENSE 都是 GNU AGPL v3：[OpenPaper LICENSE](https://github.com/khoj-ai/openpaper/blob/93ad62ffc63998cae0c0488595c67ae7cd8a6ceb/LICENSE)、[Khoj LICENSE](https://github.com/khoj-ai/khoj/blob/ae229ca894c0b80ad84664afcfdde523b5e87057/LICENSE)。JUAI 根 LICENSE 当前为 MIT。

本方案建议基于研究结果独立实现所需交互和接口。若决定直接复制、修改或分发上游源码，应先明确采用的代码范围与相应许可条件；本报告不作法律结论。采用底层依赖也要分别保留其许可声明。

PDF.js 官方将其描述为用于解析和渲染 PDF 的 Web 标准平台，可作为 JUAI Vue 阅读器的候选基础：[官方说明](https://mozilla.github.io/pdf.js/)。已有 Node 解析依赖不意味着浏览器阅读组件已存在；前端 worker、字体和资源需与采用的版本匹配。

本轮仅新增此调研文档，前述 Agent、阅读器、数据表和工具建议均未实施。首页相关未提交修改保持原状。
