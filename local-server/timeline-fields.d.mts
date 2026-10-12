export const TIMELINE_LABELS: Readonly<
  Record<
    | 'contact'
    | 'consent'
    | 'application'
    | 'exam'
    | 'written'
    | 'interview'
    | 'result'
    | 'teacher_interview'
    | 'followup'
    | 'task'
    | 'sent',
    string
  >
>;
export function timelineError(value: unknown): string;
