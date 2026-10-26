export type CollectionKind =
  | 'lab'
  | 'major'
  | 'professor'
  | 'school'
  | 'university';
export const COLLECTION_KINDS: CollectionKind[] = [
  'university',
  'school',
  'major',
  'lab',
  'professor',
];
export const COLLECTION_NAMES = {
  university: '大学',
  school: '研究科',
  major: '专攻',
  lab: '研究室',
  professor: '老师',
};
export const ADMISSION_SUMMARY_NAMES: Record<string, string> = {
  eligibility: '申请资格',
  applicationPeriod: '出愿时间',
  applicationMaterials: '出愿材料',
  languageRequirements: '语言要求',
  selection: '选拔方式与考试科目',
  schedule: '考试与放榜安排',
  fees: '费用与资助',
  notes: '其他申请要求',
};
export const ADMISSION_STATUS_NAMES = {
  found: '已读取对应要项',
  uncertain: '适用范围待确认',
  not_found: '尚未取得有效要项',
  not_requested: '未启用查找',
};
export interface CollectedAdmissions {
  status: keyof typeof ADMISSION_STATUS_NAMES;
  scope: string;
  fields: CollectedField[];
}
export interface CollectedAdmissionRecord {
  jobId: string;
  appliedAt: string;
  admissions: CollectedAdmissions;
  documents: (CollectionDocument & { url: string })[];
  pdfSourceIds: string[];
}
export interface CollectionEvidence {
  sourceId: string;
  url: string;
  title: string;
  page: number;
  quote: string;
  verification: 'text_matched' | 'visual_review';
}
export interface CollectedField {
  field: string;
  value: string;
  evidence: CollectionEvidence[];
  scopeNote: string;
  requiresScopeConfirmation: boolean;
}
export interface CollectionDocument {
  sourceId: string;
  kind: 'guidelines' | 'paper';
  title: string;
  year: string;
}
export interface CollectionExam {
  id: string;
  year: string;
  session: string;
  fields: CollectedField[];
}
export type CollectionDraft = Record<CollectionKind, CollectedField[]> & {
  logo?: { sourceId: string; url: string; alt: string; reason: string };
  specialProgram?: CollectedField[];
  subject?: {
    kind: 'special_program' | 'unknown' | CollectionKind;
    reason: string;
    evidence: CollectionEvidence[];
    source: 'detected' | 'legacy' | 'unknown' | 'user';
  };
  admissions?: CollectedAdmissions;
  exams: CollectionExam[];
  documents: CollectionDocument[];
  warnings: string[];
};
export interface CollectionSource {
  id: string;
  title: string;
  url: string;
  kind: 'pdf' | 'web';
  via: string;
  totalPages: number;
  readPages: number[];
  fetchedAt: string;
  warnings: string[];
  truncated: boolean;
}
export interface CollectionJob {
  id: string;
  createdAt: string;
  updatedAt?: string;
  status:
    | 'analyzing'
    | 'applied'
    | 'cancelled'
    | 'collecting'
    | 'failed'
    | 'preparing'
    | 'review';
  message: string;
  phase?: 'complete' | 'exploring' | 'finalizing';
  error: string;
  urls: string[];
  ruleVersion?: number;
  purpose?: 'entity' | 'special_program';
  resultProgramId?: string;
  resultProgramName?: string;
  requestedKind?: 'auto' | CollectionKind;
  seekGuidelines?: boolean;
  appliedKind?: CollectionKind;
  model: string;
  warnings?: string[];
  log?: { at: string; message: string }[];
  sources?: CollectionSource[];
  draft?: CollectionDraft;
  target?: { ids: Partial<Record<CollectionKind, string>> };
  parent?: { kind: CollectionKind; id: string };
  resultIds?: Partial<Record<CollectionKind, string>>;
  resultEntities?: {
    kind: CollectionKind;
    id: string;
    name: string;
    action: 'created' | 'linked' | 'updated';
    fieldCount: number;
  }[];
}
export interface CollectionDetail {
  job: CollectionJob;
  revision: number;
  matches: Record<CollectionKind, string[]>;
}
export interface CollectionStatus {
  browser: {
    available: boolean;
    detected?: boolean;
    name: string;
    port: number;
    message?: string;
  };
  ocr: { available: boolean; name: string };
  aiConfigured: boolean;
  aiConnectionName: string;
  aiModel: string;
  fieldDefinitions: Record<CollectionKind, [string, string, number][]>;
  examFields: [string, string, number][];
  admissionSummaryFields?: [string, string, number][];
  specialProgramFields?: [string, string, number][];
}
export const COLLECTION_STATUS = {
  preparing: '准备中',
  collecting: '读取网页',
  analyzing: 'Agent 收集中',
  review: '待核对',
  failed: '未完成',
  cancelled: '已停止',
  applied: '档案已生成',
};
