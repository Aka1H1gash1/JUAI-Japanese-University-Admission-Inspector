import { randomUUID } from 'node:crypto';
import { cp, mkdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';

// Live database files are written through the SQLite backup API; runtime lock files are skipped.
const SKIPPED = new Set([
  '.juai-browser-instance.json',
  '.juai-browser-instance.lock',
  'workspace.db',
  'workspace.db-shm',
  'workspace.db-wal',
]);

export function backupRoot(workspace) {
  return path.join(
    path.dirname(workspace),
    `${path.basename(workspace)}.backups`,
  );
}

/**
 * Copies the whole workspace while the service keeps running.
 * The finished folder has the same layout as the workspace, so restoring is a plain folder copy.
 */
export async function createManualBackup(
  db,
  workspace,
  { kind = 'manual' } = {},
) {
  const root = backupRoot(workspace);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const actualRoot = await realpath(root);
  if (
    actualRoot === workspace ||
    actualRoot.startsWith(`${workspace}${path.sep}`)
  )
    throw new Error('备份目录不能位于工作区内部。');
  const createdAt = new Date();
  const name = `${createdAt.toISOString().replaceAll(/[:.]/g, '-')}-${kind}-${randomUUID().slice(0, 8)}`;
  let temporary = path.join(actualRoot, `.${name}.partial`);
  await mkdir(temporary, { mode: 0o700 });
  try {
    await cp(workspace, temporary, {
      recursive: true,
      verbatimSymlinks: true,
      filter: (file) => !SKIPPED.has(path.relative(workspace, file)),
    });
    await backup(db, path.join(temporary, 'workspace.db'));
    const check = new DatabaseSync(path.join(temporary, 'workspace.db'), {
      readOnly: true,
    });
    try {
      if (check.prepare('PRAGMA quick_check').get().quick_check !== 'ok')
        throw new Error('数据库备份校验未通过。');
    } finally {
      check.close();
    }
    await writeFile(
      path.join(temporary, 'JUAI_BACKUP.json'),
      JSON.stringify(
        { complete: true, kind, createdAt: createdAt.toISOString() },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    const completed = path.join(actualRoot, name);
    await rename(temporary, completed);
    temporary = undefined;
    return { path: completed, createdAt: createdAt.toISOString() };
  } finally {
    if (temporary) await rm(temporary, { recursive: true, force: true });
  }
}
