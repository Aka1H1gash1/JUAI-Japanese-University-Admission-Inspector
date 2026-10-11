export const CONTACT_STATUSES: readonly [
  'not_contacted',
  'first_sent',
  'replied',
  'interview_scheduled',
  'consent',
  'closed',
];
export function validPlannerDay(value: unknown): boolean;
export function validPlannerMinute(value: unknown): boolean;
export function planningError(data: unknown): string;
