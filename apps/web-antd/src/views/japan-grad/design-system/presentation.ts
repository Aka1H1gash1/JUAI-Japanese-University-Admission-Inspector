import type { ExamHistoryRecord } from '../exam-history';

// Never turn prose, ranges or impossible calendar dates into exact dates.
export function exactDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.valueOf()) ||
    date.toISOString().slice(0, 10) !== value
    ? undefined
    : value;
}

export function selectedExam(records: ExamHistoryRecord[], id: string) {
  return records.find((record) => record.id === id) ?? records[0];
}
