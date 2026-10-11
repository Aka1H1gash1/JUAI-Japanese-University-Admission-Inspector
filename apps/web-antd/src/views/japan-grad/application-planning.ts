import {
  CONTACT_STATUSES,
  validPlannerDay,
  validPlannerMinute,
} from '../../../../../local-server/planning-fields.mjs';
import type { LabTarget } from './lab-targets';
export { CONTACT_STATUSES, validPlannerDay, validPlannerMinute };
export type ContactStatus = (typeof CONTACT_STATUSES)[number];
export interface ProfessorContact {
  status: ContactStatus;
  plannedDate: string;
  firstSentDate: string;
  interviewAt: string;
  consentDate: string;
  followUpDate: string;
  draftSubject: string;
  draftBody: string;
  replySummary: string;
  notes: string;
}
export interface ApplicationTask {
  id: string;
  title: string;
  kind: 'material' | 'todo';
  progress: number;
  dueDate: string;
  notes: string;
}
export const CONTACT_LABELS: Record<ContactStatus, string> = {
  not_contacted: '未联系',
  first_sent: '已发首封',
  replied: '已回复',
  interview_scheduled: '已约面试',
  consent: '已拿内诺',
  closed: '已结束 / 暂停',
};
export const CONTACT_OPTIONS = CONTACT_STATUSES.map((value) => ({
  label: CONTACT_LABELS[value],
  value,
}));
export function emptyContact(): ProfessorContact {
  return {
    status: 'not_contacted',
    plannedDate: '',
    firstSentDate: '',
    interviewAt: '',
    consentDate: '',
    followUpDate: '',
    draftSubject: '',
    draftBody: '',
    replySummary: '',
    notes: '',
  };
}
export function normalizedContact(
  value?: Partial<ProfessorContact>,
): ProfessorContact {
  return { ...emptyContact(), ...value };
}
export function japanToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}
export function dayNumber(day: string) {
  return Date.parse(`${day}T00:00:00Z`) / 86400000;
}
export function addDays(day: string, count: number) {
  return new Date((dayNumber(day) + count) * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function dateFromText(raw: string) {
  const value = raw.trim();
  const match =
    /^(\d{4})\s*[-/年.]\s*(\d{1,2})\s*[-/月.]\s*(\d{1,2})(?:日)?(?:\s+\d{1,2}:\d{2})?$/.exec(
      value,
    );
  if (!match) return '';
  const date = `${match[1]}-${match[2]!.padStart(2, '0')}-${match[3]!.padStart(2, '0')}`;
  return validPlannerDay(date) ? date : '';
}
export function contactWithStatus(
  value: ProfessorContact,
  status: ContactStatus,
) {
  return {
    ...value,
    status,
    firstSentDate:
      status === 'first_sent' && !value.firstSentDate
        ? japanToday()
        : value.firstSentDate,
    consentDate:
      status === 'consent' && !value.consentDate
        ? japanToday()
        : value.consentDate,
  };
}
export function primaryProfessor(target: LabTarget) {
  return (
    target.professors.find((item) => item.id === target.lab.mainProfessorId) ??
    target.professors[0]
  );
}
export function materialProgress(tasks: ApplicationTask[] = []) {
  const materials = tasks.filter((item) => item.kind === 'material');
  return {
    count: materials.length,
    done: materials.filter((item) => item.progress === 100).length,
    percent: materials.length
      ? Math.round(
          materials.reduce((sum, item) => sum + item.progress, 0) /
            materials.length,
        )
      : 0,
  };
}
export const MATERIAL_TEMPLATES = [
  '研究计划书（RP）',
  '推荐信',
  '志望理由书',
  '语言成绩（托福 / N1 等）',
  '成绩单',
  '毕业 / 在读证明',
];
export function firstMailTemplate(name: string) {
  return {
    subject: '大学院への進学・研究についてのご相談（[氏名]）',
    body: `${name} 先生\n\n突然のご連絡、失礼いたします。\n私は[所属・学年]の[氏名]と申します。[入学希望時期・課程]への進学を検討しております。\n\n先生の[論文・研究テーマ]を拝見し、特に[関心を持った点]に興味を持ちました。私は[自身の研究経験・関心]について学んでおり、今後は[研究したい内容]に取り組みたいと考えております。\n\n先生の研究室における学生の受け入れや、事前相談の機会について伺えますでしょうか。必要でしたら、履歴書や研究計画書をお送りいたします。\n\nお忙しいところ恐縮ですが、ご検討いただけますと幸いです。\n何卒よろしくお願いいたします。\n\n[氏名]\n[所属]\n[メールアドレス]`,
  };
}
