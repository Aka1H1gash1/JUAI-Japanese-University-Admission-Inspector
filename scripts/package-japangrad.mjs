import {
  chmod,
  cp,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const runtimeDir = process.env.NODE_RUNTIME_DIR;
if (!runtimeDir)
  throw new Error(
    '请用 NODE_RUNTIME_DIR 指定已验证的官方 Node.js 24 运行时目录。',
  );
const runtime = path.join(runtimeDir, 'bin/node');
const version = execFileSync(runtime, ['--version'], {
  encoding: 'utf8',
}).trim();
if (!version.startsWith('v24.'))
  throw new Error('打包需要官方 Node.js 24 运行时。');
const platform = execFileSync(
  runtime,
  ['-p', 'process.platform + "-" + process.arch'],
  { encoding: 'utf8' },
).trim();
if (platform !== 'darwin-arm64')
  throw new Error('当前打包入口针对 Apple Silicon Mac。');
const target = path.resolve(root, '../releases/JapanGrad-macOS-arm64');
await mkdir(path.join(target, 'runtime'), { recursive: true });
await mkdir(path.join(target, 'local-server'), { recursive: true });
await cp(runtime, path.join(target, 'runtime/node'));
await chmod(path.join(target, 'runtime/node'), 0o755);
await cp(
  path.join(runtimeDir, 'LICENSE'),
  path.join(target, 'runtime/LICENSE'),
);
await cp(
  path.join(root, 'local-server/server.mjs'),
  path.join(target, 'local-server/server.mjs'),
);
await cp(
  path.join(root, 'local-server/file-types.mjs'),
  path.join(target, 'local-server/file-types.mjs'),
);
await cp(
  path.join(root, 'local-server/japan-geography.json'),
  path.join(target, 'local-server/japan-geography.json'),
);
await cp(
  path.join(root, 'local-server/research-labs.mjs'),
  path.join(target, 'local-server/research-labs.mjs'),
);
await cp(
  path.join(root, 'local-server/planning-fields.mjs'),
  path.join(target, 'local-server/planning-fields.mjs'),
);
for (const name of [
  'analysis-service.mjs',
  'experience-service.mjs',
  'information-service.mjs',
  'admission-analysis.mjs',
  'admission-parser-worker.mjs',
  'admission-fields.json',
  'timeline-fields.mjs',
  'agent-mcp.mjs',
  'package.json',
  'package-lock.json',
])
  await cp(
    path.join(root, 'local-server', name),
    path.join(target, 'local-server', name),
  );
await cp(
  path.join(root, 'local-server/node_modules'),
  path.join(target, 'local-server/node_modules'),
  { recursive: true },
);
const nextWeb = path.join(target, `.web-next-${Date.now()}`);
await rm(path.join(target, 'local-server/admissions-service.mjs'), {
  force: true,
});
await cp(path.join(root, 'apps/web-antd/dist'), nextWeb, {
  recursive: true,
});
try {
  await rename(
    path.join(target, 'web'),
    path.join(path.dirname(target), `.JapanGrad-previous-web-${Date.now()}`),
  );
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
await rename(nextWeb, path.join(target, 'web'));
await writeFile(
  path.join(target, '启动 JapanGrad.command'),
  `#!/bin/zsh\nset -e\nJAPANGRAD_APP_DIR="\${0:A:h}"\nexport JAPANGRAD_STATIC_DIR="$JAPANGRAD_APP_DIR/web"\nexec "$JAPANGRAD_APP_DIR/runtime/node" --disable-warning=ExperimentalWarning "$JAPANGRAD_APP_DIR/local-server/server.mjs" --open\n`,
);
await chmod(path.join(target, '启动 JapanGrad.command'), 0o755);
await writeFile(
  path.join(target, '使用说明.md'),
  await readFile(path.join(root, 'local-server/USER_GUIDE.md')),
);
await writeFile(
  path.join(target, 'BUILD_INFO.json'),
  JSON.stringify(
    {
      application: 'JapanGrad',
      platform,
      node: version,
      builtAt: new Date().toISOString(),
      workspaceDefault: '~/Documents/JapanGradWorkspace',
    },
    null,
    2,
  ),
);
console.log(`已生成可独立启动的软件目录：${target}`);
