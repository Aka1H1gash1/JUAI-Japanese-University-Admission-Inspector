import type {
  GraduateSchool,
  Major,
  ResearchLab,
  University,
} from './explorer';

import definitions from '../../../../../local-server/admission-fields.json';
export type AdmissionFieldId =
  | 'applicationEnd'
  | 'applicationFee'
  | 'applicationMaterials'
  | 'applicationStart'
  | 'eligibility'
  | 'interviewDate'
  | 'languageRequirements'
  | 'notes'
  | 'professorContactRequirement'
  | 'resultDate'
  | 'subjects'
  | 'submissionMethod'
  | 'writtenDate';
export const ADMISSION_FIELDS = definitions as {
  id: AdmissionFieldId;
  label: string;
  max: number;
  date?: boolean;
  money?: boolean;
}[];
export const EXAM_FIELDS: AdmissionFieldId[] = [
  'subjects',
  'writtenDate',
  'interviewDate',
  'resultDate',
];
export interface Evidence {
  documentId: string;
  sha256: string;
  page: number;
  quote: string;
  verification?: 'text_matched' | 'visual_review';
}
export interface AnalysisObject {
  admissionYear: number;
  degree: 'doctor' | 'master' | 'research_student';
  selectionType: string;
  notes: string;
}
export interface AnalysisJob {
  id: string;
  majorId: string;
  baseFields: Record<AdmissionFieldId, string>;
  context: AnalysisObject;
  sources: {
    id: string;
    title: string;
    filename: string;
    year: number;
    sha256: string;
    majorId: string;
  }[];
  status: 'awaiting_review' | 'failed' | 'parsing' | 'queued' | 'ready';
  error: string;
  createdAt: string;
}
export interface AnalysisProposal {
  id: string;
  schemaVersion: 1;
  jobId: string;
  executor: string;
  fields: Partial<
    Record<
      AdmissionFieldId,
      {
        value: string;
        status: 'conflict' | 'found' | 'not_found' | 'unreadable';
        evidence: Evidence[];
        scopeNote?: string;
        requiresScopeConfirmation?: boolean;
      }
    >
  >;
  warnings: string[];
  status: 'applied' | 'pending';
  createdAt: string;
  appliedFields?: AdmissionFieldId[];
}
export interface AnalysisContext {
  major: Major;
  university: University;
  school: GraduateSchool;
  labs: ResearchLab[];
  revision: number;
  requirements: {
    fields: Record<AdmissionFieldId, string>;
    provenance: Partial<
      Record<
        AdmissionFieldId,
        {
          value: string;
          origin: string;
          evidence: Evidence[];
          confirmedAt: string;
        }
      >
    >;
  };
  jobs: AnalysisJob[];
}
export const DEGREE_LABELS = {
  master: '修士',
  doctor: '博士',
  research_student: '研究生',
};
export const JOB_STATUS_LABELS = {
  queued: '等待读取',
  parsing: '正在读取',
  ready: '可交给 Agent',
  awaiting_review: '草稿待核对',
  failed: '读取失败',
};
export const PROPOSAL_STATUS_LABELS = {
  found: '已定位 · 待核对',
  not_found: '未找到',
  unreadable: '无法读取',
  conflict: '存在冲突',
};
export function analysisObjectLabel(value: AnalysisObject) {
  return `${value.admissionYear} 年资料 · ${DEGREE_LABELS[value.degree]}${value.selectionType ? ` · ${value.selectionType}` : ''}`;
}
