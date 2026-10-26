export const PROGRAM_CATEGORIES = [
  'SGU',
  '英语授课项目',
  '联合培养',
  '双学位项目',
  '其他',
];
export const PROGRAM_STATUSES = {
  researching: '了解中',
  preparing: '准备申请',
  applied: '已申请',
  admitted: '已录取',
  closed: '已结束',
};
export const PROGRAM_DEGREES = {
  master: '修士',
  doctor: '博士',
  research_student: '研究生',
  bachelor: '本科',
  other: '其他',
};
export interface SpecialProgram {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  name: string;
  category: string;
  institutionName: string;
  universityId: string;
  schoolId: string;
  majorId: string;
  universityName: string;
  schoolName: string;
  majorName: string;
  degree: '' | keyof typeof PROGRAM_DEGREES;
  language: string;
  intake: string;
  summary: string;
  applicationStart: string;
  applicationEnd: string;
  assessmentDate: string;
  resultDate: string;
  eligibility: string;
  languageRequirements: string;
  applicationMaterials: string;
  assessment: string;
  fees: string;
  scholarships: string;
  website: string;
  notes: string;
  status: keyof typeof PROGRAM_STATUSES;
  favorite: boolean;
}
export type SpecialProgramSummary = Omit<
  SpecialProgram,
  | 'applicationMaterials'
  | 'assessment'
  | 'eligibility'
  | 'fees'
  | 'languageRequirements'
  | 'notes'
  | 'scholarships'
  | 'website'
>;
export function emptyProgram(): SpecialProgram {
  return {
    id: '',
    version: 0,
    createdAt: '',
    updatedAt: '',
    name: '',
    category: 'SGU',
    institutionName: '',
    universityId: '',
    schoolId: '',
    majorId: '',
    universityName: '',
    schoolName: '',
    majorName: '',
    degree: 'master',
    language: '',
    intake: '',
    summary: '',
    applicationStart: '',
    applicationEnd: '',
    assessmentDate: '',
    resultDate: '',
    eligibility: '',
    languageRequirements: '',
    applicationMaterials: '',
    assessment: '',
    fees: '',
    scholarships: '',
    website: '',
    notes: '',
    status: 'researching',
    favorite: false,
  };
}
