import { createHash } from 'node:crypto';

import { admissionSummaryFields, examFields } from './collection-fields.mjs';
import {
  importError,
  importFingerprint,
} from './collection-import-contract.mjs';
const invalid = (message) => {
  throw importError(message, 'RESOURCE_SCOPE_REQUIRED', 422);
};
const keys = (item, allowed) => {
  if (
    !item ||
    typeof item !== 'object' ||
    Array.isArray(item) ||
    Object.keys(item).some((key) => !allowed.includes(key))
  )
    invalid('资源选择包含不支持的字段。');
};
export function planCollectionResources({
  job,
  selection,
  operations,
  sources,
  data,
  documents,
  admissionsRecords,
}) {
  const resources = selection.resources ?? {};
  const result = { exams: [], documents: [], admissions: [] };
  const reserved = (key) => {
    const hex = createHash('sha256')
      .update(`${job.id}:${job.reviewRevision}:${key}`)
      .digest('hex')
      .slice(0, 32);
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
  };
  const resolve = (owner, allowed) => {
    keys(owner, ['kind', 'id', 'candidateKey']);
    if (!allowed.includes(owner.kind) || !!owner.id === !!owner.candidateKey)
      invalid('请确认资源的真实所有者。');
    const op = operations.find(
      (item) =>
        item.kind === owner.kind &&
        (owner.id
          ? item.action === 'linked' && item.id === owner.id
          : item.action === 'created' &&
            owner.candidateKey === `${item.kind}:primary`),
    );
    if (!op) invalid('资源所有者必须属于本次核对的真实链。');
    return { kind: op.kind, id: op.id };
  };
  const scopes = new Set();
  const requiredConfirmations = [];
  const confirmEdit = (path, original, value) => {
    if (original === value) return;
    requiredConfirmations.push({
      key: importFingerprint({
        jobId: job.id,
        draft: job.draft,
        reviewRevision: job.reviewRevision ?? 0,
        path,
        original,
        value,
      }),
      original,
      value,
      message: `用户确认 ${path} 的修改值和适用范围`,
    });
  };
  function fields(chosen, candidate, definitions, prefix) {
    keys(
      chosen,
      definitions.map(([key]) => key),
    );
    const accepted = [];
    for (const [key, value] of Object.entries(chosen)) {
      const proposal = candidate.find((item) => item.field === key);
      const def = definitions.find(([field]) => field === key);
      if (
        !proposal ||
        typeof value !== 'string' ||
        !value.trim() ||
        value.length > def[2]
      )
        invalid('资源字段必须来自已核验候选。');
      if (proposal.requiresScopeConfirmation) {
        const scope = `${prefix}.${key}`;
        scopes.add(scope);
        if (!selection.confirmedScopes?.includes(scope))
          invalid('请核对资源日期的适用范围。');
      }
      confirmEdit(`${prefix}.${key}`, proposal.value, value);
      accepted.push({
        ...proposal,
        value,
        ...(proposal.value === value
          ? {}
          : { originalValue: proposal.value, userConfirmed: true }),
      });
    }
    return accepted;
  }
  for (const [kind, limit] of [
    ['exams', 10],
    ['documents', 3],
    ['admissions', 1],
  ])
    if (
      !Array.isArray(resources[kind] ?? []) ||
      (resources[kind]?.length ?? 0) > limit
    )
      invalid('所选资源超过数量限制。');
  if (
    job.requestedKind === 'professor' &&
    ((resources.exams?.length ?? 0) ||
      (resources.admissions?.length ?? 0) ||
      resources.documents?.some((d) => d.kind === 'guidelines'))
  )
    invalid('老师任务不生成募集要项或考试。');
  const seen = new Set();
  for (const item of resources.exams ?? []) {
    keys(item, ['candidateId', 'owner', 'year', 'session', 'fields']);
    const candidate = job.draft.exams.find((e) => e.id === item.candidateId);
    if (
      !candidate ||
      !/^\d{4}$/.test(item.year) ||
      +item.year < 1900 ||
      +item.year > 2200 ||
      typeof item.session !== 'string' ||
      !item.session.trim() ||
      item.session.length > 120
    )
      invalid('请确认考试候选、实际年份与具体批次。');
    confirmEdit(`${candidate.id}.year`, candidate.year, item.year);
    confirmEdit(`${candidate.id}.session`, candidate.session, item.session);
    const owner = resolve(item.owner, ['major']);
    const adopted = fields(
      item.fields,
      candidate.fields,
      examFields,
      candidate.id,
    );
    const key = `${owner.id}:${item.year}:${item.session.trim()}`;
    if (seen.has(key)) invalid('同一考试不能重复选择。');
    seen.add(key);
    const existing = data.majors
      .find((m) => m.id === owner.id)
      ?.examHistory?.find(
        (e) =>
          String(e.year) === item.year && e.session === item.session.trim(),
      );
    result.exams.push({
      state: existing ? 'duplicate' : 'new',
      id: existing?.id ?? reserved(`exam:${key}`),
      owner,
      candidateId: candidate.id,
      record: {
        id: existing?.id ?? reserved(`exam:${key}`),
        examDate: '',
        notes: '',
        writtenDate: '',
        interviewDate: '',
        resultDate: '',
        subjects: '',
        year: item.year,
        session: item.session.trim(),
        ...Object.fromEntries(adopted.map((f) => [f.field, f.value])),
        sourceUrl: adopted[0]?.evidence?.[0]?.url ?? '',
      },
    });
  }
  for (const item of resources.documents ?? []) {
    keys(item, ['sourceId', 'kind', 'year', 'owner']);
    if (
      !['guidelines', 'paper'].includes(item.kind) ||
      !/^\d{4}$/.test(item.year) ||
      +item.year < 1900 ||
      +item.year > 2200
    )
      invalid('请确认文件类型和归档资料年度。');
    const owner = resolve(
      item.owner,
      item.kind === 'guidelines' ? ['major'] : ['professor'],
    );
    const candidate = job.draft.documents.find(
      (d) => d.sourceId === item.sourceId && d.kind === item.kind,
    );
    const source = sources.find((s) => s.id === item.sourceId);
    if (
      !candidate ||
      source?.kind !== 'pdf' ||
      !source.path ||
      !/^[a-f0-9]{64}$/.test(source.sha256)
    )
      invalid('所选原件未下载或不属于本任务。');
    confirmEdit(`${item.sourceId}.year`, candidate.year, item.year);
    const key = `${owner.kind}:${owner.id}:${item.kind}:${item.year}:${source.sha256}`;
    if (seen.has(key)) invalid('同一原件不能重复选择。');
    seen.add(key);
    const existing = documents.find(
      (d) =>
        d.ownerType === owner.kind &&
        d.ownerId === owner.id &&
        d.kind === item.kind &&
        String(d.year) === item.year &&
        d.sha256 === source.sha256,
    );
    result.documents.push({
      state: existing ? 'duplicate' : 'new',
      id: existing?.id ?? reserved(`document:${key}`),
      owner,
      sourceId: source.id,
      kind: item.kind,
      year: item.year,
      sha256: source.sha256,
      title: candidate.title,
    });
  }
  for (const item of resources.admissions ?? []) {
    if (job.draft.admissions?.status !== 'found')
      invalid(
        '摘要适用范围尚未确认，请取消摘要保存，仅保留来源或另建明确专攻任务。',
      );
    keys(item, ['owner', 'scope', 'fields']);
    const owner = resolve(item.owner, ['university', 'school', 'major']);
    if (
      typeof item.scope !== 'string' ||
      !item.scope.trim() ||
      item.scope.length > 4000
    )
      invalid('请明确摘要的学位、人群与年度适用范围。');
    confirmEdit('admissions.scope', job.draft.admissions?.scope, item.scope);
    const adopted = fields(
      item.fields,
      job.draft.admissions?.fields ?? [],
      admissionSummaryFields,
      'admissions',
    );
    if (adopted.length === 0) invalid('请至少选择一项摘要。');
    const fingerprint = importFingerprint({
      owner,
      scope: item.scope,
      fields: adopted.map(({ field, value, evidence }) => ({
        field,
        value,
        evidence: evidence?.map(({ url, page, quote }) => ({
          url,
          page,
          quote,
        })),
      })),
      sources: sources.map((s) => ({
        id: s.url,
        sha256: s.sha256,
        pages: s.pages?.map((p) => ({ page: p.page, text: p.text })),
      })),
    });
    const existing = admissionsRecords.find(
      (r) => r.fingerprint === fingerprint,
    );
    result.admissions.push({
      state: existing ? 'duplicate' : 'new',
      id: existing?.id ?? reserved(`admissions:${fingerprint}`),
      owner,
      fingerprint,
      admissions: {
        status: job.draft.admissions.status,
        scope: item.scope,
        fields: adopted,
      },
    });
  }
  return { resources: result, scopeKeys: [...scopes], requiredConfirmations };
}
