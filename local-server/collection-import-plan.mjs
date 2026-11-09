import { randomUUID } from 'node:crypto';

import {
  blankCollectionEntity,
  collectionAncestors,
  collectionCollections,
  collectionFields,
} from './collection-fields.mjs';
import {
  importError,
  importFingerprint,
} from './collection-import-contract.mjs';
import { planCollectionResources } from './collection-import-resources.mjs';
import { matchCollectionEntities } from './collection-matching.mjs';
import { emptyContactRecord } from './planning-fields.mjs';

const parents = {
  school: ['university', 'universityId'],
  major: ['school', 'schoolId'],
  lab: ['major', 'majorId'],
  professor: ['lab', 'labId'],
};
export {
  importError,
  importFingerprint,
} from './collection-import-contract.mjs';
function exactKeys(value, allowed) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !allowed.includes(key))
  )
    throw importError('核对载荷包含不支持的字段。');
}
// Pure planning: callers must persist this plan with a task-level CAS and
// revalidate it under the workspace write lock before committing anything.
export function buildCollectionImportPlan({
  job,
  data,
  revision,
  selection,
  sources = [],
  uuid = randomUUID,
  documents = [],
  admissionsRecords = [],
}) {
  if (job.ruleVersion !== 3 || job.importPolicy !== 'create_only')
    throw importError(
      '旧任务需要按只新增规则重新核对。',
      'LEGACY_REVIEW_REQUIRED',
      409,
    );
  if (
    job.status !== 'review' ||
    !job.draft ||
    collectionAncestors(job.requestedKind).length === 0
  )
    throw importError('任务尚未具备可核对的固定层级。', 'REVIEW_STALE', 409);
  if (
    job.draft.subject?.detectedKind &&
    job.draft.subject.detectedKind !== job.requestedKind
  )
    throw importError(
      '网页主体与所选层级不一致，请保留来源并发起正确层级的新任务。',
      'PARENT_MISMATCH',
      422,
    );
  exactKeys(selection, [
    'ruleVersion',
    'revision',
    'entities',
    'includeProfessor',
    'createOptions',
    'resources',
    'confirmedScopes',
    'manualConfirmations',
  ]);
  if (selection.ruleVersion !== 3 || selection.revision !== revision)
    throw importError('工作区已变化，请刷新核对。', 'REVIEW_STALE', 409);
  if (
    selection.includeProfessor !== undefined &&
    typeof selection.includeProfessor !== 'boolean'
  )
    throw importError('负责人选择必须是布尔值。');
  if (
    selection.confirmedScopes !== undefined &&
    !Array.isArray(selection.confirmedScopes)
  )
    throw importError('时间确认格式不正确。');
  if (selection.includeProfessor && job.requestedKind !== 'lab')
    throw importError('只有研究室任务可以选择负责人。');
  const required = collectionAncestors(
    selection.includeProfessor ? 'professor' : job.requestedKind,
  );
  exactKeys(selection.entities, required);
  exactKeys(
    selection.createOptions ?? {},
    required.includes('lab') ? ['lab', 'university'] : ['university'],
  );
  if (selection.createOptions?.university) {
    exactKeys(selection.createOptions.university, ['logoId']);
    if (
      !/^[a-f0-9-]{36}\.(png|jpg|webp)$/.test(
        selection.createOptions.university.logoId,
      )
    )
      throw importError('校徽选择不合法。');
    if (selection.entities.university.action !== 'create')
      throw importError('已有大学不能修改校徽。');
  }
  if (selection.createOptions?.lab) {
    exactKeys(selection.createOptions.lab, ['wantApply']);
    if (typeof selection.createOptions.lab.wantApply !== 'boolean')
      throw importError('想考选项必须是布尔值。');
  }
  exactKeys(selection.resources ?? {}, ['exams', 'documents', 'admissions']);
  const requiredConfirmations = [];
  if (!Array.isArray(selection.manualConfirmations ?? []))
    throw importError('确认内容格式不正确。');
  const scopeKeys = new Set();
  const matches = matchCollectionEntities(data, job);
  const unanchoredMatches = matchCollectionEntities(data, {
    ...job,
    parent: null,
    target: null,
  });
  const assigned = {};
  const operations = [];
  const additions = Object.fromEntries(
    Object.values(collectionCollections).map((name) => [name, []]),
  );
  for (const kind of required) {
    const choice = selection.entities[kind];
    if (!choice)
      throw importError(`请核对 ${kind} 的真实归属。`, 'PARENT_MISMATCH', 422);
    const relation = parents[kind];
    const parentId = relation ? assigned[relation[0]] : undefined;
    const anchor = job.parent && job.target?.ids?.[kind];
    const list = data[collectionCollections[kind]];
    if (choice.action === 'link') {
      exactKeys(choice, ['action', 'id']);
      const existing = list.find((item) => item.id === choice.id);
      if (!existing)
        throw importError('所选档案不存在。', 'PARENT_MISMATCH', 404);
      if (
        anchor &&
        unanchoredMatches[kind].length > 0 &&
        !unanchoredMatches[kind].includes(anchor)
      )
        throw importError(
          '来源明确对应其他已有对象，不能挂入当前上级。',
          'PARENT_MISMATCH',
          409,
        );
      if (
        (anchor && anchor !== existing.id) ||
        (relation && existing[relation[1]] !== parentId)
      )
        throw importError(
          '所选档案与本次真实上级不一致。',
          'PARENT_MISMATCH',
          409,
        );
      if (!anchor && !matches[kind].includes(existing.id))
        throw importError(
          '已有档案身份缺少本次来源证明。',
          'PARENT_MISMATCH',
          422,
        );
      if (kind === 'lab' && selection.createOptions?.lab)
        throw importError('已有研究室不能携带创建偏好。');
      if (anchor) {
        const names = (job.draft[kind] ?? [])
          .filter((f) => ['japaneseName', 'name'].includes(f.field))
          .map((f) => f.value.normalize('NFKC').replaceAll(/\s/g, ''));
        if (
          names.length > 0 &&
          !names.some((name) =>
            [existing.name, existing.japaneseName]
              .filter(Boolean)
              .some(
                (value) =>
                  value.normalize('NFKC').replaceAll(/\s/g, '') === name,
              ),
          )
        ) {
          const key = importFingerprint({
            draft: job.draft,
            reviewRevision: job.reviewRevision ?? 0,
            kind,
            existingId: existing.id,
            names,
          });
          requiredConfirmations.push({
            key,
            kind,
            field: 'affiliation',
            original: names.join(' / '),
            value: existing.name,
            message: `用户确认 ${kind} 名称差异属于同一真实上级；已有所属关系不变`,
          });
        }
      }
      assigned[kind] = existing.id;
      operations.push({
        kind,
        action: 'linked',
        id: existing.id,
        name: existing.name,
      });
    } else if (choice.action === 'create') {
      exactKeys(choice, ['action', 'candidateKey', 'fields']);
      if (
        anchor ||
        matches[kind].some((id) => {
          const existing = list.find((item) => item.id === id);
          return !relation || existing[relation[1]] === parentId;
        })
      )
        throw importError(
          '已有身份候选，请先核对关联对象。',
          'DUPLICATE_RECORD',
          409,
        );
      if (choice.candidateKey !== `${kind}:primary`)
        throw importError('候选不属于本次已核验草稿。');
      const draft = job.draft[kind] ?? [];
      exactKeys(
        choice.fields,
        collectionFields[kind].map(([field]) => field),
      );
      for (const [field, value] of Object.entries(choice.fields)) {
        const proposal = draft.find((f) => f.field === field);
        if (proposal?.requiresScopeConfirmation) {
          scopeKeys.add(`${kind}.${field}`);
          if (!selection.confirmedScopes?.includes(`${kind}.${field}`))
            throw importError(
              '请确认时间适用范围。',
              'RESOURCE_SCOPE_REQUIRED',
              422,
            );
        }
        const definition = collectionFields[kind].find(
          ([key]) => key === field,
        );
        if (typeof value !== 'string' || value.length > definition[2] || false)
          throw importError('采用值必须来自已核验候选；修改值需要单独确认。');
      }
      if (
        !choice.fields.name?.trim() ||
        /待确认|共通研究室/.test(choice.fields.name)
      )
        throw importError('请提供有来源的真实名称。', 'PARENT_MISMATCH', 422);
      for (const [field, value] of Object.entries(choice.fields)) {
        const original = draft.find((f) => f.field === field)?.value ?? '';
        if (original !== value) {
          const key = importFingerprint({
            draft: job.draft,
            reviewRevision: job.reviewRevision ?? 0,
            kind,
            field,
            original,
            value,
          });
          requiredConfirmations.push({
            key,
            kind,
            field,
            original,
            value,
            message: `用户确认 ${kind}.${field} 的修正值和真实归属`,
          });
        }
      }
      if (
        choice.fields.foreignStudentStatus &&
        !['no', 'unknown', 'yes'].includes(choice.fields.foreignStudentStatus)
      )
        throw importError('外国人学生状态无效。');
      if (
        choice.fields.foreignStudentSource &&
        !sources.some((s) => s.url === choice.fields.foreignStudentSource)
      )
        throw importError('外国人学生来源不属于本任务。');
      const id = uuid();
      const entity = {
        ...blankCollectionEntity(
          kind,
          id,
          kind === 'professor' ? assigned.major : parentId,
          assigned.lab,
        ),
        ...choice.fields,
      };
      if (kind === 'professor')
        entity.contact = {
          ...emptyContactRecord(),
          experienceId: `${id}-contact`,
          experienceTitle: `${entity.name} · 考学经历`,
          createdAt: job.createdAt,
        };
      if (kind === 'lab')
        entity.wantApply = selection.createOptions?.lab?.wantApply ?? false;
      if (kind === 'university' && selection.createOptions?.university)
        entity.logoId = selection.createOptions.university.logoId;
      additions[collectionCollections[kind]].push(entity);
      assigned[kind] = id;
      operations.push({ kind, action: 'created', id, name: entity.name });
    } else throw importError('只允许关联或新增档案。');
  }
  if (selection.includeProfessor && additions.labs[0])
    additions.labs[0].mainProfessorId = assigned.professor;
  const resourcePlan = planCollectionResources({
    job,
    selection,
    operations,
    sources,
    data,
    documents,
    admissionsRecords,
  });
  requiredConfirmations.push(...resourcePlan.requiredConfirmations);
  resourcePlan.scopeKeys.forEach((key) => scopeKeys.add(key));
  if ((selection.confirmedScopes ?? []).some((key) => !scopeKeys.has(key)))
    throw importError('确认键不属于所选候选。');
  for (const item of selection.manualConfirmations ?? []) {
    exactKeys(item, ['key', 'explanation']);
    if (
      !requiredConfirmations.some((r) => r.key === item.key) ||
      typeof item.explanation !== 'string' ||
      !item.explanation.trim() ||
      item.explanation.length > 1000
    )
      throw importError('确认键已失效或缺少核对说明。');
  }
  const missingConfirmations = requiredConfirmations.filter(
    (r) => !selection.manualConfirmations?.some((c) => c.key === r.key),
  );
  const binding = {
    resources: resourcePlan.resources,
    ruleVersion: 3,
    importPolicy: 'create_only',
    jobId: job.id,
    requestedKind: job.requestedKind,
    parent: job.parent,
    reviewRevision: job.reviewRevision ?? 0,
    baseRevision: revision,
    draft: importFingerprint(job.draft),
    sources: sources.map(({ id, sha256, text, pages }) => ({
      id,
      sha256,
      content: importFingerprint({
        text,
        pages: pages?.map(({ page, text, sha256 }) => ({ page, text, sha256 })),
      }),
    })),
    selection,
    operations,
    additions,
  };
  return {
    ...binding,
    state: missingConfirmations.length > 0 ? 'needs_confirmation' : 'ready',
    requiredConfirmations: missingConfirmations,
    planId: uuid(),
    planHash: importFingerprint(binding),
    counts: {
      createdEntities: operations.filter((op) => op.action === 'created')
        .length,
      linkedEntities: operations.filter((op) => op.action === 'linked').length,
    },
  };
}
