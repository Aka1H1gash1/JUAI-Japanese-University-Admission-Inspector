# JUAI 桌面打包

桌面包用 Electron 显示既有网页，单独内置官方 Node.js 24 LTS 来运行 SQLite、本地 API 和文件解析器，不依赖 Electron 的 Node ABI。前端没有 Node 权限；本地服务仅监听回环地址，由父进程分配空闲端口，退出应用时先关闭任务与数据库。应用只允许在本地页面内导航，官网和邮件链接交给系统浏览器。

版本号由本目录 `package.json` 单独维护，不沿用框架版本号。MSI 的 `appId` 和 `upgradeCode` 必须保持稳定，后续升级才能识别同一个应用。卸载器不包含用户的 `Documents/JapanGradWorkspace`。

## 检查更新与资料保护

从 0.1.1 起，桌面版在启动后和运行期间每隔 6 小时检查本仓库的 GitHub Releases；也可从「帮助 → 检查更新」手动检查。默认通道包含正式版和预览版，可在「帮助」菜单切换到仅正式版或关闭自动检查。检查不上传工作区资料。

发布新版本时，先递增 `desktop/package.json` 与锁文件中的版本，构建并验证三个安装包，上传 `JUAI-<版本>-mac-arm64.dmg`、`JUAI-<版本>-mac-x64.dmg`、`JUAI-<版本>-win-x64.msi` 及 `SHA256SUMS.txt`，最后公开 `v<版本>` Release。更新器忽略草稿、旧版本和缺少当前平台附件的发布，并按 GitHub 提供的 SHA-256 摘要核对下载。请勿替换已经公开版本的安装包；修复应发布新版本。

用户确认后才下载安装。Windows 会先正常关闭本地服务再打开 MSI 覆盖安装向导；macOS 会打开 DMG，用户将 JUAI 拖入应用程序并替换。当前无 Apple Developer ID 公证，因此此流程不承诺静默替换。0.1.0 没有更新器，需要手动覆盖安装一次 0.1.1 或更新版本。

每次首次运行不同版本时，在任何数据库迁移之前，内置 Node 进程会把工作区备份到旁边的 `JapanGradWorkspace.backups/<日期>-before-<版本>-<标识>`。数据库通过 SQLite backup API 保存，包含已提交 WAL 数据；上传的文件一并复制。备份失败会停止启动；高于支持版本的数据库会拒绝打开。服务成功启动后才更新 `.juai-desktop-version.json`，同版本再次启动不重复备份。新增数据库 migration 时须同步更新 `workspace-upgrade.mjs` 中的 schema 上限，测试会检查是否遗漏。

恢复资料时先退出所有使用该工作区的 JUAI / 便携版服务，保留当前文件夹作为副本，再把完整备份复制回工作区。不要在软件运行时单独替换 `workspace.db`。备份不会自动删除，可由用户自行整理。

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
