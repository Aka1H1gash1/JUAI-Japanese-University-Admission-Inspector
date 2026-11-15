export interface AdmissionBatch {
  id: string;
  majorId: string;
  version: number;
  admissionYear: null | number;
  label: string;
  examType: string;
  scope: string;
  examDate: string;
  interviewDate: string;
  subjects: string;
  materials: string;
  language: string;
  consent: 'optional' | 'required' | 'unknown';
  sourceUrl: string;
  notes: string;
  documentIds?: string[];
}
export interface LabMembers {
  version: number;
  japanese: null | number;
  foreign: null | number;
  chinese: null | number;
  total: null | number;
  otherForeign: null | number;
  sourceUrl: string;
  notes: string;
}
export interface StorageQuota {
  quota: null | number;
  used: number;
  remaining: null | number;
}
