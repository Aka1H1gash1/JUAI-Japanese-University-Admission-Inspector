/* oxlint-disable unicorn/explicit-length-check, unicorn/no-array-callback-reference -- Existing comparison helpers retain their stable formatting behavior. */
/* eslint-disable perfectionist/sort-imports, perfectionist/sort-union-types -- Target comparison fields use product-defined ordering. */
import type {
  GraduateSchool,
  Major,
  Professor,
  ResearchLab,
  University,
} from './explorer';
import { universityGeography } from './japan-geography';
import {
  CONTACT_LABELS,
  materialProgress,
  normalizedContact,
  primaryProfessor,
} from './application-planning';
import {
  dormitoryLabel,
  formatYen,
  universityBudgetTotals,
  universityFees,
} from './university-fees';

interface LabWorkspace {
  labs: ResearchLab[];
  majors: Major[];
  schools: GraduateSchool[];
  universities: University[];
  professors: Professor[];
}

export function labContext(store: LabWorkspace, id: string) {
  const lab = store.labs.find((item) => item.id === id);
  const major = store.majors.find((item) => item.id === lab?.majorId);
  const school = store.schools.find((item) => item.id === major?.schoolId);
  const university = store.universities.find(
    (item) => item.id === school?.universityId,
  );
  if (!lab || !major || !school || !university) return;
  return {
    lab,
    major,
    school,
    university,
    professors: store.professors.filter((item) => item.labId === lab.id),
  };
}

export type LabTarget = NonNullable<ReturnType<typeof labContext>>;

export function labLanguageRequirements(target: LabTarget) {
  return (
    target.lab.languageRequirements?.trim() ||
    target.major.languageRequirements?.trim() ||
    ''
  );
}

export function majorPath(target: LabTarget) {
  return `/japan-grad/universities/${target.university.id}/schools/${target.school.id}/majors/${target.major.id}`;
}

export function labPath(target: LabTarget) {
  return `${majorPath(target)}/labs/${target.lab.id}`;
}

export function targetExams(target: LabTarget, year = 'latest') {
  const records = target.major.examHistory.toSorted(
    (a, b) =>
      b.year.localeCompare(a.year) ||
      a.session.localeCompare(b.session, 'zh-CN'),
  );
  return records.filter(
    (item) =>
      year === 'all' ||
      item.year === (year === 'latest' ? records[0]?.year : year),
  );
}

export function targetExamText(
  target: LabTarget,
  field:
    | 'subjects'
    | 'writtenDate'
    | 'interviewDate'
    | 'resultDate'
    | 'examDate',
  year = 'latest',
) {
  return targetExams(target, year)
    .filter((item) => field !== 'examDate' || item.examDate)
    .map(
      (item) =>
        `${item.year}${item.session ? ` ${item.session}` : ''}：${item[field] || '待填写'}`,
    )
    .join('\n');
}

export function recurringBudget(university: University) {
  const tuition = universityFees(university).annualTuition;
  const fields = [
    tuition,
    university.monthlyRent,
    university.monthlyLivingExpenses,
  ];
  const known = fields.filter((value) => value !== '');
  const missing = ['年度学费', '房租', '生活费'].filter(
    (_, index) => fields[index] === '',
  );
  return {
    value: known.length
      ? Number(tuition || 0) +
        12 *
          (Number(university.monthlyRent || 0) +
            Number(university.monthlyLivingExpenses || 0))
      : undefined,
    complete: missing.length === 0,
    missing,
  };
}

export function annualBudgetText(university: University) {
  const budget = recurringBudget(university);
  return budget.value === undefined
    ? '待填写'
    : `¥ ${formatYen(String(budget.value))}${budget.complete ? ' / 年' : `（已知小计，待补${budget.missing.join('、')}）`}`;
}

export function labComparisonRows(targets: LabTarget[], year: string) {
  const fields: [string, (item: LabTarget) => string][] = [
    ['大学', (item) => item.university.name],
    ['研究科 / 专攻', (item) => `${item.school.name} / ${item.major.name}`],
    ['研究室研究方向', (item) => item.lab.research],
    ['语言要求', labLanguageRequirements],
    [
      '老师',
      (item) =>
        item.professors
          .map((person) =>
            [person.name, person.title].filter(Boolean).join(' · '),
          )
          .join('\n'),
    ],
    [
      'QS 排名 / 榜单年份',
      (item) =>
        [item.university.qsRank, item.university.qsYear]
          .filter(Boolean)
          .join(' / '),
    ],
    [
      '所在地域 / 都道府县',
      (item) =>
        Object.values(universityGeography(item.university))
          .filter(Boolean)
          .join(' / '),
    ],
    ['年度开销（不含入学金）', (item) => annualBudgetText(item.university)],
    [
      '首年总费用',
      (item) => {
        const budget = universityBudgetTotals(item.university);
        return budget.firstYear === ''
          ? ''
          : `¥ ${formatYen(budget.firstYear)}${budget.complete ? '' : `（已知小计，待补${budget.missingFields.join('、')}）`}`;
      },
    ],
    [
      '年度学费',
      (item) => {
        const value = universityFees(item.university).annualTuition;
        return value === '' ? '' : `¥ ${formatYen(value)}`;
      },
    ],
    [
      '房租 / 生活费（月）',
      (item) =>
        `${item.university.monthlyRent === '' ? '房租待填写' : `房租 ¥ ${formatYen(item.university.monthlyRent)}`} / ${item.university.monthlyLivingExpenses === '' ? '生活费待填写' : `生活费 ¥ ${formatYen(item.university.monthlyLivingExpenses)}`}`,
    ],
    ['寮申请', (item) => dormitoryLabel(item.university.dormitoryStatus)],
    [
      '考试年份 / 批次',
      (item) =>
        targetExams(item, year)
          .map((exam) => [exam.year, exam.session].filter(Boolean).join(' / '))
          .join('\n'),
    ],
    ['考试科目', (item) => targetExamText(item, 'subjects', year)],
    ['笔试时间', (item) => targetExamText(item, 'writtenDate', year)],
    ['面试时间', (item) => targetExamText(item, 'interviewDate', year)],
    ['结果发布时间', (item) => targetExamText(item, 'resultDate', year)],
    ['原考试时间（旧记录）', (item) => targetExamText(item, 'examDate', year)],
    [
      '出愿时间段',
      (item) =>
        [item.major.applicationStart, item.major.applicationEnd]
          .filter(Boolean)
          .join(' ～ '),
    ],
    ['出愿所需材料', (item) => item.major.applicationMaterials],
    ['研究室考试特殊说明', (item) => item.lab.examNotes],
    ['研究室出愿特殊说明', (item) => item.lab.applicationNotes],
    [
      '考试年度备注',
      (item) =>
        targetExams(item, year)
          .filter((exam) => exam.notes)
          .map((exam) => `${exam.year} ${exam.session}：${exam.notes}`)
          .join('\n'),
    ],
    [
      '主要联系老师 / 状态',
      (item) => {
        const person = primaryProfessor(item);
        return person
          ? `${person.name} · ${CONTACT_LABELS[normalizedContact(person.contact).status]}`
          : '';
      },
    ],
    [
      '教授面试约定（JST）',
      (item) =>
        normalizedContact(primaryProfessor(item)?.contact).interviewAt.replace(
          'T',
          ' ',
        ),
    ],
    [
      '下次跟进',
      (item) => normalizedContact(primaryProfessor(item)?.contact).followUpDate,
    ],
    [
      '教授回复要点',
      (item) => normalizedContact(primaryProfessor(item)?.contact).replySummary,
    ],
    [
      '材料准备进度',
      (item) => {
        const progress = materialProgress(item.lab.tasks);
        return progress.count
          ? `${progress.percent}% · ${progress.done}/${progress.count} 项完成`
          : '未建清单';
      },
    ],
    [
      '材料清单',
      (item) =>
        (item.lab.tasks ?? [])
          .filter((task) => task.kind === 'material')
          .map((task) => `${task.title} · ${task.progress}%`)
          .join('\n'),
    ],
    [
      '待办清单',
      (item) =>
        (item.lab.tasks ?? [])
          .filter((task) => task.kind === 'todo')
          .map(
            (task) =>
              `${task.title} · ${task.dueDate || '日期待补'} · ${task.progress === 100 ? '已完成' : '未完成'}`,
          )
          .join('\n'),
    ],
    ['研究室官网', (item) => item.lab.website],
    ['个人备注', (item) => item.lab.notes],
  ];
  return fields.map(([label, get]) => ({ label, values: targets.map(get) }));
}
