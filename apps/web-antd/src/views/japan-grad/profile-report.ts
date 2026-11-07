import type { University } from './explorer';
import type { LabTarget } from './lab-targets';

import {
  CONTACT_LABELS,
  CONTACT_RESULT_LABELS,
  normalizedContact,
  primaryProfessor,
} from './application-planning';
import { labLanguageRequirements, targetExams } from './lab-targets';
import { universityBudgetTotals, universityFees } from './university-fees';

export type ReportScope = 'favorites' | 'shortlist' | 'university';
export type ReportDetail = 'detailed' | 'overview' | 'stage';
export type ReportStage =
  | 'application'
  | 'auto'
  | 'contact'
  | 'interview'
  | 'result'
  | 'selection';
export const REPORT_TITLES = {
  university: '大学信息',
  shortlist: '备选研究室',
  favorites: '心仪研究室',
};
export const REPORT_STAGES = {
  selection: '选校比较',
  contact: '教授联络',
  interview: '面试准备',
  application: '内诺与出愿',
  result: '结果复盘',
};
export function foreignStudentLabel(value?: string) {
  if (value === 'yes') return '有';
  if (value === 'no') return '无';
  return '待确认';
}
export const REPORT_DETAIL_LABELS = {
  overview: '概览版',
  stage: '阶段版',
  detailed: '详细版',
};
function languageOrigin(t: LabTarget) {
  if (t.lab.languageRequirements) return '研究室单独要求';
  if (t.major.languageRequirements) return '沿用所属专攻';
  return '尚待核对';
}
export interface ReportRow {
  label: string;
  value: number | string;
}
export interface ReportRecord {
  id: string;
  title: string;
  subtitle: string;
  stage: string;
  sections: { title: string; rows: ReportRow[] }[];
}
export interface ProfileReport {
  title: string;
  detail: ReportDetail;
  date: string;
  records: ReportRecord[];
  columns: string[];
  rows: (number | string)[][];
}
const text = (value: unknown) => String(value ?? '').trim() || '待确认';
const row = (label: string, value: unknown): ReportRow => ({
  label,
  value: typeof value === 'number' ? value : text(value),
});
export function targetReportStage(t: LabTarget): Exclude<ReportStage, 'auto'> {
  const status = normalizedContact(primaryProfessor(t)?.contact).status;
  if (status === 'closed') return 'result';
  if (status === 'consent') return 'application';
  if (status === 'interview_scheduled' || status === 'interview_completed')
    return 'interview';
  if (status === 'first_sent' || status === 'replied') return 'contact';
  return 'selection';
}
export function buildProfileReport(input: {
  scope: ReportScope;
  detail: ReportDetail;
  stage: ReportStage;
  year: string;
  universities?: University[];
  targets?: LabTarget[];
  schoolNames?: (id: string) => string[];
  now?: Date;
}): ProfileReport {
  const date = (input.now || new Date()).toLocaleDateString('sv-SE', {
    timeZone: 'Asia/Tokyo',
  });
  const records: ReportRecord[] = [];
  const rows: (number | string)[][] = [];
  const columns =
    input.scope === 'university'
      ? [
          '大学',
          '所在地',
          '类型',
          'QS排名',
          '排名年份',
          '入学金（日元）',
          '年度学费（日元）',
          '研究科',
          '官网',
        ]
      : [
          '大学',
          '研究科',
          '专攻',
          '研究室',
          '老师',
          '研究方向',
          '外国人学生',
          '语言要求',
          '当前联络阶段',
          '报告阶段',
          '官网',
        ];
  if (input.scope === 'university') {
    for (const u of input.universities || []) {
      const budget = universityBudgetTotals(u);
      const f = universityFees(u);
      const schools = input.schoolNames?.(u.id) || [];
      const numeric = (s: string) =>
        typeof s === 'string' && s.trim() !== '' && Number.isFinite(Number(s))
          ? Number(s)
          : '待确认';
      const basic = [
        row('所在地', u.location),
        row('大学类型', u.category),
        row('QS排名 / 年份', [u.qsRank, u.qsYear].filter(Boolean).join(' / ')),
        row(
          '日本排名 / 来源',
          [u.japanRank, u.japanRankSource, u.japanRankYear]
            .filter(Boolean)
            .join(' / '),
        ),
        row('研究科', schools.join('、')),
        row('大学官网', u.website),
      ];
      const fees = [
        row('入学金（日元）', numeric(f.admissionFee)),
        row('年度学费（日元）', numeric(f.annualTuition)),
        row('月房租（日元）', numeric(u.monthlyRent)),
        row('月生活费（日元）', numeric(u.monthlyLivingExpenses)),
        row(
          '首年预算（日元）',
          budget.firstYear ? Number(budget.firstYear) : '必要费用未填写完整',
        ),
        row(
          '两年预算（日元）',
          budget.twoYears ? Number(budget.twoYears) : '必要费用未填写完整',
        ),
      ];
      records.push({
        id: u.id,
        title: u.name,
        subtitle: u.japaneseName || '大学资料',
        stage: '大学信息',
        sections: [
          { title: '择校概况', rows: basic },
          { title: '费用与预算', rows: fees },
          ...(input.detail === 'detailed'
            ? [
                {
                  title: '补充信息',
                  rows: [
                    row('费用说明', u.feeNotes),
                    row('宿舍说明', u.dormitoryNotes),
                    row('记录备注', u.notes),
                  ],
                },
              ]
            : []),
        ],
      });
      rows.push([
        u.name,
        text(u.location),
        text(u.category),
        text(u.qsRank),
        text(u.qsYear),
        numeric(f.admissionFee),
        numeric(f.annualTuition),
        text(schools.join('、')),
        text(u.website),
      ]);
    }
  } else {
    for (const t of input.targets || []) {
      const teacher = primaryProfessor(t);
      const c = normalizedContact(teacher?.contact);
      const stage = input.stage === 'auto' ? targetReportStage(t) : input.stage;
      const basic = [
        row('大学 / 研究科', `${t.university.name} / ${t.school.name}`),
        row('专攻', t.major.name),
        row('研究方向', t.lab.research),
        row(
          '老师',
          t.professors
            .map((p) => `${p.name}${p.title ? `（${p.title}）` : ''}`)
            .join('、'),
        ),
        row('外国人学生', foreignStudentLabel(t.lab.foreignStudentStatus)),
        row('语言要求', labLanguageRequirements(t)),
        row('当前联络阶段', CONTACT_LABELS[c.status]),
        row('研究室官网', t.lab.website),
      ];
      const sections: ReportRecord['sections'] = [
        { title: '关键信息', rows: basic },
      ];
      if (input.detail !== 'overview') {
        const mapping: Record<Exclude<ReportStage, 'auto'>, ReportRow[]> = {
          selection: [
            row('关注理由 / 备注', t.lab.notes),
            row('语言要求口径', languageOrigin(t)),
            row('外国人学生信息来源', t.lab.foreignStudentSource),
            row('情况说明', t.lab.foreignStudentNotes),
          ],
          contact: [
            row('主要联系老师', teacher?.name),
            row('公开邮箱', teacher?.email),
            row('首封日期', c.firstSentDate),
            row('回复摘要', c.replySummary),
            row('联络要求', c.requirements),
            row('后续联络日期', c.followUpDate),
          ],
          interview: [
            row('面试时间（JST）', c.interviewAt || c.interviewDate),
            row('面试准备', c.interviewPreparation),
            row(
              '实际面试时间（JST）',
              c.actualInterviewAt || c.actualInterviewDate,
            ),
            row('面试记录', c.interviewNotes),
            row('问答记录数量', c.interviewQA.length),
          ],
          application: [
            row('内诺日期', c.consentDate),
            row('出愿开始', t.major.applicationStart),
            row('出愿截止', t.major.applicationEnd),
            row('出愿材料', t.major.applicationMaterials),
            row(
              '材料准备',
              (t.lab.tasks || [])
                .filter((x) => x.kind === 'material')
                .map((x) => `${x.title} · ${x.progress}%`)
                .join('\n'),
            ),
            row(
              '考试与科目',
              targetExams(t, input.year)
                .map(
                  (e) =>
                    `${e.year} ${e.session}\n${e.subjects || '科目待确认'}\n${[e.examDate, e.writtenDate, e.interviewDate].filter(Boolean).join(' / ')}`,
                )
                .join('\n\n'),
            ),
          ],
          result: [
            row('结果', CONTACT_RESULT_LABELS[c.finalResult]),
            row('结果日期', c.resultDate),
            row('结果说明', c.resultNotes),
            row('当前经历', c.experienceTitle),
            row('复盘备注', c.notes),
          ],
        };
        sections.push({ title: REPORT_STAGES[stage], rows: mapping[stage] });
        if (input.detail === 'detailed')
          sections.push({
            title: '准备清单与核对来源',
            rows: [
              row('研究室考试补充', t.lab.examNotes),
              row('研究室出愿补充', t.lab.applicationNotes),
              row('外国人学生来源', t.lab.foreignStudentSource),
              row('外国人学生说明', t.lab.foreignStudentNotes),
              row(
                '有日期的待办',
                (t.lab.tasks || [])
                  .filter((x) => x.kind === 'todo')
                  .map(
                    (x) =>
                      `${x.dueDate || '日期待确认'} · ${x.title} · ${x.progress === 100 ? '已完成' : '待完成'}`,
                  )
                  .join('\n'),
              ),
              row('研究室备注', t.lab.notes),
            ],
          });
      }
      records.push({
        id: t.lab.id,
        title: t.lab.name,
        subtitle: `${t.university.name} / ${t.school.name} / ${t.major.name}`,
        stage: REPORT_STAGES[stage],
        sections,
      });
      rows.push([
        t.university.name,
        t.school.name,
        t.major.name,
        t.lab.name,
        text(t.professors.map((p) => p.name).join('、')),
        text(t.lab.research),
        foreignStudentLabel(t.lab.foreignStudentStatus),
        text(labLanguageRequirements(t)),
        CONTACT_LABELS[c.status],
        REPORT_STAGES[stage],
        text(t.lab.website),
      ]);
    }
  }
  if (records.length === 0) throw new Error('请选择至少一项要导出的资料。');
  if (records.length > 100)
    throw new Error('单次最多导出100项，请缩小选择范围。');
  return {
    title: REPORT_TITLES[input.scope],
    detail: input.detail,
    date,
    records,
    columns,
    rows,
  };
}
