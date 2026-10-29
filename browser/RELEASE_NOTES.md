# JUAI v1.2.0 · 本地浏览器版

JUAI v1.2 将主要运行方式改为用户自己的 Chrome / Edge，不再携带 Electron 和另一套 Chromium。

## 本次更新

- 双击 JUAI 后自动启动本地数据服务，并优先在现有 Google Chrome 中打开。
- 所有 SQLite、文件、笔记和 AI 配置继续保存在 `Documents/JapanGradWorkspace`。
- 不需要用户安装 Node.js、pnpm、Electron 或数据库。
- 提供 Windows x64、macOS Apple Silicon 和 macOS Intel 便携 ZIP。
- 单实例启动：再次点击 JUAI 只会重新打开页面，不会启动第二个数据库进程。
- 从旧版本首次启动 v1.2 时，在数据库迁移前自动创建完整工作区备份。
- 设置页可临时开启手机局域网访问；默认关闭，链接带随机密钥，退出后立即失效。
- 保留现有响应式手机布局。

## 使用

### Windows

1. 下载 `JUAI-1.2.0-windows-x64.zip` 并完整解压。
2. 双击文件夹中的 `JUAI.exe`。
3. 不要单独移动 EXE；运行时需要同文件夹内的 `runtime`、`web` 和 `local-server`。

### macOS

1. 下载与芯片匹配的 ZIP 并解压。
2. 将 `JUAI.app` 拖入「应用程序」或直接双击。
3. 当前为未公证预览包；首次可需要在 Finder 中右键点击「打开」。

## 手机访问

在电脑版「设置 → 手机访问」中开启，确保电脑与手机位于同一 Wi-Fi，再在手机打开生成的临时链接。手机访问期间电脑必须保持开机且 JUAI 保持运行。
