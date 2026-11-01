import type { LabTarget } from './lab-targets';

import {
  CONTACT_LABELS,
  normalizedContact,
  primaryProfessor,
} from './application-planning';

export const APPLICATION_STAGES = [
  '整理资料',
  '联系老师',
  '沟通面试',
  '取得内诺',
  '申请结果',
];

/** Based on recorded contact evidence; a date passing never advances a stage. */
export function applicationStage(target: LabTarget) {
  const person = primaryProfessor(target);
  const contact = normalizedContact(person?.contact);
  const statuses =
    contact.status === 'closed'
      ? contact.stageHistory.map((entry) => entry.status)
      : [contact.status];
  const consent = statuses.includes('consent') || !!contact.consentDate;
  const communication =
    consent ||
    !!contact.actualInterviewDate ||
    statuses.some((status) =>
      ['interview_completed', 'interview_scheduled', 'replied'].includes(
        status,
      ),
    );
  const contacted =
    communication || !!contact.firstSentDate || statuses.includes('first_sent');
  const result = contact.finalResult !== 'pending';
  let index = 0;
  if (contacted) index = 1;
  if (communication) index = 2;
  if (consent) index = 3;
  if (result) index = 4;
  return {
    index,
    reached: [true, contacted, communication, consent, result],
    label: person ? CONTACT_LABELS[contact.status] : '尚未添加老师',
    result: contact.finalResult,
    professor: person?.name || '',
  };
}
