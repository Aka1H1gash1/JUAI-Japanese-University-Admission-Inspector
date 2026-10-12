# JUAI 募集要项分析与 Agent 工作区接入

状态：申请轮次、原文读取 / 初步字段定位、核对采纳、任务包和本地 STDIO MCP 已实现。独立 OCR、应用内模型 API 与本地模型调用尚未实现。

## 使用入口

修考之路 →「申请年度与资料分析」，或专攻详情 → 申请轮次。新增轮次后，在「募集要项分析」选择募集要项 / 补充资料，生成待核对草稿。文件详情中的「分析这份募集要项」可带入资料选择。

轮次独立保存入学年月、学位、选拔类别与批次、关联研究室、要求、材料准备、提交编号与结果。明确日期进入本轮日程与所关联想考研究室的时间线；通用要求保留独立维护入口。

## 原文与草稿

- PDF.js 在 Worker 中提取文字和分页位置，按需渲染 PDF 页面 PNG；每文件最多 300 页、200 万字，读取 / 渲染超时 90 秒，Worker 堆限制 512 MB。
- DOCX 使用 Mammoth 提取全文，逻辑块 1 不代表 Word 排版页码。MD / TXT 支持 UTF-8 / UTF-16，每 100 行一个逻辑块并保留行号说明。旧 DOC 需转换后分析。
- 本地按标题、完整明确日期和检定料数值定位候选字段，不判断资格或选择对应选拔类别。扫描页、表格和内容解释由用户或支持图片理解的 Agent 核对。
- 状态区分 found、not_found、unreadable、conflict；非 found 值留空，found 必须带原文证据。核对页可人工补录，并记录为核对修改。
- 来源证据含资料 ID、SHA256、逻辑页 / 块、原文。可匹配提取文本时标为 text_matched，否则标为 visual_review，要求对照原图。

每个任务 1–10 份已选募集要项，总计最多 100 MB，单文件 50 MB，最多同时排队 / 读取 4 个任务。读取为异步队列，服务重启后中断任务可手动重试。

## 任务包

读取完成后可下载 ZIP：

```text
AGENTS.md                  # 分析与原文引用要求
context.json               # 大学、专攻、关联研究室和当前轮次
task.json                  # 固定任务上下文和来源 hash
sources/<资料ID>.<格式>    # 所选原文件
parsed/<资料ID>.json      # 分页文字、位置说明和读取警告
result.schema.json         # 当前任务专属结果 Schema
result.template.json       # Agent 可填写的模板
```

Agent 输出 result.json，再拖拽 / 选择单个 JSON 文件导入（最大 8 MB）。系统验证任务、来源、字段长度、状态和页码；结果进入草稿，不直接修改正式记录。资料中的操作指令作为文档内容处理。

## 本地 MCP

UI 的「Agent 工作区接入」创建按专攻授权的连接，生成通用 MCP JSON 或 Codex TOML。令牌仅创建时返回，数据库保存 SHA256，列表不返回明文或 hash；支持即时撤销后续请求。

`agent-mcp.mjs` 使用维护中的官方 SDK v1.32.1，STDIO 传输；HTTP 请求只允许本机工作台地址，重定向关闭，并携带 Bearer 令牌。标准输出仅用于 MCP 协议。

| 工具 | 能力 |
| --- | --- |
| search_workspace | 搜索授权专攻、研究室与申请轮次，分页返回 |
| get_admission_cycle | 轮次及所属大学 / 专攻、关联研究室、已有任务 |
| list_documents | 指定授权专攻的募集要项清单 |
| create_analysis_task | 给已有轮次选择资料创建读取任务 |
| get_analysis_task | 状态、来源与最近 20 份提取草稿 |
| read_document_pages | 每次 1–5 页文字，超长页返回截取标记 |
| read_document_page_image | PDF 指定页 PNG，供支持图片的模型核对 |
| get_analysis_result_schema | 本任务结果 Schema |
| submit_analysis_proposal | 带幂等 requestKey 提交草稿 |

服务端逐次检查授权专攻与资料所属关系。邮件正文、教授联络草稿不通过这些工具提供。采纳接口不向 Agent 开放，模型不直接改 SQLite 或整份工作区快照。

## 保存与核对约束

- SQLite 追加 migration 3：admission_cycles、analysis_jobs、analysis_proposals、analysis_documents、admission_history、agent_connections。沿用原资料目录，升级保留既有数据。
- 正式采纳前重新读取来源计算 hash；来源变化或轮次入学年月、学位、选拔类别、批次变化时拒绝旧结果，要求新建任务。
- 轮次保存 / 采纳检查 revision，事务内保存要求、来源和历史版本。已有值替换需用户确认；未选字段保留。
- 采纳材料可按核对后的逐行内容生成当前轮次清单，去重且最多 200 项；明确日期才进入日历。
- 外部 Agent 可独立使用自己的模型服务。本地连接不承诺模型推理离线；处理方式由 Agent / 模型配置决定。

## 开发与打包

在仓库根目录执行 `pnpm setup:japangrad-server`（等价于 `npm ci --prefix local-server --ignore-scripts --no-audit --no-fund`）。本地服务依赖有独立 package-lock.json，打包复制解析器、MCP 桥接与 node_modules，终端用户不需安装开发依赖。

参考：[MCP SDK v1](https://ts.sdk.modelcontextprotocol.io/)、[PDF.js](https://mozilla.github.io/pdf.js/)、[Codex MCP](https://developers.openai.com/codex/mcp)。
