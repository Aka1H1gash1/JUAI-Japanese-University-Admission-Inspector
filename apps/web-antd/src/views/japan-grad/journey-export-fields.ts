import type { ApplicationTask } from './application-planning';
import type { ExamHistoryRecord } from './exam-history';
import type { LabTarget } from './lab-targets';
import { buildPlannerEvents } from './application-calendar';
import type { PlannerEventKind } from './application-calendar';
import {
  CONTACT_LABELS,
  CONTACT_RESULT_LABELS,
  normalizedContact,
  primaryProfessor,
} from './application-planning';
import { universityGeography } from './japan-geography';
import {
  labLanguageRequirements,
  recurringBudget,
  targetExams,
  targetExamText,
} from './lab-targets';
import {
  dormitoryLabel,
  universityBudgetTotals,
  universityFees,
} from './university-fees';

export type ExportValue = string | number;
type ExamField = Extract<
  keyof ExamHistoryRecord,
  | 'subjects'
  | 'writtenDate'
  | 'interviewDate'
  | 'resultDate'
  | 'examDate'
  | 'notes'
  | 'sourceUrl'
>;
type TaskField = Extract<
  keyof ApplicationTask,
  'kind' | 'progress' | 'dueDate' | 'notes'
>;
interface FieldOptions {
  width?: number;
  money?: boolean;
  calculated?: boolean;
  examField?: ExamField;
  taskField?: TaskField;
}
function field<T extends string>(
  id: T,
  label: string,
  group: string,
  value: (target: LabTarget, year: string) => ExportValue,
  options: FieldOptions = {},
) {
  return { id, label, group, value, width: 26, ...options };
}
const amount = (value: string) => (value === '' ? '' : Number(value));
const contact = (target: LabTarget) =>
  normalizedContact(primaryProfessor(target)?.contact);
const tasksText = (
  target: LabTarget,
  value: (task: ApplicationTask) => string,
) =>
  (target.lab.tasks ?? [])
    .map((task) => `${task.title}：${value(task)}`)
    .join('\n');

// The picker, preview and workbook share this list, so unchecked fields cannot
// accidentally reappear in an additional worksheet.
const plannedDates = (target: LabTarget, kinds: PlannerEventKind[]) =>
  buildPlannerEvents([target], 'all')
    .filter((e) => kinds.includes(e.kind))
    .map(
      (e) =>
        `${e.title}：${e.at ? e.at.replace('T', ' ') : e.start}${e.endAt ? ` ～ ${e.endAt.replace('T', ' ')}` : e.end !== e.start ? ` ～ ${e.end}` : ''}${e.complete ? '（已完成 / 已记录）' : '（计划中）'}`,
    )
    .join('\n');
export const JOURNEY_EXPORT_FIELDS = [
  field(
    'experienceTitle',
    '当前考学经历',
    '考学经历',
    (t) => contact(t).experienceTitle,
  ),
  field(
    'contactRequirements',
    '教授联络要求',
    '考学经历',
    (t) => contact(t).requirements,
    { width: 44 },
  ),
  field(
    'interviewPreparation',
    '面试准备',
    '考学经历',
    (t) => contact(t).interviewPreparation,
    { width: 44 },
  ),
  field('actualInterview', '实际面试时间（JST）', '考学经历', (t) =>
    (contact(t).actualInterviewAt || contact(t).actualInterviewDate).replace(
      'T',
      ' ',
    ),
  ),
  field(
    'interviewQA',
    '面试问题与回答',
    '考学经历',
    (t) =>
      contact(t)
        .interviewQA.map((q) => `问题：${q.question}\n回答：${q.answer}`)
        .join('\n\n'),
    { width: 48 },
  ),
  field(
    'interviewReview',
    '面试复盘',
    '考学经历',
    (t) => contact(t).interviewNotes,
    { width: 44 },
  ),
  field(
    'consentDate',
    '内诺取得日期',
    '考学经历',
    (t) => contact(t).consentDate,
  ),
  field('finalResult', '考学结果', '考学经历', (t) =>
    contact(t).finalResult === 'pending'
      ? ''
      : CONTACT_RESULT_LABELS[contact(t).finalResult],
  ),
  field(
    'experienceResultDate',
    '考学结果日期',
    '考学经历',
    (t) => contact(t).resultDate,
  ),
  field(
    'resultSummary',
    '考学结果说明',
    '考学经历',
    (t) => contact(t).resultNotes,
    { width: 44 },
  ),

  field(
    'plannedFirstContact',
    '规划：首次联系教授',
    '时间规划',
    (t) => plannedDates(t, ['contact', 'sent']),
    { width: 40 },
  ),
  field(
    'plannedConsent',
    '规划：拿到内诺',
    '时间规划',
    (t) => plannedDates(t, ['consent']),
    { width: 40 },
  ),
  field(
    'plannedApplication',
    '规划：出愿时间',
    '时间规划',
    (t) => plannedDates(t, ['application']),
    { width: 40 },
  ),
  field(
    'plannedExams',
    '规划：考试时间',
    '时间规划',
    (t) => plannedDates(t, ['exam', 'written', 'interview']),
    { width: 40 },
  ),
  field(
    'plannedResults',
    '规划：结果公布',
    '时间规划',
    (t) => plannedDates(t, ['result']),
    { width: 40 },
  ),

  field('school', '研究科', '基本资料', (t) => t.school.name),
  field('major', '专攻', '基本资料', (t) => t.major.name),
  field('research', '研究方向', '基本资料', (t) => t.lab.research, {
    width: 40,
  }),
  field('professors', '老师', '基本资料', (t) =>
    t.professors
      .map((p) => [p.name, p.title].filter(Boolean).join(' · '))
      .join('\n'),
  ),
  field('qsRank', 'QS 排名', '基本资料', (t) => t.university.qsRank),
  field('qsYear', 'QS 榜单年份', '基本资料', (t) => t.university.qsYear),
  field(
    'region',
    '所在地域',
    '基本资料',
    (t) => universityGeography(t.university).region,
  ),
  field(
    'prefecture',
    '都道府县',
    '基本资料',
    (t) => universityGeography(t.university).prefecture,
  ),
  field('location', '具体所在地', '基本资料', (t) => t.university.location),
  field('category', '大学类型', '基本资料', (t) => t.university.category),
  field(
    'annualCost',
    '年度开销（日元，不含入学金）',
    '费用与住宿',
    (t) => {
      const b = recurringBudget(t.university);
      return b.complete ? (b.value ?? '') : '';
    },
    { money: true, calculated: true },
  ),
  field(
    'firstYearCost',
    '首年总费用（日元）',
    '费用与住宿',
    (t) => {
      const b = universityBudgetTotals(t.university);
      return b.complete ? amount(b.firstYear) : '';
    },
    { money: true, calculated: true },
  ),
  field(
    'twoYearCost',
    '两年总费用（日元）',
    '费用与住宿',
    (t) => {
      const b = universityBudgetTotals(t.university);
      return b.complete ? amount(b.twoYears) : '';
    },
    { money: true, calculated: true },
  ),
  field(
    'admissionFee',
    '入学金（日元）',
    '费用与住宿',
    (t) => amount(universityFees(t.university).admissionFee),
    { money: true },
  ),
  field(
    'annualTuition',
    '年度学费（日元）',
    '费用与住宿',
    (t) => amount(universityFees(t.university).annualTuition),
    { money: true },
  ),
  field(
    'monthlyRent',
    '月房租（日元）',
    '费用与住宿',
    (t) => amount(t.university.monthlyRent),
    { money: true },
  ),
  field(
    'monthlyLiving',
    '月生活费（日元，不含房租）',
    '费用与住宿',
    (t) => amount(t.university.monthlyLivingExpenses),
    { money: true },
  ),
  field(
    'budgetStatus',
    '预算完整性',
    '费用与住宿',
    (t) => {
      const b = universityBudgetTotals(t.university);
      return b.complete
        ? '已填写完整'
        : `待补充：${b.missingFields.join('、')}；费用合计缺项时留空`;
    },
    { width: 40 },
  ),
  field('dormitory', '寮申请', '费用与住宿', (t) =>
    dormitoryLabel(t.university.dormitoryStatus),
  ),
  field(
    'dormitoryNotes',
    '寮说明',
    '费用与住宿',
    (t) => t.university.dormitoryNotes,
    { width: 40 },
  ),
  field('feeNotes', '费用备注', '费用与住宿', (t) => t.university.feeNotes, {
    width: 40,
  }),
  field(
    'languageRequirements',
    '语言要求',
    '报考要求与考试',
    labLanguageRequirements,
    { width: 40 },
  ),
  field('examYear', '考试年份 / 批次', '报考要求与考试', (t, y) =>
    targetExams(t, y)
      .map((e) => [e.year, e.session].filter(Boolean).join(' / '))
      .join('\n'),
  ),
  field(
    'subjects',
    '考试科目',
    '报考要求与考试',
    (t, y) => targetExamText(t, 'subjects', y),
    { examField: 'subjects', width: 40 },
  ),
  field(
    'writtenDate',
    '笔试时间',
    '报考要求与考试',
    (t, y) => targetExamText(t, 'writtenDate', y),
    { examField: 'writtenDate' },
  ),
  field(
    'interviewDate',
    '面试时间',
    '报考要求与考试',
    (t, y) => targetExamText(t, 'interviewDate', y),
    { examField: 'interviewDate' },
  ),
  field(
    'resultDate',
    '结果发布时间',
    '报考要求与考试',
    (t, y) => targetExamText(t, 'resultDate', y),
    { examField: 'resultDate' },
  ),
  field(
    'examDate',
    '原考试时间（旧记录）',
    '报考要求与考试',
    (t, y) => targetExamText(t, 'examDate', y),
    { examField: 'examDate' },
  ),
  field(
    'applicationStart',
    '出愿开始',
    '报考要求与考试',
    (t) => t.major.applicationStart,
  ),
  field(
    'applicationEnd',
    '出愿截止',
    '报考要求与考试',
    (t) => t.major.applicationEnd,
  ),
  field(
    'applicationMaterials',
    '出愿所需材料',
    '报考要求与考试',
    (t) => t.major.applicationMaterials,
    { width: 44 },
  ),
  field(
    'examNotes',
    '研究室考试特殊说明',
    '报考要求与考试',
    (t) => t.lab.examNotes,
    { width: 40 },
  ),
  field(
    'applicationNotes',
    '研究室出愿特殊说明',
    '报考要求与考试',
    (t) => t.lab.applicationNotes,
    { width: 40 },
  ),
  field(
    'yearNotes',
    '考试年度备注',
    '报考要求与考试',
    (t, y) =>
      targetExams(t, y)
        .filter((e) => e.notes)
        .map((e) => `${e.year} ${e.session}：${e.notes}`)
        .join('\n'),
    { examField: 'notes', width: 40 },
  ),
  field(
    'examSources',
    '考试来源链接',
    '报考要求与考试',
    (t, y) =>
      targetExams(t, y)
        .filter((e) => e.sourceUrl)
        .map((e) => `${e.year} ${e.session}：${e.sourceUrl}`)
        .join('\n'),
    { examField: 'sourceUrl', width: 40 },
  ),
  field(
    'contactProfessor',
    '主要联系老师',
    '教授联络',
    (t) => primaryProfessor(t)?.name ?? '',
  ),
  field('contactStatus', '联系状态', '教授联络', (t) =>
    primaryProfessor(t) ? CONTACT_LABELS[contact(t).status] : '',
  ),
  field(
    'firstSentDate',
    '首封发送日期',
    '教授联络',
    (t) => contact(t).firstSentDate,
  ),
  field('professorInterview', '教授面试约定（JST）', '教授联络', (t) =>
    contact(t).interviewAt.replace('T', ' '),
  ),
  field('followUpDate', '下次跟进', '教授联络', (t) => contact(t).followUpDate),
  field(
    'replySummary',
    '教授回复要点',
    '教授联络',
    (t) => contact(t).replySummary,
    { width: 44 },
  ),
  field(
    'taskProgress',
    '材料 / 待办逐项进度（%）',
    '准备进度与备注',
    (t) => tasksText(t, (task) => `${task.progress}%`),
    { taskField: 'progress', width: 40 },
  ),
  field(
    'taskKinds',
    '材料 / 待办项目类型',
    '准备进度与备注',
    (t) =>
      tasksText(t, (task) =>
        task.kind === 'material' ? '申请材料' : '其他待办',
      ),
    { taskField: 'kind' },
  ),
  field(
    'taskDueDates',
    '材料 / 待办截止日期（JST）',
    '准备进度与备注',
    (t) => tasksText(t, (task) => task.dueDate),
    { taskField: 'dueDate', width: 40 },
  ),
  field(
    'taskNotes',
    '材料 / 待办备注',
    '准备进度与备注',
    (t) => tasksText(t, (task) => task.notes),
    { taskField: 'notes', width: 44 },
  ),
  field('labWebsite', '研究室官网', '准备进度与备注', (t) => t.lab.website, {
    width: 40,
  }),
  field(
    'universityWebsite',
    '大学官网',
    '准备进度与备注',
    (t) => t.university.website,
    { width: 40 },
  ),
  field('notes', '个人备注', '准备进度与备注', (t) => t.lab.notes, {
    width: 44,
  }),
];
export type JourneyExportFieldId = (typeof JOURNEY_EXPORT_FIELDS)[number]['id'];
export const DEFAULT_EXPORT_FIELDS: JourneyExportFieldId[] = [
  'research',
  'annualCost',
  'languageRequirements',
  'subjects',
  'writtenDate',
  'interviewDate',
];
export const JOURNEY_EXPORT_PRESETS: {
  label: string;
  ids: JourneyExportFieldId[];
}[] = [
  {
    label: '修考日程',
    ids: [
      'plannedFirstContact',
      'plannedConsent',
      'plannedApplication',
      'plannedExams',
      'plannedResults',
    ],
  },
  { label: '常用对比', ids: DEFAULT_EXPORT_FIELDS },
  {
    label: '费用预算',
    ids: [
      'annualCost',
      'firstYearCost',
      'twoYearCost',
      'admissionFee',
      'annualTuition',
      'monthlyRent',
      'monthlyLiving',
      'budgetStatus',
      'dormitory',
    ],
  },
  {
    label: '报考安排',
    ids: [
      'major',
      'languageRequirements',
      'examYear',
      'subjects',
      'writtenDate',
      'interviewDate',
      'resultDate',
      'applicationStart',
      'applicationEnd',
      'applicationMaterials',
      'examNotes',
      'applicationNotes',
    ],
  },
];
export interface JourneyExportOptions {
  fieldIds: JourneyExportFieldId[];
  examDetails: boolean;
  taskDetails: boolean;
  includeNotes: boolean;
}
export function selectedExportFields(ids: readonly string[]) {
  const selected = new Set(ids);
  return JOURNEY_EXPORT_FIELDS.filter((f) => selected.has(f.id));
}
