import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

import semver from 'semver';

export const REPOSITORY =
  'Aka1H1gash1/JUAI-Japanese-University-Admission-Inspector';
export const RELEASES_URL = `https://github.com/${REPOSITORY}/releases`;
const API = `https://api.github.com/repos/${REPOSITORY}/releases?per_page=100`;
const MAX_SIZE = 2 * 1024 ** 3;

function installerName(version, platform, arch) {
  if (platform === 'darwin' && ['arm64', 'x64'].includes(arch))
    return `JUAI-${version}-mac-${arch}.dmg`;
  if (platform === 'win32' && arch === 'x64')
    return `JUAI-${version}-win-x64.msi`;
  throw new Error('此系统或架构暂未提供安装包，请在发布页查看。');
}

function trustedAssetUrl(value, tag, name) {
  const url = new URL(value);
  return (
    url.protocol === 'https:' &&
    !url.username &&
    !url.password &&
    url.origin === 'https://github.com' &&
    url.pathname ===
      `/${REPOSITORY}/releases/download/${encodeURIComponent(tag)}/${name}` &&
    !url.search &&
    !url.hash
  );
}

export function selectRelease(
  releases,
  { currentVersion, platform, arch, channel = 'preview' },
) {
  if (!semver.valid(currentVersion) || !Array.isArray(releases))
    throw new Error('版本信息格式不正确。');
  const candidates = releases
    .filter((release) => {
      const version = semver.valid(release.tag_name);
      return (
        !release.draft &&
        (channel === 'preview' ||
          (!release.prerelease && !semver.prerelease(version))) &&
        version &&
        semver.gt(version, currentVersion)
      );
    })
    .toSorted((left, right) =>
      semver.rcompare(
        semver.valid(left.tag_name),
        semver.valid(right.tag_name),
      ),
    );
  for (const release of candidates) {
    const version = semver.valid(release.tag_name);
    const name = installerName(version, platform, arch);
    const asset = release.assets?.find(
      (item) => item.name === name && item.state === 'uploaded',
    );
    // Only offer a release after its installer AND checksum list have been published.
    if (
      !asset ||
      !release.assets.some(
        (item) => item.name === 'SHA256SUMS.txt' && item.state === 'uploaded',
      )
    )
      continue;
    if (
      !Number.isSafeInteger(asset.size) ||
      Math.sign(asset.size) !== 1 ||
      asset.size > MAX_SIZE ||
      !/^sha256:[a-f\d]{64}$/i.test(asset.digest || '') ||
      !trustedAssetUrl(asset.browser_download_url, release.tag_name, name)
    )
      continue;
    return {
      version,
      name,
      tag: release.tag_name,
      size: asset.size,
      digest: asset.digest.slice(7).toLowerCase(),
      url: asset.browser_download_url,
      releaseUrl: `${RELEASES_URL}/tag/${encodeURIComponent(release.tag_name)}`,
      notes: String(release.body || '').slice(0, 3000),
      prerelease: !!release.prerelease,
    };
  }
  return undefined;
}

export async function checkRelease(options, request = fetch) {
  const response = await request(API, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': `JUAI/${options.currentVersion}`,
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok)
    throw new Error(
      response.status === 403 || response.status === 429
        ? 'GitHub 暂时限制了检查频率，请稍后再试。'
        : `无法检查更新（HTTP ${response.status}）。`,
    );
  const body = await response.text();
  if (body.length > 4 * 1024 * 1024)
    throw new Error('更新信息过大，请稍后重试。');
  return selectRelease(JSON.parse(body), options);
}

async function fileDigest(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

export async function downloadRelease(
  release,
  { directory, signal, onProgress = () => {} },
  request = fetch,
) {
  if (
    !trustedAssetUrl(release.url, release.tag, release.name) ||
    release.name !== path.basename(release.name) ||
    !/^[a-f\d]{64}$/.test(release.digest) ||
    !Number.isSafeInteger(release.size) ||
    Math.sign(release.size) !== 1 ||
    release.size > MAX_SIZE
  )
    throw new Error('安装包信息不可信，已停止下载。');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  signal?.throwIfAborted();
  const file = path.join(directory, release.name);
  try {
    const existing = await stat(file);
    const valid =
      existing.size === release.size &&
      (await fileDigest(file)) === release.digest;
    signal?.throwIfAborted();
    if (valid) return file;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const temporary = `${file}.${randomUUID()}.partial`;
  let output;
  try {
    const response = await request(release.url, {
      signal: AbortSignal.any(
        [signal, AbortSignal.timeout(30 * 60_000)].filter(Boolean),
      ),
      headers: { 'User-Agent': 'JUAI Desktop Updater' },
    });
    if (!response.ok || !response.body)
      throw new Error(`安装包下载失败（HTTP ${response.status}）。`);
    const finalUrl = new URL(response.url || release.url);
    if (
      finalUrl.protocol !== 'https:' ||
      ![
        'github.com',
        'objects.githubusercontent.com',
        'release-assets.githubusercontent.com',
      ].includes(finalUrl.hostname)
    )
      throw new Error('下载被重定向到了非官方地址。');
    output = await open(temporary, 'wx', 0o600);
    let received = 0;
    const hash = createHash('sha256');
    for await (const chunk of response.body) {
      signal?.throwIfAborted();
      received += chunk.byteLength;
      if (received > release.size) throw new Error('安装包大小不匹配。');
      hash.update(chunk);
      await output.writeFile(chunk);
      onProgress({
        received,
        total: release.size,
        percent: Math.floor((received / release.size) * 100),
      });
    }
    signal?.throwIfAborted();
    if (received !== release.size || hash.digest('hex') !== release.digest)
      throw new Error('安装包校验失败，已丢弃下载文件，请重试。');
    await output.sync();
    await output.close();
    output = undefined;
    // Windows cannot rename over a previously downloaded installer.
    await rm(file, { force: true });
    await rename(temporary, file);
    return file;
  } finally {
    await output?.close();
    await rm(temporary, { force: true });
  }
}
