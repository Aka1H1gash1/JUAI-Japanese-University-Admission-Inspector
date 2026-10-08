# JapanGrad 前端原型

当前流程：大学清单与横向对比 → 大学内的研究科 → 研究科下属专攻 → 专攻内的老师资料和心仪标记。

初次进入没有预填数据。大学、研究科、专攻和老师均由用户手动新增，并支持编辑、删除。每级只要求名称必填。老师个人主页与研究室主页分别填写，职称下拉选项为助教、讲师、副教授、教授。

数据保存到当前浏览器的 localStorage（`japangrad-university-explorer-v1`）。本地保存用于原型体验，不涉及后端或正式 Workspace。不同浏览器的数据独立。

数据结构版本升级为 2。旧版研究科中的老师归入该研究科的“未分类专攻”；原有组合主页保留到老师个人主页字段，研究室主页待用户补充。迁移前原始数据备份到 `japangrad-university-explorer-v1-before-v2`。旧职称原样保留，编辑时可以重新选择。

从 `apps/web-antd` 启动：

```sh
../../node_modules/.bin/vite --host 127.0.0.1 --port 5666 --strictPort
```

开发地址：`http://127.0.0.1:5666/japan-grad`。大学、研究科和专攻使用独立路由，支持浏览器前进、后退和刷新。

从仓库根目录验证核心流程：

```sh
node scripts/japangrad-smoke.mjs
```

验证使用独立 Chrome 会话，不修改用户的浏览器数据。可通过 `BASE_URL`、`CHROME_PATH` 和 `ARTIFACT_DIR` 指定服务器、Chrome 路径与截图目录。
