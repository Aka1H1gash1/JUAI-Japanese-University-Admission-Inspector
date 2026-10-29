import { execFileSync } from 'node:child_process';
import { chmod, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'darwin')
  throw new Error('macOS 便携包只能在 macOS 上构建。');
const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(directory);
const manifest = JSON.parse(
  await readFile(path.join(directory, 'package.json'), 'utf8'),
);
const arch = process.arch;
const application = path.join(directory, 'dist/JUAI.app');
const contents = path.join(application, 'Contents');
const resources = path.join(contents, 'Resources');
await rm(application, { force: true, recursive: true });
await mkdir(path.join(contents, 'MacOS'), { recursive: true });
await cp(path.join(directory, 'dist/payload'), resources, { recursive: true });
await cp(
  path.join(root, 'desktop/build/icon.icns'),
  path.join(resources, 'JUAI.icns'),
);
const executable = path.join(contents, 'MacOS/JUAI');
await writeFile(
  executable,
  `#!/bin/sh\nJUAI_RESOURCES="$(cd "$(dirname "$0")/../Resources" && pwd)"\nnohup "$JUAI_RESOURCES/runtime/node" "$JUAI_RESOURCES/app/launcher.mjs" >/dev/null 2>&1 &\n`,
);
await chmod(executable, 0o755);
await writeFile(
  path.join(contents, 'Info.plist'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>\n<key>CFBundleDevelopmentRegion</key><string>zh_CN</string>\n<key>CFBundleDisplayName</key><string>JUAI</string>\n<key>CFBundleExecutable</key><string>JUAI</string>\n<key>CFBundleIconFile</key><string>JUAI.icns</string>\n<key>CFBundleIdentifier</key><string>com.juai.browser</string>\n<key>CFBundleInfoDictionaryVersion</key><string>6.0</string>\n<key>CFBundleName</key><string>JUAI</string>\n<key>CFBundlePackageType</key><string>APPL</string>\n<key>CFBundleShortVersionString</key><string>${manifest.version}</string>\n<key>CFBundleVersion</key><string>${manifest.version}</string>\n<key>LSMinimumSystemVersion</key><string>14.0</string>\n<key>NSHighResolutionCapable</key><true/>\n</dict></plist>\n`,
);
execFileSync('codesign', ['--force', '--deep', '--sign', '-', application], {
  stdio: 'inherit',
});
const archive = path.join(
  directory,
  `dist/JUAI-${manifest.version}-mac-${arch}.zip`,
);
await rm(archive, { force: true });
execFileSync('ditto', [
  '-c',
  '-k',
  '--keepParent',
  '--sequesterRsrc',
  application,
  archive,
]);
// oxlint-disable-next-line no-console -- CI reports the release artifact.
console.log(`Created ${archive}`);
