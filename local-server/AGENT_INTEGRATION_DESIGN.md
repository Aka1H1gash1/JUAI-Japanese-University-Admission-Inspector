# JUAI 募集要项分析与 Agent 工作区接入

状态：资料分析直接关联专攻。申请轮次功能已移除，个人时间计划在研究室时间线中编辑。

## AI 连接与功能分配

页面 `/japan-grad/ai` 对应 `ai-management-service.mjs`。迁移 10 建立 `ai_connections`、`ai_feature_bindings`、`ai_registry_state`：连接与默认模型、按功能覆盖模型 / 思考模式、旧配置导入标记。密钥只保留在连接 ID 索引的服务端内存 vault，接口只返回 keyConfigured；同地址不同连接互不复用密钥。更改地址 / 协议会清除凭据，旧会话会拒绝向变化后的端点发送旧上下文。

`workspace_chat`、`document_chat`、`admission_extract` 分别解析绑定并为新会话 / 任务固定 provider 与 connectionId。本机桥接实例由注册中心共用，原助手设置保留资料权限和兼容接口；旧专用 API 写入也映射到连接注册中心，不另建密钥池。外部 MCP 令牌与原授权表保持独立。

- `GET /ai/management`：连接、功能绑定、权限和本机非敏感状态。
- `POST /ai/connections`、`PUT/DELETE /ai/connections/:id`：连接 CRUD；仍被功能引用时拒绝删除。
- `POST /ai/connections/:id/models`：仅读取 API / 本机模型目录；原生账号未登录时返回状态，不启动推理。
- `DELETE .../key`、`POST .../login`：清除单个连接密钥 / 本机登录入口。
- `PUT /ai/features/:feature`：按功能绑定连接 / 模型 / 开关 / 思考覆盖。
- `PUT /ai/permissions`：网页工作区助手的资料范围；收紧时中断对应请求，旧会话需重建以免沿用已撤回的上下文。

DeepSeek 使用 Chat Completions 适配器，显式传 thinking / reasoning_effort，JSON 提取使用 json_object；流式与非流式 reasoning_content 均随 assistant 工具消息完整回传。跨轮工具上下文保存在受限长度的会话内部 apiTurns，view 与 SSE 不返回该内部字段。目录声明的图像能力优先于连接默认值。资料引用和正式写入仍经过既有核对门槛。

## 使用入口

专攻详情 →「募集要项分析」，或募集要项文件详情 →「分析这份募集要项」。选择资料、说明资料年度 / 学位 / 选拔类别后建立分析任务，不需要建立申请轮次。

读取支持 PDF / DOCX / MD / TXT。PDF.js 在 Worker 中提取分页文字，并按需提供 PNG；DOCX 为全文逻辑块，MD / TXT 保留分块行号。旧 DOC 转换后分析。网页可复用助手、独立 API 或本机模型生成提取草稿，扫描页可用本机 OCR 或支持图片的模型。

## 网页 AI 字段提取

`admission-ai-service.mjs` 编排有界分页提取，通过 analysis-service 的来源 / hash 校验和 `submitProposal` 统一入库；不调用 apply，也不暴露通用写入工具。复用助手时使用当前模型和授权专攻；本机模式根据 App Server 目录选模型，Luna 不硬编码为始终可用；独立 API 使用单独设置与内存密钥。原文中的命令只作为不可信资料。

- `GET/PUT /analysis/ai/settings`：读取 / 保存独立 API 配置，GET 附助手、本机与 OCR 非敏感状态；`DELETE /analysis/ai/key` 清除密钥并停止对应任务。
- `POST /analysis/ai/native`：检测本机登录与模型目录，未发起推理，不更改聊天设置。
- `POST /analysis/jobs/:id/ai/preview`：页码范围预览，正文 `{ranges:{[documentId]:"1-5,8"}}`，不调用模型。
- `POST /analysis/jobs/:id/ai`：开始任务，正文 `{mode:"assistant"|"native"|"api",model?,scanMode:"auto"|"text"|"ocr"|"vision",ranges?,supportsImages?}`；返回 202。`supportsImages` 仅用于用户声明复用 API 的图像能力，本机依据模型目录。
- `GET /analysis/jobs/:id/ai`：最近任务、批次进度与生成的 proposalId；`POST .../ai/stop` 停止，不自动重试。

迁移 9 新增 `admission_ai_settings` / `admission_ai_runs`；不改变原分析表结构。文字分批最多 24 万字 / 120 页，图片最多 18 页、本机 OCR 最多 24 页，每任务最多 12 次模型请求 / 12 分钟，同时最多 2 任务。结构化输出是独立 API 可选项，不支持时用 JSON 提示与后端校验，无自动付费重试。跨批字段候选不同保留 conflict 供核对，不推测合并。

`admission-ocr.mjs` 优先使用包内从 `ocr-vision.swift` 编译的 macOS Vision helper；其他环境发现带日语语言包的 Tesseract 后可用。OCR 仅处理传入页面图片，无联网和原文件修改；OCR / 图片引用通常为 visual_review。PDF 页码与原始 hash 始终绑定原文件，读图不等于字段已确认。

API 图像内容使用 Responses `input_image` / Chat Completions `image_url`；本机使用本机 CLI 生成的 App Server schema 中的 image 用户输入与 outputSchema。参考 [OpenAI 图像输入](https://developers.openai.com/api/docs/guides/images-vision)、[结构化输出](https://developers.openai.com/api/docs/guides/structured-outputs)。

## 核对与采纳

结果状态区分 found、not_found、unreadable、conflict；found 带资料 ID、SHA256、页码 / 逻辑块与原文。系统标记 text_matched 或需要视觉核对的 visual_review。

逐项核对后：

名称差异仅作 warnings 提醒。时间适用研究科 / 专攻 / 选拔类别不确定时，字段携带 scopeNote，服务端将其标为 requiresScopeConfirmation；apply 需在 confirmedScopes 中明确包含所选时间字段，并保存 scopeConfirmedAt。多个候选时间无法确定时仍为 conflict；不自动更改历史草稿。

- 出愿开始 / 截止、材料与语言要求更新到专攻。
- 考试科目、笔试、面试和结果日期由用户明确选择已有考试记录，或确认考试年份 / 批次后新增，避免把资料年度直接当作考试年份。
- 材料可选择同专攻研究室生成清单。
- 其他报考要求、字段证据与采纳历史单独保存于专攻分析记录。

采纳前核对来源 hash 和所属专攻，检查工作区 revision，并在同一事务保存正式要求、证据与草稿状态。替换已有内容需用户确认，未选字段保留。

## 任务包与 MCP

任务 ZIP 含 AGENTS.md、task.json、context.json、sources、parsed、result.schema.json 和 result.template.json。Agent 生成 result.json 后可单文件拖拽导入（最大 8 MB）。每任务 1–10 份资料，总计 100 MB，单文件 50 MB，PDF 最多 300 页 / 200 万字，读取超时 90 秒，最多 4 个排队 / 读取任务。

「Agent 工作区接入」生成按专攻授权的 STDIO MCP 配置，支持通用 JSON / Codex TOML。令牌只创建时返回，服务端存 hash，可撤销。升级后客户端重新连接加载工具。

| 工具                       | 能力                                   |
| -------------------------- | -------------------------------------- |
| search_workspace           | 搜索授权专攻、研究室与分析任务         |
| get_major_context          | 大学、专攻、研究室、当前报考资料及任务 |
| list_documents             | 授权专攻的募集要项清单                 |
| create_analysis_task       | 选择专攻、资料与分析对象建立读取任务   |
| get_analysis_task          | 状态、来源与最近提取草稿               |
| read_document_pages        | 1–5 页文字，超长页有截取标记           |
| read_document_page_image   | PDF 指定页 PNG                         |
| get_analysis_result_schema | 当前任务结果 Schema                    |
| submit_analysis_proposal   | 带幂等 requestKey 提交待核对草稿       |

服务端校验范围，正式采纳不向 Agent 开放。邮件正文与教授联络草稿不通过这些工具提供。模型是否联网取决于客户端配置。

## 手动时间规划

研究室 `timeline` 保存 events 和 hiddenSources。事件含类型、标题、日期段、可选 JST 起止时间、完成状态、备注与替代来源。已有资料日期可在时间线中编辑成该研究室的个人计划，也可隐藏 / 恢复。更新同步用于图表、列表、倒计时、近期节点、.ics 与 Excel 时间规划列。

前后端共用 timeline-fields.mjs 校验。旧页面省略 timeline 时保存原值，编辑研究室基本资料也保留日程。

## 数据升级与开发

迁移 1–3 保持原样，追加 migration 4，将旧分析任务关联到专攻，并将旧资料中已关联研究室的明确日期和清单保留到研究室。已采纳旧结果变为待核对，重新选择正式资料位置，避免自动覆盖现有要求。旧表作为历史存档保留，不提供轮次操作接口。

分析要求与历史使用 analysis_requirements / analysis_history。开发执行 `pnpm setup:japangrad-server` 安装独立锁定的解析器与 MCP 依赖；打包内置依赖。

### 教授考学经历与阶段内容（2026-10-13）

- 每位老师自动拥有当前经历；按阶段展示研究 / 论文 / 要求、首封、往来信件、预约面试 / 准备、实际面试 / 问答、内诺原文 / 签署文件、结果。完整总表保留全部阶段。
- 邮件按经历归属，预约面试前自动联动早期状态；已进入面试或后续阶段不自动倒退。内诺 / 结果引用实际来信，删除来源保留正文快照。
- 可新建仅带名称的经历并保留历史，不引入申请轮次或批次配置。历史邮件与文件隔离，日期可手改、来源节点可联动，冲突保存提示核对。
- 当前升级追加数据库版本 5；升级前备份工作区。Agent / MCP 授权范围维持原有专攻资料权限，不自动开放邮件正文与草稿。

## 本地 Agent 信息文件接入

在「修考之路 → Agent 工作区接入」选择授权专攻与信息文件权限。可以选择只读、读取并编辑，或保留原来的仅募集要项分析权限。编辑时逐项授权专攻、研究室、老师基本资料、大学和研究科；大学 / 研究科为共享资料，默认不授权编辑。

创建后可复制 / 下载通用 MCP JSON 或 Codex TOML，也可下载完整配置 ZIP，包含两种配置、AGENTS.md、使用说明、授权范围和忽略令牌配置的 .gitignore。在独立文件夹中打开本地 Agent，将所需配置合并到客户端 MCP 设置后重新加载；保持 JUAI 服务运行。无需把源码目录交给 Agent。此轮不自动修改用户的客户端全局配置。令牌只在创建窗口返回，服务端只保存 hash；遗失时撤销并重新创建。旧连接不会自动获得信息文件权限。

建议对 Agent 说：“先查看 JUAI 连接状态和授权范围，列出可编辑的信息文件，再按我的要求更新资料。保存前说明字段变化，缺失信息不要猜测。”

| MCP 工具 | 用途 |
| --- | --- |
| get_connection_status | 确认服务连接与权限，不返回令牌 |
| get_information_workspace | 读取授权、字段 JSON Schema、地域选项和操作规则 |
| list_information_files | 搜索 / 分页列出逻辑 JSON 文件与可写状态 |
| read_information_file | 读取开放字段、父级路径及当前 SHA256 |
| write_information_file | 按原 hash 保存信息并同步工作区；提供唯一 requestKey 和摘要 |
| list_information_changes | 读取本连接最近 50 项修改摘要 |

信息文件路径如 `majors/<id>.json`、`labs/<id>.json`，由服务映射到 SQLite 中的现有记录，不是磁盘文件路径。内容使用 `{schemaVersion:1, kind, id, data:{...}}`，ID 和所属关系不可变；`data` 中未提供的字段保留，字符串可用空字符串清空。费用按整数日元字符串记录，材料和考试数组按工具返回的 Schema 填写。新建 / 删除实体、关系调整、邮件与考学经历、上传原文件、代码及数据库不通过这些信息工具开放。工具授权只限制 JUAI MCP 能力，不限制 Agent 客户端自身已有的 Shell / 系统文件权限。

写入重新检查令牌、专攻范围和资料类型；路径仅接受预定义逻辑路径，不访问任意磁盘路径。全工作区校验、资料变更与历史写入在本机服务事务中完成；hash 冲突要求重读合并，同一个 requestKey 重试不会再次应用。升级新增数据库 migration 6，保存 Agent 信息修改历史。

在接入窗口底部查看修改前后对照、刷新连接最近使用时间，或撤销单项修改。撤销仅恢复该项改变的字段，保留其他资料；字段之后有新变化时拒绝撤销，原记录仍可查看。普通页面约每 15 秒及重新聚焦时检查新修订；打开编辑弹窗时暂停自动更新，保存冲突不会静默覆盖 Agent 改动。

募集要项分析仍使用原有提取、证据与待核对草稿流程。信息编辑用于用户明确要求的资料维护，不替代来源核对。

## 网页 AI 资料助手（自带 API）

### 单文档阅读会话

阅读器复用同一连接配置和 `assistant_sessions`，在会话 JSON 的 scope 中固定文档 ID 与 SHA；不增加数据库迁移。`POST /assistant/sessions` 与 `/native/connect` 可附 `document: { id, sha256 }`，服务端解析实际归属并建立只读范围。文档会话只提供 get_current_document、read_document_pages、search_document、read_document_notes，不暴露原工作区写入工具。

每次 turns 附 reader 的 documentId、sha256、当前页及可选 selection。后端核对文件版本和选段，使用本地解析缓存读取原文；工具将真实原文注册为 S 编号并单独发送 source 事件。最终回答只保留本会话已注册且属于当前版本的引用，找不到的来源明确标记。来源文字存在不等于模型结论已验证。

前端复用 AssistantChat 的嵌入模式、连接设置与 SSE，并增加安全文本格式、来源卡片和引用回跳；保存笔记先填入 ReaderNotes 编辑器，用户再确认。扫描页仍为文字不足提示，未接图像推理或多篇检索。工具循环遵循[官方 function calling 说明](https://developers.openai.com/api/docs/guides/function-calling)，未引入新的 Agent 框架。

右上角「AI 助手」直接打开网页对话框。首次点击「模型与权限」，填写自己的 API Base URL、模型 ID、密钥，选择接口与授权专攻；保存后即可对话。每个对话固定自己的模型地址与资料范围，改设置会开始新对话。可以恢复历史对话、停止当前回答、删除对话，或打开「修改记录」对照与撤销已经保存的资料。

支持 OpenAI Responses 与 OpenAI 兼容 Chat Completions；本机模型服务可使用 localhost / 127.0.0.1 HTTP，远程 API 使用 HTTPS。模型必须支持函数工具调用，兼容性取决于服务商与模型；较新的 OpenAI 模型使用 Responses。默认流式显示，可在设置关闭流式以适配其他服务。Base URL 自动补充对应接口路径，不接受 URL 中的密钥参数。

助手可以搜索 / 读取授权专攻及所属大学、研究室、老师基本资料，查看已核对的补充报考要求，并提出资料修改建议。所有写入先显示修改前与建议值；点击「确认修改」后才保存。确认前再次校验 hash 和范围，复用信息文件服务的字段校验、幂等保存与撤销历史。只读模式不提供修改建议工具。工作区对话不直接读取原始 PDF / Word、邮件、考学经历或系统文件；阅读页另设仅当前文档的只读问答，募集要项正式字段采纳继续使用专攻分析页面。

API 密钥只放在本地服务进程内存，不写入 SQLite、浏览器持久存储、对话日志或配置包；重启服务后重新填写。模型地址和非敏感设置、对话与建议保存在本机 SQLite。用户点发送后，对话及本轮工具读取的授权信息会发送到其配置的模型服务；没有内置平台模型密钥。

这版使用本地 Node.js 的函数工具调用编排，共用已有资料权限层，没有引入 LangChain 依赖。外部 Agent MCP 配置继续可用；网页端同时支持用户 API 和本机 Codex 的登录 / App Server 桥接，并共用对话和修改确认界面。

技术边界：数据库追加 migration 7（设置、对话、建议表）；最近 16 条对话进入模型上下文，旧对话仍保留在本机。每轮最多 8 次模型请求、20 次工具调用、5 项修改建议，每个模型请求最多输出 4096 token，总处理时间 3 分钟，同时最多 2 轮运行。工具结果限制大小；请求取消、中断、服务重启或 hash 冲突均有明确状态。没有通用 Shell、任意文件读写、自动发送邮件或模型直接保存资料的工具。

接口依据：[OpenAI Function calling](https://developers.openai.com/api/docs/guides/function-calling)。本机 Codex 另一条路线依据：[Codex App Server](https://developers.openai.com/codex/app-server)。

## 本机 Codex 与并排助手侧栏（2026-10-15）

右上角「AI 助手」现在展开固定在右侧的工作面板，主页面同时缩窄并重新排版。拖动两栏分隔线调整宽度，双击恢复默认；键盘左右键也可调整，宽度记在本机浏览器。收起后主页面恢复；较窄窗口使用全宽助手视图。资料与对话可以并排查看。

点击「连接本机 Codex」，自动检测 Codex CLI、沿用已有登录 / 模型配置，并创建 JUAI 专用网页会话。无需填写 API 密钥或手动安装 MCP 配置。模型列表由本机 Codex 返回，不硬编码；在设置中可选择模型、专攻和资料范围，自动检测失败时可填写程序绝对路径。未登录时提供官方登录入口。

也可点击「复制指令给本机 Agent」，让本机 Agent 只调用 JUAI 的连接接口完成这项连接。网页检测到新会话后载入。此指令帮助连接 Codex，不会让任意外部 Agent 自动变成网页聊天引擎，也不导入 IDE 现有聊天记录。其他 Agent 要直接在网页回复仍需实现其对话适配器。

实现使用 Codex App Server 的 JSONL / STDIO、初始化、账户状态、模型列表、临时线程、流式消息和动态资料工具。每轮创建独立临时线程，JUAI 自己保存聊天历史并提供最近上下文。程序在独立临时目录运行，采用随机名称的只读文件权限配置，命令、代码执行、外部应用、hooks、其他 MCP 与插件在该接入会话中关闭；权限未正确采用时拒绝启动推理。不修改用户的 Codex 全局配置，不读取或复制账户令牌。登录、模型服务与额度由本机 Codex 的配置负责。

本机 Codex 复用网页助手的资料范围、读取后才能提议、字段校验、人工确认、冲突保护和撤销记录。取消或退出会中断 Codex turn；停止本地服务同时关闭它所启动的 Codex 子进程。用户自己的 API 模式继续可选。

无需新增数据库迁移，模型来源保存在原设置 / 会话 JSON 扩展字段中。接入依赖 Codex 的实验性动态工具与权限接口，旧版本或管理策略不兼容时会显示错误并停止，不放宽权限。

依据：[Codex App Server](https://developers.openai.com/codex/app-server)、[Codex Permissions](https://learn.chatgpt.com/docs/permissions)。本机实际连接初始化已读取到已有登录与可用模型，并核对选中的只读权限；未启动模型推理。代码检查包括 Vue 类型、Vite 构建、Node 语法及 diff；未运行自动化测试。

## AI 快速接入

## 统一新增与设置

新增入口统一由 EntityCreateFlow 提供手动 / 网址两种方式，编辑已有条目直接进入原表单。大学清单移除总览统计、介绍与费用区，缩为含校徽、类型、QS / 日本排名的紧凑卡片；日本排名使用独立的 japanRank / japanRankYear / japanRankSource，旧页面省略字段时由工作区保存逻辑保留。官网图片候选来自 Cheerio / CDP 实际 img 元素，模型仅能选择来源中存在的链接；图片代理沿用公开 DNS 校验与逐跳重定向保护，大小上限 3MB，SVG 拒绝外部依赖并施加 CSP。确认后浏览器转换为本地 PNG，通过既有校徽上传接口保存，替换已有校徽需确认。

独立官网收集菜单已撤下，collection 路由只作为查询进度与结果页。查询表单固定网址、入学年份、申请身份、备注、Agent/API 五项；ai.resolveRequest 为单任务选择已启用的对应连接，保留原功能启停与权限策略，不改变全局功能分配。parent 传递新增所在上级，仅用于辅助与优先复用，名称差异明确提醒。身份原文连同辅助 degree 保存到任务 context。

特殊项目使用 purpose=special_program 和 specialProgram 字段数组，确认后经原项目校验器创建，项目创建与任务完成 / 历史同事务保存。PDF hash 重新校验，事务内重读任务状态以防重复生成；原件与摘要关联至项目详情。

设置新增 migration 13 workspace_preferences 表，版本化保存个人信息与默认查询年份 / 身份。仅这两个默认值自动预填查询，其余个人资料不会自动传给模型。浏览器检测与连接移到设置页，后台 CDP 行为保持只读及仅操作自己的标签页。

AI 管理首页只显示本地 Agent（当前为本机 Codex）与 API 两个入口，原功能分配 / 连接 / 外部 MCP 管理移动到按需载入的 `ai-management-advanced.vue`。旧配置链接继续进入首页；显式 `?advanced=1` 可展开高级设置。

`POST /ai/quick-setup` 接收 mode=local|api。local 复用已有 CLI 路径 / 模型，检测账户与模型列表；需要登录时只返回登录状态，不更改功能分配。api 接收类型、地址、密钥与可选模型，未指定模型且没有可复用模型时读取目录并选聊天模型，模型目录缺失可手动指定。不为检测发起推理，也不将目录访问视为推理已验证。成功后同事务保存连接并将四项功能绑定到该连接，清空逐功能模型覆盖、统一启用；不扩大已有资料权限，不删除旧连接或历史会话。密钥仍仅存在进程内存，失败回滚时恢复原 vault；准备过程中连接被修改 / 删除或原密钥被清除时拒绝过期提交。

## 官网信息收集

`collection-service.mjs` 使用迁移 11 的 collection_jobs / collection_sources / collection_history 保存任务、来源快照和入库历史。collection-web 使用 cheerio 解析公开网页、undici 绑定已校验的公开 DNS 地址并逐跳检查重定向；用户 Chrome 通过 playwright-core CDP 连接，noDefaults 保留用户浏览器设置，只操作任务自己创建的页面。应用退出时关闭自己的页面并断开 CDP 连接，不关闭用户 Chrome。

AI 管理的 web_collection 独立绑定模型。collection-agent 为 Codex / Responses / Chat Completions / DeepSeek 提供 read_web_page、read_collected_source、list_collection_sources；Codex 仍保持原只读权限，网络读取由宿主受限工具执行，没有放开 Shell、其他 MCP、浏览器脚本或全盘权限。工具只读取用户给定及已访问来源中实际出现的链接，来源有条数、大小、解析时间与请求次数边界。模型指令视网页为不可信数据。

探索阶段最多 20 次工具调用；每次返回剩余预算，接近上限提示收尾。Codex bridge 达到上限时以 CODEX_TOOL_LIMIT 原因结束，保留真实错误，不覆盖成用户取消。collection-agent 捕获该边界（API 同时处理轮次 / 上下文边界），再发起一次 tools=[] 的结构化整理，输入来自本任务已标记 read 的缓存页，按页均分有界文本预算、保留 sourceId / 页码与截断标记。真实取消、超时与权限错误不触发新模型请求。POST retry 支持 savedOnly=true，直接整理缓存，不访问网页；任何结果仍经过引用验证与人工入库确认。

模型原始返回保存在 collection_jobs.data.candidate，先保存后解析 / 验证；普通 API view 排除此原始字段。有 candidate 的 savedOnly 重试直接重新校验，不调用模型。字段容器允许 fields 数组或有 value / evidence 的字段映射归一化；白名单、日期格式、已读页与原文引用验证继续执行。未知字段、异常条目、重复冲突逐项跳过并提醒；完全没有有效字段仍报错。schema 的 maxItems 与服务侧条目上限保持一致，避免模型返回超额字段时整份丢弃。

API：GET collection/status；POST collection/browser（本机端口）；GET/POST collection/jobs；GET collection/jobs/:id；POST stop/retry/apply；GET sources/:sourceId 及 /file。apply 明确确认、revision、父子关系、字段白名单、费用、时间适用对象与 PDF hash；正式数据、附件元数据及 provenance 历史同事务保存，文件写入失败清理本次生成文件。已有非空字段替换需 allowReplace=true，缺失名称须用户补充，不编造占位实体。

MVP 限制：单目标关系链与主要老师；浏览器只读正文和链接，未实现任意交互、验证码操作或全站爬取。PDF 页码映射原文件，OCR 引用需看图核对。收集结果在确认前不修改正式档案。

### 按链接层级建档与募集要项摘要

新增任务以 ruleVersion=2 保存 requestedKind=auto|university|school|major|lab|professor 及 seekGuidelines。主链接字段 primaryUrl、辅助 supportingUrl，兼容旧 labUrl / schoolUrl。subject 必须引用主链接已读原文；无法识别时要求在确认页选择对象，不凭页脚扩建下级。入库依据确认后的 targetKind 使用 collectionAncestors 构造白名单，大学 / 研究科任务不要求建立专攻或研究室；额外下级会被拒绝。现有记录仍经父子关系校验。

默认优先募集要项：宿主从已读来源的真实链接中选择最多两个招生入口，已有要项 PDF 可按关键词定位读取每份最多六个关键页（最多两份），不把全文标记已读。Agent 随后继续导航和整理，保留原有来源 / 工具 / 超时上限。admissions 含 status、scope 和带逐字引用的分项 fields；没有要项来源证据时不得标记 found。缺项与归属不确定显式展示。摘要中时间项和具体日期需确认适用对象。

确认采纳的摘要保存在 collection_jobs.data.savedAdmissions 和 collection_history，按 appliedKind 与 resultIds 关联主对象。GET collection/records/:kind/:id 仅返回该主对象最近八次已入库摘要与原件来源，通用 CollectedAdmissions 组件显示在五类详情页。主数据格式不扩展，避免旧页面保存时丢失摘要；原始草稿和未采纳时间仍留在任务中。大学 / 研究科级 PDF 保留在缓存来源，只有实际创建专攻 / 老师的任务才可写入对应资料库。
