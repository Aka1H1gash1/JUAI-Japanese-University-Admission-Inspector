# DeepSeek 应用 API 接入（2026-11-17）

## 范围与依据

本次用户要求将现有功能接入 DeepSeek 新应用 API，明确不开发模拟面试。沿用现有四项 AI 功能绑定、用户自己的连接与密钥，以及“人驱动、AI 草稿、来源核对后确认”的流程。

依据：[API 文档](https://api-docs.deepseek.com/zh-cn/api)、[OCR](https://api-docs.deepseek.com/zh-cn/guides/ocr/)、[Files](https://api-docs.deepseek.com/zh-cn/guides/files_api/)、[文档解析](https://api-docs.deepseek.com/zh-cn/guides/document_parsing/)、[Search / Fetch](https://api-docs.deepseek.com/zh-cn/guides/search/)、[联网工具约束](https://api-docs.deepseek.com/zh-cn/guides/web_tools/)。

## 已接入的业务

| 现有业务 | 接入方式 | 保留的产品边界 |
| --- | --- | --- |
| 募集要项文字提取 | 官方连接下，扫描页 / 显式 OCR 模式调用 `/v1/tools/ocr`，再用现有 JSON 提取流程生成待核对草稿 | 只渲染用户选择的页；原文、页码、适用范围及逐项采纳不变；不直接改档案 |
| 网页收集中的扫描 PDF | 同上，使用该任务选择的连接，识别结果仍标为需原页核对 | 文件哈希核验；原件下载保存；OCR 不升级为文字层匹配 |
| 文档阅读与笔记问答 | 官方 `deepseek-flash` 下通过 `/files` 上传当前授权文件，Chat Completions 引用 `file_id`；PDF / Word 使用 `rich_layout_recognition`，MD / TXT 使用 `user_data` | 只读当前文件；只有本地原文证据才能生成已核验引用；图表/扫描页结论需人工核对；笔记仍须确认保存 |
| 网址解析 / 资料收集 | `/v1/tools/fetch` 获取 Markdown 原文；已有 `/v1/tools/search` 继续用于发现候选链接 | 候选摘要不能作为证据；先保存正文再引用；JSON 最终整理阶段独立；来源与调用预算不变 |
| 工作区助手、教授邮件总结与回信 | 继续使用原有 DeepSeek 模型和函数工具适配 | 查询范围、修改确认、可编辑草稿与不自动发送邮件不变 |

保留 Chat Completions 协议。官方新能力也支持该协议，无需为应用 API 更换协议或重写已有 Agent。此次没有启用内置 `deepseek_web_search` / `deepseek_read_url`：独立 Search / Fetch 已提供现有业务所需能力，并能保留任务来源白名单、读取预算和可核验逐字引用；内置联网模式不支持现有 JSON 输出参数。没有增加 ASR / TTS、模拟面试或自动邮件发送。

## 连接、费用与隔离

- 原生应用接口只认 `https://api.deepseek.com` 官方主机，不将代理、本机或其他服务商的密钥发送给 DeepSeek。Files 额外要求 `deepseek-flash`；独立 OCR / Fetch 不依赖聊天模型。
- OCR 使用当前执行任务的连接快照；本机 Codex 或其他服务商仍使用现有本机 OCR / 图片流程。功能绑定或密钥变化取消任务并清理识别缓存。
- 文档问答首次提问发送当前原文件；页面明确提示上传与费用。Files 设置一小时服务商过期，不永久保存。内存缓存按工作区实例、连接 ID、密钥哈希、内容哈希和解析用途隔离；单实例最多128项 / 8 MiB。文件标识按过期前五分钟失效，不写入聊天历史或数据库。
- 重启会失去缓存，下一次提问可能重新解析计费；并发首次上传不同对话可能各产生请求。不存在持久共享缓存或跨用户复用。
- OCR 仅发送 purpose / file 两个字段；HTTP 200 的 error 对象和非完整页均视为失败。没有自动重试；停止前已上传的识别可能由服务商继续处理和计费。
- Fetch 先通过现有 URL 和公网地址校验。直接 HTTP 读取仍用于保留 PDF 原件、实际导航链接与图片；HTML 正文采用 DeepSeek Fetch。若 Fetch 失败但已取得直接读取的正文，明确记录警告并保留该正文。已授权浏览器读取流程继续保留，浏览器正文不重复交给 Fetch。
- 服务器用量记录区分 `document_ocr` / `document_upload` / `web_fetch`，复用原有出站观察器，不记录正文或密钥；OCR usage 仅是 token 参考值，不能当作实际页数账单。

## 兼容与验证

不修改数据结构、不迁移数据库、不修改旧记录。线上 MySQL 与本地 SQLite 的分工保持不变。只在临时新工作区运行测试，不调用真实付费模型。

接入基线为核心 `c9767de04`，独立分支 `feat/deepseek-app-apis`；修改前 bundle 备份：`../git-backups/deepseek-app-apis-20261117/core.bundle`。保留原有两个未跟踪文件 / 目录。

新增测试覆盖：官方主机与代理凭据隔离、OCR 表单/页序/部分结果/200错误/中止/响应限额、Files 用途/过期/换密钥/缓存、Fetch 公网校验与正文保存、OCR 适配、原生文件消息、多轮函数工具后的文件引用。真实本地 HTTP 业务测试验证文档问答仅上传当前文件并复用，错误文档被拒绝、持久历史没有远端文件 ID / 密钥；募集要项从 PDF 渲染到 OCR、JSON 提取、待确认草稿全链路运行，正式工作区业务数据不变。

最终测试、构建及提交结果见 REFACTOR_PROGRESS.md 最后记录。该初始实现随后经用户授权部署为Server1.2.1，补齐生产multipart传输修复及合成材料真实验收；最终源码/CI/备份/数据校验见REFACTOR_PROGRESS.md最后记录。识别质量未做大规模评测。普通域名当前因Namecheap联系信息验证而解析异常，服务器部署与指定IP的正常TLS验收成功，不等同于普通域名访问已恢复。
