import type { PlannerEvent } from './application-calendar';
import type { LabTarget } from './lab-targets';

import { dateFromText, dayNumber } from './application-planning';
import {
  labLanguageRequirements,
  labPath,
  majorPath,
  targetExams,
} from './lab-targets';
import { universityBudgetTotals } from './university-fees';

// An active application window is ordered by its deadline, rather than its opening day.
export function actionDay(event: PlannerEvent, today: string) {
  return event.start <= today ? event.end : event.start;
}

export function upcomingEvents(
  events: PlannerEvent[],
  today: string,
  days: number,
) {
  return events
    .filter(
      (event) =>
        event.kind !== 'task' &&
        !event.complete &&
        event.end >= today &&
        dayNumber(event.start) - dayNumber(today) <= days,
    )
    .toSorted(
      (a, b) =>
        actionDay(a, today).localeCompare(actionDay(b, today)) ||
        a.title.localeCompare(b.title, 'zh-CN'),
    );
}

export interface InformationGap {
  id: string;
  name: string;
  context: string;
  fields: string[];
  path: string;
  editor?: { kind: 'lab' | 'university'; id: string; parentId?: string };
}

export function informationGaps(targets: LabTarget[]) {
  const gaps: InformationGap[] = [];
  const universities = new Set<string>();
  const majors = new Set<string>();
  for (const target of targets) {
    const { university, major, lab } = target;
    if (!universities.has(university.id)) {
      universities.add(university.id);
      const fields = universityBudgetTotals(university).missingFields;
      if (fields.length > 0)
        gaps.push({
          id: `university-${university.id}`,
          name: university.name,
          context: '大学预算 · 所属研究室共用',
          fields,
          path: `/japan-grad/universities/${university.id}`,
          editor: { kind: 'university', id: university.id },
        });
    }
    if (!majors.has(major.id)) {
      majors.add(major.id);
      const fields: string[] = [];
      if (
        !dateFromText(major.applicationStart) ||
        !dateFromText(major.applicationEnd)
      )
        fields.push('完整出愿日期');
      if (!major.applicationMaterials.trim()) fields.push('出愿材料');
      const exams = targetExams(target);
      if (exams.length === 0) fields.push('考试记录');
      else {
        if (exams.some((exam) => !exam.subjects.trim()))
          fields.push('考试科目');
        if (
          exams.some(
            (exam) =>
              !exam.writtenDate.trim() &&
              !exam.interviewDate.trim() &&
              !exam.examDate.trim(),
          )
        )
          fields.push('考试时间');
      }
      if (fields.length > 0)
        gaps.push({
          id: `major-${major.id}`,
          name: major.name,
          context: `${university.name} · 专攻资料共用`,
          fields,
          path: majorPath(target),
        });
    }
    const fields: string[] = [];
    if (!lab.research.trim()) fields.push('研究方向');
    if (!labLanguageRequirements(target)) fields.push('语言要求');
    if (target.professors.length === 0) fields.push('老师资料');
    if (!(lab.tasks ?? []).some((task) => task.kind === 'material'))
      fields.push('材料清单');
    if (fields.length > 0)
      gaps.push({
        id: `lab-${lab.id}`,
        name: lab.name,
        context: university.name,
        fields,
        path: `${labPath(target)}?tab=${(() => {
          if (fields.includes('老师资料')) {
            return 'teachers';
          }
          if (fields.includes('材料清单')) {
            return 'materials';
          }
          return 'admissions';
        })()}`,
        editor: fields.every((field) =>
          ['研究方向', '语言要求'].includes(field),
        )
          ? { kind: 'lab', id: lab.id, parentId: major.id }
          : undefined,
      });
  }
  return gaps;
}
