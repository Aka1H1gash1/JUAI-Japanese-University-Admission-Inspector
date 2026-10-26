import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
// oxlint-disable-next-line vitest/no-import-node-test -- Installer checks run with the actual Node runtime, without frontend dependencies.
import { test } from 'node:test';

import {
  downloadRelease,
  REPOSITORY,
  selectRelease,
} from './update-client.mjs';

const bytes = new TextEncoder().encode('verified JUAI installer fixture');
const digest = createHash('sha256').update(bytes).digest('hex');
function release(version, options = {}) {
  const tag = `v${version}`;
  const name = `JUAI-${version}-win-x64.msi`;
  return {
    tag_name: tag,
    draft: false,
    prerelease: false,
    assets: [
      {
        name,
        state: 'uploaded',
        size: bytes.length,
        digest: `sha256:${digest}`,
        browser_download_url: `https://github.com/${REPOSITORY}/releases/download/${tag}/${name}`,
      },
      { name: 'SHA256SUMS.txt', state: 'uploaded' },
    ],
    ...options,
  };
}
const options = {
  currentVersion: '0.1.1',
  platform: 'win32',
  arch: 'x64',
  channel: 'stable',
};

test('selects a newer complete release for this architecture, respecting preview channels', () => {
  const candidates = [
    release('0.1.0'),
    release('0.1.1'),
    release('0.2.0-beta.1', { prerelease: true }),
    release('0.1.3', { draft: true }),
    release('0.1.2'),
  ];
  assert.equal(selectRelease(candidates, options).version, '0.1.2');
  assert.equal(
    selectRelease(candidates, { ...options, channel: 'preview' }).version,
    '0.2.0-beta.1',
  );
  assert.equal(
    selectRelease(candidates, {
      ...options,
      platform: 'darwin',
      arch: 'arm64',
    }),
    undefined,
  );
  assert.equal(selectRelease([release('0.1.0')], options), undefined);
});
test('does not offer incomplete releases, missing hashes, or installers hosted outside the official repository', () => {
  const unsafe = release('0.1.2');
  unsafe.assets[0].browser_download_url =
    'https://github.com/other/repo/releases/download/v0.1.2/JUAI-0.1.2-win-x64.msi';
  assert.equal(selectRelease([unsafe], options), undefined);
  const noHash = release('0.1.2');
  delete noHash.assets[0].digest;
  assert.equal(selectRelease([noHash], options), undefined);
  const incomplete = release('0.1.2');
  incomplete.assets.pop();
  assert.equal(selectRelease([incomplete], options), undefined);
});
test('downloads and verifies bytes before promoting a file; a corrupt download leaves no installer', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'juai-download-'));
  try {
    const selected = selectRelease([release('0.1.2')], options);
    await assert.rejects(
      downloadRelease(
        selected,
        { directory },
        async () => new Response('tampered'),
      ),
    );
    assert.deepEqual(await readdir(directory), []);
    const file = await downloadRelease(
      selected,
      { directory },
      async () => new Response(bytes),
    );
    assert.equal(
      createHash('sha256')
        .update(await readFile(file))
        .digest('hex'),
      digest,
    );
    await downloadRelease(selected, { directory }, async () => {
      throw new Error('A verified cached file should not be downloaded again');
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test('cancellation removes partial downloads', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'juai-cancel-'));
  try {
    const controller = new AbortController();
    const stream = new ReadableStream({
      start(output) {
        output.enqueue(bytes.slice(0, 5));
        output.enqueue(bytes.slice(5));
        output.close();
      },
    });
    await assert.rejects(
      downloadRelease(
        selectRelease([release('0.1.2')], options),
        {
          directory,
          signal: controller.signal,
          onProgress: () => controller.abort(),
        },
        async () => new Response(stream),
      ),
    );
    assert.deepEqual(await readdir(directory), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
