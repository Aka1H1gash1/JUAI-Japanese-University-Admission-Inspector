import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import {
  chmod,
  cp,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(directory);
const manifest = JSON.parse(
  await readFile(path.join(directory, 'package.json'), 'utf8'),
);
const node = process.env.NODE_RUNTIME_PATH || process.execPath;
const runtime = JSON.parse(
  execFileSync(
    node,
    [
      '-p',
      'JSON.stringify({version:process.version,platform:process.platform,arch:process.arch})',
    ],
    { encoding: 'utf8' },
  ),
);
if (!runtime.version.startsWith('v24.'))
  throw new Error('JUAI v1.2 便携包必须内置 Node.js 24 LTS。');
if (!['darwin', 'win32'].includes(runtime.platform))
  throw new Error('当前便携包支持 macOS 和 Windows。');

const target = path.join(directory, 'dist/payload');
await rm(target, { force: true, recursive: true });
await mkdir(path.join(target, 'app'), { recursive: true });
await mkdir(path.join(target, 'local-server'), { recursive: true });
await mkdir(path.join(target, 'runtime'), { recursive: true });

await cp(
  path.join(directory, 'launcher.mjs'),
  path.join(target, 'app/launcher.mjs'),
);
await cp(
  path.join(directory, 'package.json'),
  path.join(target, 'app/package.json'),
);
await cp(
  path.join(root, 'desktop/workspace-upgrade.mjs'),
  path.join(target, 'app/workspace-upgrade.mjs'),
);
await cp(
  node,
  path.join(
    target,
    'runtime',
    runtime.platform === 'win32' ? 'node.exe' : 'node',
  ),
);
if (runtime.platform !== 'win32')
  await chmod(path.join(target, 'runtime/node'), 0o755);

let nodeLicense;
for (const candidate of [
  path.join(path.dirname(node), 'LICENSE'),
  path.join(path.dirname(node), '../LICENSE'),
]) {
  try {
    nodeLicense = await readFile(candidate);
    break;
  } catch {}
}
if (!nodeLicense) {
  const response = await fetch(
    `https://raw.githubusercontent.com/nodejs/node/${runtime.version}/LICENSE`,
  );
  if (!response.ok) throw new Error('无法获取 Node.js 开源许可。');
  nodeLicense = Buffer.from(await response.arrayBuffer());
}
await writeFile(path.join(target, 'runtime/LICENSE'), nodeLicense);

for (const entry of await readdir(path.join(root, 'local-server'), {
  withFileTypes: true,
})) {
  if (
    entry.isFile() &&
    /\.(?:mjs|json|swift)$/.test(entry.name) &&
    !/(?:\.test\.|test-fixtures)/.test(entry.name)
  )
    await cp(
      path.join(root, 'local-server', entry.name),
      path.join(target, 'local-server', entry.name),
    );
}
await cp(
  path.join(root, 'local-server/node_modules'),
  path.join(target, 'local-server/node_modules'),
  {
    recursive: true,
    filter: (source) =>
      !/\.(?:map|ts|tsx)$/.test(source) &&
      !['.bin', '__tests__', 'examples', 'test', 'tests'].includes(
        path.basename(source),
      ),
  },
);
await cp(path.join(root, 'apps/web-antd/dist'), path.join(target, 'web'), {
  recursive: true,
});
await cp(path.join(root, 'LICENSES'), path.join(target, 'licenses'), {
  recursive: true,
});
await cp(
  path.join(root, 'LICENSE'),
  path.join(target, 'licenses/JUAI-MIT.txt'),
);
await cp(
  path.join(root, 'local-server/USER_GUIDE.md'),
  path.join(target, '使用说明.md'),
);

if (runtime.platform === 'darwin') {
  await mkdir(path.join(target, 'local-server/bin'), { recursive: true });
  execFileSync(
    'swiftc',
    [
      '-O',
      '-target',
      `${runtime.arch === 'arm64' ? 'arm64' : 'x86_64'}-apple-macosx14.0`,
      path.join(root, 'local-server/ocr-vision.swift'),
      '-o',
      path.join(target, 'local-server/bin/juai-ocr'),
    ],
    { stdio: 'inherit' },
  );
}

await writeFile(
  path.join(target, 'BUILD_INFO.json'),
  JSON.stringify(
    {
      application: 'JUAI Browser',
      builtAt: new Date().toISOString(),
      commit:
        process.env.GITHUB_SHA ||
        execFileSync('git', ['rev-parse', 'HEAD'], {
          cwd: root,
          encoding: 'utf8',
        }).trim(),
      runtime,
      version: manifest.version,
    },
    null,
    2,
  ),
);

// oxlint-disable-next-line no-console -- CI reports the prepared target.
console.log(
  `Prepared JUAI Browser ${manifest.version} (${runtime.platform}-${runtime.arch}, ${runtime.version}).`,
);
