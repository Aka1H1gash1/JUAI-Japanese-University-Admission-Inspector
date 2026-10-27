import assert from 'node:assert/strict';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '../local-server/package.json'));
const { _electron: electron } = require('playwright-core');
const [mode, executable, workspace] = process.argv.slice(2);
if (
  !['seed', 'verify'].includes(mode) ||
  !executable ||
  !workspace ||
  !path.basename(workspace).startsWith('juai-upgrade-')
)
  throw new Error(
    'Specify seed/verify, an app executable and a dedicated juai-upgrade-* test workspace.',
  );
let application;
const watchdog = setTimeout(() => {
  console.error(`Upgrade ${mode} verification exceeded 90 seconds.`);
  application?.process().kill();
  // oxlint-disable-next-line unicorn/no-process-exit -- This dedicated fixture process must never hang a release runner.
  process.exit(1);
}, 90_000);
console.warn(`Upgrade ${mode}: launching the installed app.`);
application = await electron.launch({
  executablePath: path.resolve(executable),
  env: { ...process.env, JAPANGRAD_WORKSPACE: path.resolve(workspace) },
  timeout: 30_000,
});
try {
  console.warn(`Upgrade ${mode}: desktop process connected.`);
  let window;
  for (let attempt = 0; attempt < 150; attempt++) {
    window = application
      .windows()
      .find((page) => page.url().endsWith('/welcome'));
    if (window) break;
    await delay(200);
  }
  assert.ok(
    window,
    'The upgraded desktop must finish backup and open its welcome page',
  );
  await window.locator('#welcome-title').waitFor();
  console.warn(`Upgrade ${mode}: welcome page ready.`);
  if (mode === 'seed') {
    const status = await window.evaluate(async () => {
      const response = await fetch('/api/japangrad/workspace');
      const snapshot = await response.json();
      snapshot.data.universities.push({
        id: 'upgrade-preservation-university',
        name: '升级前的大学',
        japaneseName: '',
        location: '东京',
        category: 'national',
        website: '',
        notes: '这条笔记必须在升级后保留。',
      });
      const saved = await fetch('/api/japangrad/workspace', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-JapanGrad-Client': '1',
        },
        body: JSON.stringify({
          revision: snapshot.revision,
          data: snapshot.data,
        }),
      });
      return saved.status;
    });
    assert.equal(status, 200);
    await writeFile(
      path.join(workspace, 'paper-preservation.txt'),
      'Uploaded document must survive app replacement.',
    );
  } else {
    const snapshot = await window.evaluate(async () => {
      const response = await fetch('/api/japangrad/workspace');
      return response.json();
    });
    assert.equal(
      snapshot.data.universities[0].notes,
      '这条笔记必须在升级后保留。',
    );
    assert.equal(
      await readFile(path.join(workspace, 'paper-preservation.txt'), 'utf8'),
      'Uploaded document must survive app replacement.',
    );
    const version = await application.evaluate(({ app }) => app.getVersion());
    const backupRoot = `${path.resolve(workspace)}.backups`;
    const names = await readdir(backupRoot);
    const name = names.find(
      (entry) =>
        entry.includes(`-before-${version}-`) && !entry.startsWith('.'),
    );
    assert.ok(name, 'An upgrade must create a complete pre-migration backup');
    const backup = path.join(backupRoot, name);
    assert.equal(
      await readFile(path.join(backup, 'paper-preservation.txt'), 'utf8'),
      'Uploaded document must survive app replacement.',
    );
    const database = new DatabaseSync(path.join(backup, 'workspace.db'), {
      readOnly: true,
    });
    try {
      const saved = JSON.parse(
        database.prepare('SELECT data FROM workspace_data WHERE id=1').get()
          .data,
      );
      assert.equal(saved.universities[0].name, '升级前的大学');
    } finally {
      database.close();
    }
  }
  // oxlint-disable-next-line no-console -- Report the real installed-app upgrade verification result.
  console.log(`Upgrade ${mode}: university, note and original file verified.`);
} finally {
  try {
    await Promise.race([
      application.close(),
      delay(5000).then(() => application.process().kill()),
    ]);
  } finally {
    clearTimeout(watchdog);
  }
}
