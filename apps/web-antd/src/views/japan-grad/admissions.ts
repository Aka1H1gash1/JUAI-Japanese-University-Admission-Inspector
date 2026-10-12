import { defineStore } from 'pinia';
import { ref } from 'vue';
import definitions from '../../../../../local-server/admission-fields.json';
import type {
  University,
  GraduateSchool,
  Major,
  ResearchLab,
} from './explorer';
import { jsonOptions, localApi } from './local-api';
export type AdmissionFieldId =
  | 'applicationStart'
  | 'applicationEnd'
  | 'writtenDate'
  | 'interviewDate'
  | 'resultDate'
  | 'subjects'
  | 'languageRequirements'
  | 'applicationMaterials'
  | 'eligibility'
  | 'submissionMethod'
  | 'applicationFee'
  | 'professorContactRequirement'
  | 'notes';
export const ADMISSION_FIELDS = definitions as {
  id: AdmissionFieldId;
  label: string;
  max: number;
  date?: boolean;
  money?: boolean;
}[];
export interface Evidence {
  documentId: string;
  sha256: string;
  page: number;
  quote: string;
  verification?: 'text_matched' | 'visual_review';
}
export interface CycleTask {
  id: string;
  title: string;
  progress: number;
  dueDate: string;
}
export interface AdmissionCycle {
  id: string;
  majorId: string;
  intakeYear: number;
  intakeMonth: number;
  degree: 'master' | 'doctor' | 'research_student';
  selectionType: string;
  batch: string;
  status: 'preparing' | 'submitted' | 'result_received' | 'withdrawn';
  result: 'pending' | 'passed' | 'failed' | 'waitlisted';
  labIds: string[];
  fields: Record<AdmissionFieldId, string>;
  tasks: CycleTask[];
  submittedAt: string;
  enrollmentDeadline: string;
  examNumber: string;
  trackingNumber: string;
  provenance: Partial<
    Record<
      AdmissionFieldId,
      {
        origin: string;
        confirmedAt: string;
        value: string;
        executor?: string;
        jobId?: string;
        evidence?: Evidence[];
      }
    >
  >;
  revision: number;
  createdAt: string;
  updatedAt: string;
}
export interface AnalysisJob {
  id: string;
  cycleId: string;
  baseRevision: number;
  baseFields: AdmissionCycle['fields'];
  context: Pick<
    AdmissionCycle,
    'intakeYear' | 'intakeMonth' | 'degree' | 'selectionType' | 'batch'
  >;
  sources: {
    id: string;
    title: string;
    filename: string;
    year: number;
    sha256: string;
    majorId: string;
  }[];
  status: 'queued' | 'parsing' | 'ready' | 'awaiting_review' | 'failed';
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
        status: 'found' | 'not_found' | 'unreadable' | 'conflict';
        evidence: Evidence[];
      }
    >
  >;
  warnings: string[];
  status: 'pending' | 'applied';
  createdAt: string;
  appliedFields?: AdmissionFieldId[];
}
export interface AdmissionContext {
  cycle: AdmissionCycle;
  university: University;
  school: GraduateSchool;
  major: Major;
  labs: ResearchLab[];
}
export interface CycleDetail extends AdmissionContext {
  jobs: AnalysisJob[];
}
export const DEGREE_LABELS = {
  master: '修士',
  doctor: '博士',
  research_student: '研究生',
};
export const CYCLE_STATUS_LABELS = {
  preparing: '准备中',
  submitted: '已提交',
  result_received: '结果已出',
  withdrawn: '已放弃',
};
export const RESULT_LABELS = {
  pending: '待公布',
  passed: '合格',
  failed: '不合格',
  waitlisted: '候补',
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
export function cycleLabel(
  cycle: Pick<
    AdmissionCycle,
    'intakeYear' | 'intakeMonth' | 'degree' | 'selectionType' | 'batch'
  >,
) {
  return `${cycle.intakeYear} 年 ${cycle.intakeMonth} 月入学 · ${DEGREE_LABELS[cycle.degree]} · ${cycle.selectionType}${cycle.batch ? ` · ${cycle.batch}` : ''}`;
}
export function blankCycle(majorId = ''): AdmissionCycle {
  return {
    id: '',
    majorId,
    intakeYear: new Date().getFullYear() + 1,
    intakeMonth: 4,
    degree: 'master',
    selectionType: '',
    batch: '',
    status: 'preparing',
    result: 'pending',
    labIds: [],
    fields: Object.fromEntries(
      ADMISSION_FIELDS.map((f) => [f.id, '']),
    ) as AdmissionCycle['fields'],
    tasks: [],
    submittedAt: '',
    enrollmentDeadline: '',
    examNumber: '',
    trackingNumber: '',
    provenance: {},
    revision: 0,
    createdAt: '',
    updatedAt: '',
  };
}
export const useAdmissionsStore = defineStore('juai-admissions', () => {
  const cycles = ref<AdmissionCycle[]>([]),
    loading = ref(false),
    saving = ref(false),
    error = ref('');
  let generation = 0;
  function upsert(value: AdmissionCycle) {
    const index = cycles.value.findIndex((c) => c.id === value.id);
    if (index < 0) cycles.value.unshift(value);
    else cycles.value[index] = value;
  }
  async function load() {
    const current = ++generation;
    loading.value = true;
    error.value = '';
    try {
      const value = await localApi<AdmissionCycle[]>('/admissions/cycles');
      if (current === generation) cycles.value = value;
    } catch (e) {
      if (current === generation)
        error.value = e instanceof Error ? e.message : '申请轮次加载失败。';
    } finally {
      if (current === generation) loading.value = false;
    }
  }
  async function save(value: AdmissionCycle) {
    if (saving.value) throw new Error('正在保存，请稍后。');
    saving.value = true;
    try {
      const result = await localApi<AdmissionCycle>(
        `/admissions/cycles${value.id ? `/${value.id}` : ''}`,
        jsonOptions(value.id ? 'PUT' : 'POST', value),
      );
      upsert(result);
      return result;
    } finally {
      saving.value = false;
    }
  }
  return { cycles, loading, saving, error, load, save, upsert };
});
