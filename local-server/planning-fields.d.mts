export const CONTACT_STATUSES: readonly [
  'not_contacted',
  'first_sent',
  'replied',
  'interview_scheduled',
  'interview_completed',
  'consent',
  'closed',
];
export const CONTACT_RESULTS: readonly [
  'pending',
  'admitted',
  'rejected',
  'withdrawn',
  'other',
];
export type ContactStatus = (typeof CONTACT_STATUSES)[number];
export interface ContactRecord {
  status: ContactStatus;
  experienceId: string;
  experienceTitle: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  plannedDate: string;
  firstSentDate: string;
  interviewDate: string;
  interviewAt: string;
  actualInterviewDate: string;
  actualInterviewAt: string;
  consentDate: string;
  followUpDate: string;
  draftSubject: string;
  draftBody: string;
  replySummary: string;
  notes: string;
  requirements: string;
  interviewPreparation: string;
  interviewNotes: string;
  interviewQA: { id: string; question: string; answer: string }[];
  consentEmailId: string;
  consentOriginal: string;
  consentSourceNote: string;
  consentMailDate: string;
  finalResult: (typeof CONTACT_RESULTS)[number];
  resultDate: string;
  resultNotes: string;
  resultEmailId: string;
  resultOriginal: string;
  resultSourceNote: string;
  resultMailDate: string;
  stageHistory: {
    id: string;
    status: ContactStatus;
    at: string;
    via: 'mail' | 'manual';
    description: string;
  }[];
  mailManaged: boolean;
  mailFirstSentDate: string;
  mailFollowUpDate: string;
}
export const CONTACT_EDITABLE_FIELDS: readonly (keyof ContactRecord)[];
export function emptyContactRecord(): ContactRecord;
export function validPlannerDay(value: unknown): boolean;
export function validPlannerMinute(value: unknown): boolean;
export function planningError(data: unknown): string;
