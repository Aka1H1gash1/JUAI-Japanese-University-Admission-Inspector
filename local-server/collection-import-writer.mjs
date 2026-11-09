import { createHash, randomUUID } from 'node:crypto';
import {
  readdir,
  readFile,
  realpath,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import {
  buildCollectionImportPlan,
  importError,
} from './collection-import-plan.mjs';
import { storeContent } from './content-store.mjs';
import { validateFile } from './file-types.mjs';

export function createCollectionImportWriter({
  db,
  snapshot,
  transaction,
  job,
  save,
  sources,
  view,
  appendCollectionImport,
  safeFile,
  ensureDirectory,
  workspace,
}) {
  const attempts = new Map();
  const resourceSnapshot = () => ({
    documents: db
      .prepare('SELECT data FROM documents')
      .all()
      .map((r) => JSON.parse(r.data)),
    admissionsRecords: db
      .prepare(
        "SELECT data FROM collection_jobs WHERE json_extract(data,'$.status')='applied'",
      )
      .all()
      .flatMap(
        (r) => JSON.parse(r.data).importPlan?.resources?.admissions ?? [],
      ),
  });
  const manifestDirectory = path.join(workspace, 'collection-import-attempts');
  // Recovery only touches paths proved to be owned by an expired attempt.
  async function recover() {
    const root = await realpath(workspace);
    const directory = await realpath(manifestDirectory).catch(() => null);
    if (!directory) return;
    if (!directory.startsWith(`${root}${path.sep}`))
      throw importError('导入清单目录超出工作区。');
    for (const filename of await readdir(manifestDirectory).catch(() => [])) {
      if (!/^[a-f0-9-]{36}\.json$/.test(filename)) continue;
      const manifestPath = path.join(manifestDirectory, filename);
      let manifest;
      try {
        manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      } catch {
        continue;
      }
      if (Date.now() - manifest.startedAt < 24 * 60 * 60 * 1000) continue;
      const records = resourceSnapshot().documents;
      for (const relative of manifest.paths ?? []) {
        if (
          !/^documents\/collection-imports\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.pdf$/.test(
            relative,
          )
        )
          continue;
        if (
          !relative.startsWith(
            `documents/collection-imports/${filename.slice(0, -5)}/`,
          )
        )
          continue;
        if (!records.some((d) => d.path === relative)) {
          const actual = await realpath(path.join(workspace, relative)).catch(
            () => null,
          );
          if (actual === path.join(root, relative))
            await unlink(actual).catch(() => {});
        }
      }
      await unlink(manifestPath).catch(() => {});
    }
  }
  return {
    resourceSnapshot,
    recover,
    isBusy: () => attempts.size > 0,
    isJobBusy: (id) => [...attempts.values()].includes(id),
    async apply(id, input) {
      if (
        !input ||
        Object.keys(input).some(
          (key) =>
            ![
              'baseRevision',
              'confirm',
              'planHash',
              'planId',
              'ruleVersion',
            ].includes(key),
        ) ||
        input.ruleVersion !== 3 ||
        input.confirm !== true
      )
        throw importError('只新增保存只接受已核对计划，请刷新页面。');
      let latest = job(id);
      if (latest.status === 'applied') {
        if (
          latest.importPlan?.planId === input.planId &&
          latest.importPlan?.planHash === input.planHash
        )
          return {
            job: view(latest),
            revision: snapshot().revision,
            alreadyApplied: true,
          };
        throw importError('任务已保存，请查看已有结果。', 'REVIEW_STALE', 409);
      }
      if (latest.ruleVersion !== 3)
        throw importError(
          '请先按只新增规则重新核对。',
          'LEGACY_REVIEW_REQUIRED',
          409,
        );
      const attemptId = randomUUID();
      const paths = [];
      const prepared = [];

      const manifestPath = path.join(manifestDirectory, `${attemptId}.json`);
      attempts.set(attemptId, id);
      try {
        const logoId =
          latest.importPlan?.selection.createOptions?.university?.logoId;
        if (logoId)
          await readFile(await safeFile(`university-logos/${logoId}`));
        const chosenPlan = latest.importPlan;
        if (
          !chosenPlan ||
          chosenPlan.planId !== input.planId ||
          chosenPlan.planHash !== input.planHash
        )
          throw importError('请先刷新保存预览。', 'REVIEW_STALE', 409);
        await ensureDirectory('collection-import-attempts');
        const usedSources = new Set(
          chosenPlan.resources.documents.map((d) => d.sourceId),
        );
        const includeEvidence = (fields) =>
          fields.forEach((f) =>
            (f.evidence ?? []).forEach((e) => usedSources.add(e.sourceId)),
          );
        for (const op of chosenPlan.operations) {
          const choice = chosenPlan.selection.entities[op.kind];
          includeEvidence(
            (latest.draft[op.kind] ?? []).filter((f) =>
              choice.action === 'create'
                ? Object.hasOwn(choice.fields, f.field)
                : ['japaneseName', 'name'].includes(f.field),
            ),
          );
        }
        for (const exam of chosenPlan.resources.exams)
          includeEvidence(
            latest.draft.exams.find((e) => e.id === exam.candidateId)?.fields ??
              [],
          );
        for (const admissions of chosenPlan.resources.admissions)
          includeEvidence(admissions.admissions.fields);
        for (const source of sources(id).filter(
          (s) => s.kind === 'pdf' && usedSources.has(s.id),
        )) {
          let bytes;
          try {
            bytes = await readFile(await safeFile(source.path));
          } catch {
            throw importError(
              `来源原件无法读取：${source.title || source.id}。请取消相关资源或重新读取。`,
              'SOURCE_CHANGED',
              409,
            );
          }
          if (
            createHash('sha256').update(bytes).digest('hex') !== source.sha256
          )
            throw importError(
              '原件已变化，请重新读取。',
              'SOURCE_CHANGED',
              409,
            );
          for (const item of chosenPlan.resources.documents.filter(
            (d) => d.state === 'new' && d.sourceId === source.id,
          )) {
            validateFile('source.pdf', bytes);
            if (bytes.length > 50 * 1024 * 1024)
              throw importError('PDF 超过50MB，请取消该资源。');
            const relative = `documents/collection-imports/${attemptId}/${item.id}.pdf`;
            paths.push(relative);
            await writeFile(
              `${manifestPath}.tmp`,
              JSON.stringify({
                startedAt: Date.now(),
                jobId: id,
                planId: chosenPlan.planId,
                paths,
              }),
            );
            await rename(`${manifestPath}.tmp`, manifestPath);
            const target = path.join(workspace, relative);
            await ensureDirectory(path.posix.dirname(relative));
            await storeContent({
              db,
              workspace,
              target,
              bytes,
              digest: source.sha256,
            });
            prepared.push({
              id: item.id,
              ownerType: item.owner.kind,
              ownerId: item.owner.id,
              kind: item.kind,
              year: Number(item.year),
              title: item.title,
              filename: `${item.id}.pdf`,
              path: relative,
              size: bytes.length,
              extension: '.pdf',
              mimeType: 'application/pdf',
              charset: '',
              sha256: source.sha256,
              questionId: '',
              notes: `来源：${source.url}`,
              authors: '',
              venue: '',
              createdAt: new Date().toISOString(),
              sourceUrl: source.url,
            });
          }
        }
        let result;
        transaction(() => {
          latest = job(id);
          const plan = latest.importPlan;
          if (
            !plan ||
            input.planId !== plan.planId ||
            input.planHash !== plan.planHash ||
            input.baseRevision !== plan.baseRevision
          )
            throw importError(
              '核对计划已失效，请刷新预览，已编辑候选仍保留。',
              'REVIEW_STALE',
              409,
            );
          if (latest.status === 'applied') {
            result = {
              job: view(latest),
              revision: snapshot().revision,
              alreadyApplied: true,
            };
            return;
          }
          const current = snapshot();
          const ids = [
            ...plan.operations
              .filter((op) => op.action === 'created')
              .map((op) => op.id),
            plan.planId,
          ];
          const refreshed = buildCollectionImportPlan({
            job: latest,
            data: current.data,
            revision: current.revision,
            selection: plan.selection,
            sources: sources(id),
            uuid: () => ids.shift(),
            ...resourceSnapshot(),
          });
          if (refreshed.planHash !== plan.planHash)
            throw importError(
              '草稿、来源或归属已变化，请重新核对。',
              'REVIEW_STALE',
              409,
            );
          if (refreshed.state !== 'ready')
            throw importError(
              '请完成具体修改项的用户确认。',
              'RESOURCE_SCOPE_REQUIRED',
              422,
            );
          const revision = appendCollectionImport(
            plan.additions,
            plan.baseRevision,
            { exams: plan.resources.exams, documents: prepared },
          );
          latest.status = 'applied';
          latest.appliedKind = latest.requestedKind;
          latest.appliedAt = latest.updatedAt = new Date().toISOString();
          latest.resultIds = Object.fromEntries(
            plan.operations.map((op) => [op.kind, op.id]),
          );
          latest.resultEntities = plan.operations.map((op) => ({
            ...op,
            fieldCount:
              op.action === 'created'
                ? Object.keys(plan.selection.entities[op.kind].fields).length
                : 0,
          }));
          latest.documentIds = plan.resources.documents.map((d) => d.id);
          const admissions = plan.resources.admissions[0];
          if (admissions) {
            latest.savedAdmissions = admissions.admissions;
            latest.savedAdmissionsOwner = admissions.owner;
          }
          latest.message = plan.counts.createdEntities
            ? `已新增 ${plan.counts.createdEntities} 个档案，关联 ${plan.counts.linkedEntities} 个已有档案。`
            : '已关联已有档案，无新增内容。';
          if (
            !plan.counts.createdEntities &&
            (prepared.length > 0 ||
              plan.resources.exams.some((e) => e.state === 'new') ||
              plan.resources.admissions.some((a) => a.state === 'new'))
          )
            latest.message = '已关联已有档案并新增所选资源。';
          const history = {
            id: randomUUID(),
            jobId: id,
            createdAt: latest.appliedAt,
            planId: plan.planId,
            planHash: plan.planHash,
            operations: plan.operations,
            provenance: latest.draft,
          };
          db.prepare('INSERT INTO collection_history VALUES (?,?,?)').run(
            history.id,
            id,
            JSON.stringify(history),
          );
          save(latest);
          result = { job: view(latest), revision };
        });

        return result;
      } finally {
        try {
          const records = resourceSnapshot().documents;
          for (const relative of paths)
            if (!records.some((d) => d.path === relative))
              await unlink(path.join(workspace, relative)).catch(() => {});
          await unlink(manifestPath).catch(() => {});
        } finally {
          attempts.delete(attemptId);
        }
      }
    },
  };
}
