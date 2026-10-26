import { specialProgramFields } from './special-program-service.mjs';
export { specialProgramFields };
export const collectionKinds = [
  'university',
  'school',
  'major',
  'lab',
  'professor',
];
export const collectionEvidenceLimit = 24;
export const collectionAncestors = (kind) => {
  const index = collectionKinds.indexOf(kind);
  return index === -1 ? [] : collectionKinds.slice(0, index + 1);
};
export const collectionNames = {
  university: '大学',
  school: '研究科',
  major: '专攻',
  lab: '研究室',
  professor: '老师',
};
const common = [
  ['name', '名称', 4000],
  ['japaneseName', '日文名称', 4000],
  ['website', '官网', 2048],
  ['notes', '其他信息', 4000],
];
export const collectionFields = {
  university: [
    ...common,
    ['location', '所在地', 4000],
    ['category', '大学类型', 120],
    ['region', '地域', 120],
    ['prefecture', '都道府县', 120],
    ['qsRank', 'QS 排名', 120],
    ['qsYear', 'QS 年份', 120],
    ['japanRank', '日本国内排名', 120],
    ['japanRankYear', '日本排名年份', 120],
    ['japanRankSource', '日本排名来源与口径', 120],
    ['admissionFee', '入学金（日元）', 9],
    ['annualTuition', '年度学费（日元）', 9],
    ['monthlyRent', '月房租（日元）', 9],
    ['monthlyLivingExpenses', '月生活费（日元）', 9],
    ['feeNotes', '费用说明', 4000],
    ['dormitoryStatus', '寮申请状态', 120],
    ['dormitoryNotes', '寮申请说明', 4000],
    ['dormitoryWebsite', '寮申请官网', 2048],
  ],
  school: [...common, ['research', '研究方向', 4000]],
  major: [
    ...common,
    ['research', '研究方向', 4000],
    ['applicationStart', '出愿开始', 120],
    ['applicationEnd', '出愿截止', 120],
    ['applicationMaterials', '出愿材料', 8000],
    ['languageRequirements', '语言要求', 4000],
  ],
  lab: [
    ...common,
    ['research', '研究方向', 4000],
    ['languageRequirements', '语言要求', 4000],
    ['examNotes', '考试说明', 4000],
    ['applicationNotes', '申请说明', 4000],
  ],
  professor: [
    ['name', '姓名', 4000],
    ['japaneseName', '日文姓名', 4000],
    ['title', '职称', 4000],
    ['research', '研究方向', 4000],
    ['email', '公开邮箱', 4000],
    ['personalWebsite', '个人官网', 2048],
    ['laboratoryWebsite', '研究室官网', 2048],
    ['notes', '个人介绍与论文线索', 4000],
  ],
};
export const examFields = [
  ['subjects', '考试科目', 2000],
  ['writtenDate', '笔试时间', 240],
  ['interviewDate', '面试时间', 240],
  ['resultDate', '放榜时间', 240],
];
export const admissionSummaryFields = [
  ['eligibility', '申请资格', 3000],
  ['applicationPeriod', '出愿时间', 2000],
  ['applicationMaterials', '出愿材料', 6000],
  ['languageRequirements', '语言要求', 3000],
  ['selection', '选拔方式与考试科目', 3000],
  ['schedule', '考试与放榜安排', 3000],
  ['fees', '费用与资助', 2000],
  ['notes', '其他申请要求', 3000],
];
export const admissionTimeFields = new Set(['applicationPeriod', 'schedule']);
export const dateFields = new Set([
  'applicationEnd',
  'applicationStart',
  'assessmentDate',
  'interviewDate',
  'resultDate',
  'writtenDate',
]);
export const moneyFields = new Set([
  'admissionFee',
  'annualTuition',
  'monthlyLivingExpenses',
  'monthlyRent',
]);
const evidence = {
  type: 'array',
  maxItems: collectionEvidenceLimit,
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['sourceId', 'page', 'quote'],
    properties: {
      sourceId: { type: 'string' },
      page: { type: 'integer' },
      quote: { type: 'string' },
    },
  },
};
const fieldArray = (fields) => ({
  type: 'array',
  maxItems: fields.length,
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['field', 'value', 'evidence', 'scopeNote'],
    properties: {
      field: { type: 'string', enum: fields.map(([id]) => id) },
      value: { type: 'string' },
      evidence,
      scopeNote: { type: 'string' },
    },
  },
});
export const collectionSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    ...collectionKinds,
    'subject',
    'admissions',
    'logo',
    'specialProgram',
    'exams',
    'documents',
    'warnings',
  ],
  properties: {
    specialProgram: fieldArray(specialProgramFields),
    logo: {
      type: 'object',
      additionalProperties: false,
      required: ['sourceId', 'url', 'reason'],
      properties: {
        sourceId: { type: 'string' },
        url: { type: 'string' },
        reason: { type: 'string' },
      },
    },
    ...Object.fromEntries(
      collectionKinds.map((kind) => [kind, fieldArray(collectionFields[kind])]),
    ),
    subject: {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'reason', 'evidence'],
      properties: {
        kind: {
          type: 'string',
          enum: [...collectionKinds, 'special_program', 'unknown'],
        },
        reason: { type: 'string' },
        evidence,
      },
    },
    admissions: {
      type: 'object',
      additionalProperties: false,
      required: ['status', 'scope', 'fields'],
      properties: {
        status: {
          type: 'string',
          enum: ['found', 'uncertain', 'not_found', 'not_requested'],
        },
        scope: { type: 'string' },
        fields: fieldArray(admissionSummaryFields),
      },
    },
    exams: {
      type: 'array',
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['year', 'session', 'fields'],
        properties: {
          year: { type: 'string' },
          session: { type: 'string' },
          fields: fieldArray(examFields),
        },
      },
    },
    documents: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['sourceId', 'kind', 'title', 'year'],
        properties: {
          sourceId: { type: 'string' },
          kind: { type: 'string', enum: ['guidelines', 'paper'] },
          title: { type: 'string' },
          year: { type: 'string' },
        },
      },
    },
    warnings: { type: 'array', maxItems: 40, items: { type: 'string' } },
  },
};
export function blankCollectionEntity(kind, id, parentId, labId) {
  const item = {
    id,
    ...Object.fromEntries(collectionFields[kind].map(([key]) => [key, ''])),
  };
  if (kind === 'university')
    Object.assign(item, { logoId: '', dormitoryStatus: 'unknown' });
  if (kind === 'school') item.universityId = parentId;
  if (kind === 'major')
    Object.assign(item, { schoolId: parentId, examHistory: [] });
  if (kind === 'lab')
    Object.assign(item, {
      majorId: parentId,
      wantApply: false,
      tasks: [],
      timeline: { events: [], hiddenSources: [] },
    });
  if (kind === 'professor')
    Object.assign(item, {
      majorId: parentId,
      labId,
      laboratory: '',
      favorite: false,
    });
  return item;
}
export const collectionCollections = {
  university: 'universities',
  school: 'schools',
  major: 'majors',
  lab: 'labs',
  professor: 'professors',
};
