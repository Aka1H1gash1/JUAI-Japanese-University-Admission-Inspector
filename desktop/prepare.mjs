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
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(directory);
const require = createRequire(path.join(root, 'local-server/package.json'));
const { createCanvas } = require('@napi-rs/canvas');
const node = process.env.NODE_RUNTIME_PATH || process.execPath;
const runtime = JSON.parse(
  execFileSync(
    node,
    [
      '-p',
      'JSON.stringify({version:process.version,platform:process.platform,arch:process.arch})',
    ],
    {
      encoding: 'utf8',
    },
  ),
);
if (!runtime.version.startsWith('v24.'))
  throw new Error('桌面包必须内置 Node.js 24 LTS。');
if (runtime.platform !== process.platform || runtime.arch !== process.arch)
  throw new Error('请在目标平台和架构的构建机上准备资源。');
if (!['darwin', 'win32'].includes(process.platform))
  throw new Error('当前安装包支持 macOS 与 Windows。');

const target = path.join(directory, 'resources/service');
await rm(target, { recursive: true, force: true });
await mkdir(path.join(target, 'runtime'), { recursive: true });
await mkdir(path.join(target, 'local-server'), { recursive: true });
await cp(
  node,
  path.join(
    target,
    'runtime',
    process.platform === 'win32' ? 'node.exe' : 'node',
  ),
);
if (process.platform !== 'win32')
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
await cp(path.join(directory, 'service.mjs'), path.join(target, 'service.mjs'));
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
    // Runtime packages do not need declarations, source maps or SDK example servers.
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
  path.join(target, 'USER_GUIDE.md'),
);
if (process.platform === 'darwin') {
  await mkdir(path.join(target, 'local-server/bin'), { recursive: true });
  execFileSync(
    'swiftc',
    [
      '-O',
      '-target',
      `${process.arch === 'arm64' ? 'arm64' : 'x86_64'}-apple-macosx14.0`,
      path.join(root, 'local-server/ocr-vision.swift'),
      '-o',
      path.join(target, 'local-server/bin/juai-ocr'),
    ],
    { stdio: 'inherit' },
  );
}
const manifest = JSON.parse(
  await readFile(path.join(directory, 'package.json'), 'utf8'),
);
await writeFile(
  path.join(target, 'BUILD_INFO.json'),
  JSON.stringify(
    {
      application: 'JUAI',
      version: manifest.version,
      runtime,
      builtAt: new Date().toISOString(),
      commit:
        process.env.GITHUB_SHA ||
        execFileSync('git', ['rev-parse', 'HEAD'], {
          cwd: root,
          encoding: 'utf8',
        }).trim(),
    },
    null,
    2,
  ),
);

// Keep the app icon self-contained and consistent across Dock, Start Menu and installers.
const build = path.join(directory, 'build');
await mkdir(build, { recursive: true });
function icon(size) {
  const canvas = createCanvas(size, size);
  const context = canvas.getContext('2d');
  context.scale(size / 1024, size / 1024);
  context.fillStyle = '#454ec0';
  context.beginPath();
  context.roundRect(24, 24, 976, 976, 220);
  context.fill();
  context.strokeStyle = '#f7f7ff';
  context.fillStyle = '#f7f7ff';
  context.lineWidth = 29;
  context.lineJoin = 'round';
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(512, 350);
  context.bezierCurveTo(430, 296, 310, 296, 224, 325);
  context.lineTo(224, 674);
  context.bezierCurveTo(310, 645, 430, 645, 512, 700);
  context.bezierCurveTo(594, 645, 714, 645, 800, 674);
  context.lineTo(800, 325);
  context.bezierCurveTo(714, 296, 594, 296, 512, 350);
  context.lineTo(512, 700);
  context.stroke();
  context.fillStyle = '#f3a38b';
  context.beginPath();
  context.arc(725, 250, 69, 0, Math.PI * 2);
  context.fill();
  return canvas.toBuffer('image/png');
}
await writeFile(path.join(build, 'icon.png'), icon(1024));
const icoImages = [16, 32, 48, 64, 128, 256].map((size) => ({
  size,
  data: icon(size),
}));
const icoHeader = Buffer.alloc(6 + 16 * icoImages.length);
icoHeader.writeUInt16LE(1, 2);
icoHeader.writeUInt16LE(icoImages.length, 4);
let offset = icoHeader.length;
icoImages.forEach(({ size, data }, index) => {
  const position = 6 + index * 16;
  icoHeader[position] = size === 256 ? 0 : size;
  icoHeader[position + 1] = size === 256 ? 0 : size;
  icoHeader.writeUInt16LE(1, position + 4);
  icoHeader.writeUInt16LE(32, position + 6);
  icoHeader.writeUInt32LE(data.length, position + 8);
  icoHeader.writeUInt32LE(offset, position + 12);
  offset += data.length;
});
await writeFile(
  path.join(build, 'icon.ico'),
  Buffer.concat([icoHeader, ...icoImages.map(({ data }) => data)]),
);
if (process.platform === 'darwin') {
  const iconset = path.join(build, 'icon.iconset');
  await mkdir(iconset, { recursive: true });
  for (const size of [16, 32, 128, 256, 512]) {
    await writeFile(path.join(iconset, `icon_${size}x${size}.png`), icon(size));
    await writeFile(
      path.join(iconset, `icon_${size}x${size}@2x.png`),
      icon(size * 2),
    );
  }
  execFileSync('iconutil', [
    '-c',
    'icns',
    iconset,
    '-o',
    path.join(build, 'icon.icns'),
  ]);
}
// oxlint-disable-next-line no-console -- Report the generated package version and target to the build job.
console.log(
  `Prepared JUAI ${manifest.version} (${runtime.platform}-${runtime.arch}, ${runtime.version}).`,
);
