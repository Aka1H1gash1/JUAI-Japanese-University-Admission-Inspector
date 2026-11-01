import type { PlannerEvent } from './application-calendar';
import type { SpecialProgramSummary } from './special-program-types';

import { computed, ref } from 'vue';

import { validPlannerDay } from './application-planning';
import { localApi } from './local-api';

// Programs the user is not actively pursuing stay out of the overview and calendar.
const ACTIVE_STATUSES = new Set(['applied', 'preparing']);

export function isActiveProgram(program: SpecialProgramSummary) {
  return program.favorite || ACTIVE_STATUSES.has(program.status);
}

/**
 * Converts special-program dates into read-only planner events.
 * They link back to the program page; lab timelines are not modified.
 */
export function specialProgramEvents(programs: SpecialProgramSummary[]) {
  const events: PlannerEvent[] = [];
  for (const program of programs) {
    if (!isActiveProgram(program)) continue;
    const institution =
      program.universityName || program.institutionName || '特殊入学项目';
    const add = (
      key: string,
      kind: PlannerEvent['kind'],
      title: string,
      start: string,
      end = start,
    ) => {
      if (!validPlannerDay(start) || !validPlannerDay(end) || end < start)
        return;
      events.push({
        id: `program-${program.id}-${key}`,
        source: `program:${program.id}:${key}`,
        labId: '',
        labName: program.name,
        universityName: institution,
        title,
        kind,
        start,
        end,
        at: '',
        complete: program.status === 'closed',
        details: '来自特殊入学项目，在项目详情中修改日期。',
        path: `/japan-grad/special-programs/${program.id}`,
      });
    };
    const { applicationEnd, applicationStart } = program;
    if (applicationStart && applicationEnd)
      add(
        'application',
        'application',
        '项目出愿',
        applicationStart,
        applicationEnd,
      );
    else if (applicationEnd)
      add('application-end', 'application', '项目出愿截止', applicationEnd);
    else if (applicationStart)
      add('application-start', 'application', '项目出愿开始', applicationStart);
    if (program.assessmentDate)
      add('assessment', 'written', '项目考核', program.assessmentDate);
    if (program.resultDate)
      add('result', 'result', '项目结果', program.resultDate);
  }
  return events;
}

/** Loads special programs once per page; a failed request only hides these dates. */
export function useSpecialProgramEvents() {
  const programs = ref<SpecialProgramSummary[]>([]);
  localApi<SpecialProgramSummary[]>('/special-programs')
    .then((items) => {
      programs.value = items;
    })
    .catch(() => {});
  return computed(() => specialProgramEvents(programs.value));
}
