# JUAI Browser Launcher

JUAI v1.2 的主启动方式。启动器不携带 Electron / Chromium，而是运行内置 Node.js 本地服务，再用用户现有 Chrome、Edge 或系统默认浏览器打开。

## 运行结构

```text
JUAI.exe / JUAI.app
  └─ runtime/node
      └─ app/launcher.mjs
          ├─ 127.0.0.1:随机端口（浏览器入口与运行管理）
          └─ 127.0.0.1:随机端口（内部数据服务）
```

浏览器入口会将业务请求代理给内部数据服务。内部端口仍保留原有 Host、Origin 和写请求标识校验。

## 手机入口

手机入口默认不启动。用户在电脑设置页开启后，启动器才在 `0.0.0.0:随机端口` 创建临时网关。

- 首次访问必须使用带 192 bit 随机密钥的链接。
- 验证后设置 `HttpOnly` / `SameSite=Strict` Cookie，并立即移除 URL 中的密钥。
- 手机无法访问开启 / 关闭 / 退出等运行管理接口。
- 关闭手机入口或退出 JUAI 后，端口与密钥立即失效。

这是局域网访问，不是云同步。电脑必须保持开机，且电脑与手机必须在同一网络。

## 开发验证

```sh
node --test browser/launcher.test.mjs
node browser/verify-package.mjs browser/dist/payload
```

`prepare.mjs` 要求目标平台的 Node.js 24 LTS，并将该运行时一起放入便携包，终端用户无需安装 Node.js。
