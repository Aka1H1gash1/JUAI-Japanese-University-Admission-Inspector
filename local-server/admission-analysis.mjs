import fields from './admission-fields.json' with { type: 'json' };
import { validPlannerDay } from './planning-fields.mjs';
export { fields };
export const normalizeQuote = (value) =>
  value.normalize('NFKC').replaceAll(/\s+/g, '').trim();
const headers = {
  subjects: /(?:試験科目|試験内容|選抜方法|考试科目)/,
  languageRequirements:
    /(?:語学|英語能力|日本語能力|TOEFL|TOEIC|IELTS|JLPT|语言要求)/i,
  applicationMaterials: /(?:出願書類|提出書類|必要書類|所需材料)/,
  eligibility: /(?:出願資格|応募資格|申请资格)/,
  submissionMethod: /(?:出願方法|提出方法|必着|消印有効|提交方式)/,
  professorContactRequirement:
    /(?:事前相談|事前連絡|指導教員.*(?:承諾|内諾)|事前联系)/,
};
function explicitDates(value) {
  return [
    ...value
      .normalize('NFKC')
      .matchAll(
        /(?:(20\d{2})\s*(?:年|[-/.])\s*|令和\s*(元|\d{1,2})\s*年\s*)(\d{1,2})\s*(?:月|[-/.])\s*(\d{1,2})\s*日?/g,
      ),
  ]
    .map(
      (m) =>
        `${m[1] || 2018 + (m[2] === '元' ? 1 : Number(m[2]))}-${m[3].padStart(2, '0')}-${m[4].padStart(2, '0')}`,
    )
    .filter((item) => validPlannerDay(item));
}
export function localProposal(job, documents) {
  const values = {};
  for (const field of fields) {
    const candidates = [];
    for (const doc of documents)
      for (const page of doc.pages) {
        const lines = page.text.split(/\r?\n/).filter((line) => line.trim());
        for (let index = 0; index < lines.length; index++) {
          let quote = '';
          let value = '';
          if (field.date) {
            const labels = {
              applicationStart: /(?:出願期間|出願受付期間|报名时间|出愿时间)/,
              applicationEnd: /(?:出願期間|出願受付期間|报名时间|出愿时间)/,
              writtenDate: /(?:筆記試験|筆答試験|笔试)/,
              interviewDate: /(?:面接|口述試験|面试)/,
              resultDate: /(?:合格発表|結果発表|结果公布|结果发布)/,
            };
            if (!labels[field.id].test(lines[index])) continue;
            quote = lines
              .slice(index, index + 3)
              .join('\n')
              .slice(0, 2500);
            const dates = explicitDates(quote);
            value = (() => {
              if (field.id === 'applicationEnd') {
                if (dates.length > 1) {
                  return dates[1];
                }
                return '';
              }
              return dates[0] ?? '';
            })();
            if (field.id === 'applicationStart' && dates.length < 2) value = '';
          } else if (field.money) {
            if (!/(?:検定料|入学検定料|检定料)/.test(lines[index])) continue;
            quote = lines
              .slice(index, index + 2)
              .join('\n')
              .slice(0, 1500);
            const match = quote.normalize('NFKC').match(/([\d,]+)\s*円/);
            value = match?.[1].replaceAll(',', '') ?? '';
          } else if (headers[field.id]?.test(lines[index])) {
            quote = lines
              .slice(
                index,
                index + (field.id === 'applicationMaterials' ? 8 : 4),
              )
              .join('\n')
              .slice(0, 2500);
            value = quote.slice(0, field.max);
          }
          if (value && value.length <= field.max)
            candidates.push({
              value,
              evidence: [
                {
                  documentId: doc.id,
                  sha256: doc.sha256,
                  page: page.page,
                  quote,
                },
              ],
            });
        }
      }
    const distinct = [...new Set(candidates.map((c) => c.value))];
    values[field.id] =
      distinct.length === 1
        ? { ...candidates[0], status: 'found' }
        : {
            value: '',
            status: distinct.length > 1 ? 'conflict' : 'not_found',
            evidence: candidates.slice(0, 8).flatMap((c) => c.evidence),
          };
  }
  return {
    schemaVersion: 1,
    jobId: job.id,
    sourceHashes: Object.fromEntries(
      job.sources.map((source) => [source.id, source.sha256]),
    ),
    executor: '本地标题与明确日期定位（待人工核对）',
    fields: values,
    warnings: [
      '本地定位不会判断申请资格或选拔类别，也不会补全省略的年份。跨行表格、其他批次和日期截止口径请结合原文核对。',
      ...documents.flatMap((doc) => doc.warnings),
    ],
  };
}
export function proposalSchema(job) {
  const evidence = {
    type: 'array',
    maxItems: 20,
    items: {
      type: 'object',
      required: ['documentId', 'sha256', 'page', 'quote'],
      additionalProperties: false,
      properties: {
        documentId: { type: 'string' },
        sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
        page: { type: 'integer', minimum: 1 },
        quote: { type: 'string', minLength: 1, maxLength: 8000 },
      },
    },
  };
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    required: ['schemaVersion', 'jobId', 'sourceHashes', 'executor', 'fields'],
    additionalProperties: false,
    properties: {
      schemaVersion: { const: 1 },
      jobId: { const: job.id },
      sourceHashes: {
        type: 'object',
        additionalProperties: { type: 'string', pattern: '^[a-f0-9]{64}$' },
      },
      executor: { type: 'string', minLength: 1, maxLength: 160 },
      warnings: {
        type: 'array',
        maxItems: 100,
        items: { type: 'string', maxLength: 2000 },
      },
      fields: {
        type: 'object',
        minProperties: 1,
        additionalProperties: false,
        properties: Object.fromEntries(
          fields.map((field) => [
            field.id,
            {
              type: 'object',
              required: ['value', 'status', 'evidence'],
              additionalProperties: false,
              properties: {
                value: { type: 'string', maxLength: field.max },
                status: {
                  enum: ['found', 'not_found', 'unreadable', 'conflict'],
                },
                scopeNote: {
                  type: 'string',
                  maxLength: 1500,
                  description:
                    '仅时间字段：原文适用研究科、专攻或选拔类别与目标对应关系不明确时说明；名称差异本身只写 warnings。',
                },
                evidence,
              },
            },
          ]),
        ),
      },
    },
  };
}
