# JUAI 桌面打包

桌面包用 Electron 显示既有网页，单独内置官方 Node.js 24 LTS 来运行 SQLite、本地 API 和文件解析器，不依赖 Electron 的 Node ABI。前端没有 Node 权限；本地服务仅监听回环地址，由父进程分配空闲端口，退出应用时先关闭任务与数据库。应用只允许在本地页面内导航，官网和邮件链接交给系统浏览器。

版本号由本目录 `package.json` 单独维护，首次为 `0.1.0`，不沿用框架版本号。MSI 的 `appId` 和 `upgradeCode` 必须保持稳定，后续升级才能识别同一个应用。卸载器不包含用户的 `Documents/JapanGradWorkspace`。

## 本机构建

在目标系统和架构上，安装 Node.js 24 与项目指定的 pnpm，然后在仓库根目录执行：

```sh
pnpm install --frozen-lockfile
pnpm build:japangrad
npm ci --prefix local-server --ignore-scripts
npm ci --prefix desktop
node desktop/prepare.mjs
```

macOS 需要 Xcode Command Line Tools，用于编译系统 Vision OCR 与生成图标。Windows 使用与目标架构一致的依赖，不复制 Mac 的 `node_modules`。

```sh
# 在 desktop 目录内构建当前平台对应的安装包
npm run package -- --mac --arm64
npm run package -- --mac --x64
npm run package -- --win --x64
```

安装包输出到 `desktop/dist`。若开发时使用其他版本 Node，可用 `NODE_RUNTIME_PATH` 指定官方 Node.js 24 的可执行文件；CI 固定使用 24.22.1。

`node desktop/verify-service.mjs <安装包中的 resources/service 路径>` 用全新临时工作区确认内置运行时、SQLite、静态前端和服务关闭流程。它不会访问个人工作区。检查 Electron 窗口时，也可设置 `JAPANGRAD_WORKSPACE` 指向临时目录。

## GitHub 构建与发布

手动运行 `JUAI Desktop Release` 工作流。它先构建共享前端，然后分别在 Apple Silicon Mac、Intel Mac、Windows x64 构建机生成 DMG / MSI，验证包内服务、真实窗口、欢迎页到申请总览的导航和渲染隔离；在 Windows 上实际静默安装，再验证已安装服务与窗口后卸载。成功后，下载 `juai-release-installers` artifact，核对三份安装包和 `SHA256SUMS.txt`，再创建对应版本的 GitHub Release 并上传文件。

工作流不会自行公开发布，避免把未完成的安装包发布出去。首次发布说明见 [RELEASE_NOTES.md](RELEASE_NOTES.md)。Mac 使用 ad-hoc 本地签名保证包结构完整，但尚无 Apple Developer ID 签名 / 公证和 Windows 发布者签名。安装提示如实写在发布说明中，后续可通过构建密钥配置。
