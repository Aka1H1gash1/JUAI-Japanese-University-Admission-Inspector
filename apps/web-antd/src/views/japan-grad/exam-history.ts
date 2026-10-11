export interface ExamHistoryRecord {
  id: string;
  year: string;
  session: string;
  examDate: string;
  writtenDate: string;
  interviewDate: string;
  resultDate: string;
  subjects: string;
  sourceUrl: string;
  notes: string;
}

export const EXAM_DATE_FIELDS = [
  'writtenDate',
  'interviewDate',
  'resultDate',
] as const;
export const MAX_EXAM_BATCH_ROWS = 50;

export function blankExamRecord(): ExamHistoryRecord {
  return {
    id: '',
    year: '',
    session: '',
    subjects: '',
    writtenDate: '',
    interviewDate: '',
    resultDate: '',
    examDate: '',
    sourceUrl: '',
    notes: '',
  };
}

export function normalizeExamRecord(
  record: ExamHistoryRecord,
): ExamHistoryRecord {
  return {
    ...record,
    writtenDate: record.writtenDate ?? '',
    interviewDate: record.interviewDate ?? '',
    resultDate: record.resultDate ?? '',
  };
}

export function examRecordKey(
  record: Pick<ExamHistoryRecord, 'session' | 'year'>,
) {
  return `${record.year.trim()}\0${record.session.trim().toLowerCase()}`;
}

export function prepareExamBatch(
  drafts: ExamHistoryRecord[],
  existing: ExamHistoryRecord[],
) {
  if (drafts.length > MAX_EXAM_BATCH_ROWS)
    throw new Error(`每批最多录入 ${MAX_EXAM_BATCH_ROWS} 行。`);
  const keys = new Set(existing.map(examRecordKey));
  const entries: ExamHistoryRecord[] = [];
  for (const [index, draft] of drafts.entries()) {
    const record = Object.fromEntries(
      Object.entries(normalizeExamRecord(draft)).map(([key, value]) => [
        key,
        value.trim(),
      ]),
    ) as unknown as ExamHistoryRecord;
    if (Object.entries(record).every(([key, value]) => key === 'id' || !value))
      continue;
    if (!validExamHistory([{ ...record, id: record.id || `batch-${index}` }]))
      throw new Error(
        `第 ${index + 1} 行：请填写 1900-2200 之间的四位考试年份，并检查内容长度。`,
      );
    const key = examRecordKey(record);
    if (keys.has(key))
      throw new Error(
        `第 ${index + 1} 行：${record.year} 年${record.session ? `「${record.session}」` : '未指定批次'}已有记录，请修改批次或移除此行。`,
      );
    keys.add(key);
    entries.push(record);
  }
  if (!entries.length) throw new Error('请至少填写一行考试记录。');
  if (existing.length + entries.length > 500)
    throw new Error('该专攻最多保存 500 条考试记录。');
  return entries;
}

export function parseExamPaste(value: string): ExamHistoryRecord[] {
  const lines = value
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim());
  let headers: string[] | undefined;
  if (
    lines.length &&
    /^(?:考试年份|年份|年度|year)$/i.test(lines[0]!.split('\t')[0]!.trim())
  )
    headers = lines
      .shift()!
      .split('\t')
      .map((cell) => cell.trim());
  if (!lines.length) throw new Error('请先粘贴考试数据。');
  if (lines.length > MAX_EXAM_BATCH_ROWS)
    throw new Error(`每次最多粘贴 ${MAX_EXAM_BATCH_ROWS} 行。`);
  return lines.map((line, index) => {
    const cells = line.split('\t').map((cell) => cell.trim());
    if (cells.length > 7)
      throw new Error(
        `粘贴数据第 ${index + 1} 行超过 7 列，请按表头顺序粘贴。`,
      );
    const [
      year = '',
      subjects = '',
      writtenDate = '',
      interviewDate = '',
      resultDate = '',
      session = '',
      notes = '',
    ] = cells;
    const record = {
      ...blankExamRecord(),
      id: `paste-${index}`,
      year,
      subjects,
      writtenDate,
      interviewDate,
      resultDate,
      session,
      notes,
    };
    if (headers) {
      const fields: Record<
        string,
        | 'year'
        | 'subjects'
        | 'writtenDate'
        | 'interviewDate'
        | 'resultDate'
        | 'session'
        | 'notes'
      > = {
        考试年份: 'year',
        年份: 'year',
        年度: 'year',
        year: 'year',
        考试科目: 'subjects',
        笔试时间: 'writtenDate',
        面试时间: 'interviewDate',
        结果发布时间: 'resultDate',
        批次: 'session',
        入试批次: 'session',
        备注: 'notes',
      };
      Object.assign(record, blankExamRecord(), { id: `paste-${index}` });
      const columns = headers.map((header) => fields[header]);
      const remaining = (
        [
          'year',
          'subjects',
          'writtenDate',
          'interviewDate',
          'resultDate',
          'session',
          'notes',
        ] as const
      ).filter((field) => !columns.includes(field));
      cells.forEach((cell, column) => {
        const field =
          column < columns.length
            ? columns[column]
            : remaining[column - columns.length];
        if (field) record[field] = cell;
      });
    }
    if (!validExamHistory([record]))
      throw new Error(`粘贴数据第 ${index + 1} 行的年份或内容不合法。`);
    return record;
  });
}

export function validExamHistory(value: unknown): value is ExamHistoryRecord[] {
  if (!Array.isArray(value) || value.length > 500) return false;
  const ids = new Set<string>();
  return value.every((record) => {
    if (!record || typeof record !== 'object') return false;
    const item = record as ExamHistoryRecord;
    if (
      typeof item.id !== 'string' ||
      !/^[\w-]{1,100}$/.test(item.id) ||
      ids.has(item.id)
    )
      return false;
    ids.add(item.id);
    return (
      typeof item.year === 'string' &&
      /^\d{4}$/.test(item.year) &&
      Number(item.year) >= 1900 &&
      Number(item.year) <= 2200 &&
      EXAM_DATE_FIELDS.every(
        (field) =>
          item[field] === undefined ||
          (typeof item[field] === 'string' && item[field].length <= 240),
      ) &&
      (
        ['session', 'examDate', 'subjects', 'sourceUrl', 'notes'] as const
      ).every(
        (field) =>
          typeof item[field] === 'string' &&
          item[field].length <=
            {
              session: 120,
              examDate: 240,
              subjects: 2000,
              sourceUrl: 2048,
              notes: 4000,
            }[field],
      )
    );
  });
}
