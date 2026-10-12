import type { AdmissionCycle } from './admissions';
import { cycleLabel } from './admissions';
import type { LabTarget } from './lab-targets';
import type { PlannerEvent, PlannerEventKind } from './application-calendar';
import { validPlannerDay } from './application-planning';
export function buildCyclePlannerEvents(
  cycles: AdmissionCycle[],
  targets: LabTarget[],
) {
  const events: PlannerEvent[] = [];
  for (const cycle of cycles) {
    if (cycle.status === 'withdrawn') continue;
    for (const target of targets.filter((t) =>
      cycle.labIds.includes(t.lab.id),
    )) {
      const add = (
        key: string,
        kind: PlannerEventKind,
        title: string,
        start: string,
        end = start,
        complete = false,
        details = '',
      ) => {
        if (!validPlannerDay(start) || !validPlannerDay(end) || end < start)
          return;
        const source = `cycle-${cycle.id}-${key}`;
        events.push({
          id: `${target.lab.id}-${source}`,
          source,
          labId: target.lab.id,
          labName: target.lab.name,
          universityName: target.university.name,
          title: `${title} · ${cycleLabel(cycle)}`,
          kind,
          start,
          end,
          at: '',
          complete,
          details,
          path: `/japan-grad/admissions/${cycle.id}`,
        });
      };
      const f = cycle.fields,
        submitted = ['submitted', 'result_received'].includes(cycle.status);
      if (
        validPlannerDay(f.applicationStart) &&
        validPlannerDay(f.applicationEnd)
      )
        add(
          'application',
          'application',
          '出愿',
          f.applicationStart,
          f.applicationEnd,
          submitted,
          f.submissionMethod,
        );
      else if (validPlannerDay(f.applicationEnd))
        add(
          'application',
          'application',
          '出愿截止',
          f.applicationEnd,
          f.applicationEnd,
          submitted,
          f.submissionMethod,
        );
      else if (validPlannerDay(f.applicationStart))
        add(
          'application',
          'application',
          '出愿开始',
          f.applicationStart,
          f.applicationStart,
          submitted,
        );
      add(
        'written',
        'written',
        '笔试',
        f.writtenDate,
        f.writtenDate,
        cycle.status === 'result_received',
        f.subjects,
      );
      add(
        'interview',
        'interview',
        '面试',
        f.interviewDate,
        f.interviewDate,
        cycle.status === 'result_received',
      );
      add(
        'result',
        'result',
        '结果公布',
        f.resultDate,
        f.resultDate,
        cycle.status === 'result_received',
      );
      if (cycle.result === 'passed')
        add('enrollment', 'task', '入学手续截止', cycle.enrollmentDeadline);
      for (const task of cycle.tasks)
        add(
          `task-${task.id}`,
          'task',
          task.title,
          task.dueDate,
          task.dueDate,
          task.progress === 100,
          `准备进度 ${task.progress}%`,
        );
    }
  }
  return events;
}
