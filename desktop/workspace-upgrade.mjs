import { randomUUID } from 'node:crypto';
import {
  cp,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { backup, DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

// Bump when adding a local-server schema migration; older desktop apps must refuse newer schemas.
export const SUPPORTED_SCHEMA_VERSION = 13;
const MARKER = '.juai-desktop-version.json';

async function readMarker(workspace) {
  try {
    return JSON.parse(await readFile(path.join(workspace, MARKER), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return {};
}

export async function prepareWorkspace(workspace, version) {
  if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version))
    throw new Error('应用版本格式错误。');
  await mkdir(workspace, { recursive: true });
  workspace = await realpath(workspace);
  const marker = await readMarker(workspace);
  const source = path.join(workspace, 'workspace.db');
  try {
    await stat(source);
  } catch (error) {
    if (error.code === 'ENOENT') return { backup: '', previousVersion: '' };
    throw error;
  }
  const database = new DatabaseSync(source, { readOnly: true });
  let temporary;
  try {
    const hasMigrations = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'",
      )
      .get();
    const schema = hasMigrations
      ? database
          .prepare('SELECT MAX(version) AS version FROM schema_migrations')
          .get().version
      : 0;
    if (schema > SUPPORTED_SCHEMA_VERSION)
      throw new Error(
        '资料由更新版本的 JUAI 创建，请安装最新版；已停止启动以保护现有资料。',
      );
    if (marker.version === version)
      return { backup: '', previousVersion: version };
    const root = path.join(
      path.dirname(workspace),
      `${path.basename(workspace)}.backups`,
    );
    await mkdir(root, { recursive: true, mode: 0o700 });
    const actualRoot = await realpath(root);
    if (
      actualRoot === workspace ||
      actualRoot.startsWith(`${workspace}${path.sep}`)
    )
      throw new Error('备份目录不能位于工作区内部。');
    const name = `${new Date().toISOString().replaceAll(/[:.]/g, '-')}-before-${version}-${randomUUID().slice(0, 8)}`;
    temporary = path.join(actualRoot, `.${name}.partial`);
    await mkdir(temporary, { mode: 0o700 });
    await cp(workspace, temporary, {
      recursive: true,
      verbatimSymlinks: true,
      filter: (file) =>
        !['workspace.db', 'workspace.db-shm', 'workspace.db-wal'].includes(
          path.relative(workspace, file),
        ),
    });
    // The SQLite backup API includes committed WAL data; a plain copy of workspace.db would not.
    await backup(database, path.join(temporary, 'workspace.db'));
    const check = new DatabaseSync(path.join(temporary, 'workspace.db'), {
      readOnly: true,
    });
    try {
      if (check.prepare('PRAGMA quick_check').get().quick_check !== 'ok')
        throw new Error('数据库备份校验未通过。');
    } finally {
      check.close();
    }
    const completed = path.join(actualRoot, name);
    await writeFile(
      path.join(temporary, 'JUAI_BACKUP.json'),
      JSON.stringify(
        {
          complete: true,
          fromVersion: marker.version || 'legacy',
          forVersion: version,
          schemaVersion: schema,
          createdAt: new Date().toISOString(),
          workspace,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    await rename(temporary, completed);
    temporary = undefined;
    return { backup: completed, previousVersion: marker.version || 'legacy' };
  } finally {
    database.close();
    if (temporary) await rm(temporary, { recursive: true, force: true });
  }
}

export async function markWorkspaceVersion(workspace, version) {
  const temporary = path.join(workspace, `.${randomUUID()}.version.tmp`);
  await writeFile(
    temporary,
    JSON.stringify({ version, initializedAt: new Date().toISOString() }),
    { mode: 0o600 },
  );
  await rename(temporary, path.join(workspace, MARKER));
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const workspace = process.env.JAPANGRAD_WORKSPACE;
  if (!workspace) throw new Error('未指定本地工作区。');
  const [mode, version] = process.argv.slice(2);
  const result =
    mode === 'mark'
      ? await markWorkspaceVersion(workspace, version)
      : await prepareWorkspace(workspace, version);
  // oxlint-disable-next-line no-console -- Return the preflight result to the desktop parent process.
  console.log(JSON.stringify(result || {}));
}
