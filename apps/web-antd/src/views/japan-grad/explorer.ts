import type { LabTimeline, TimelineEntry } from './timeline';
import { emptyTimeline, timelineError } from './timeline';
import { ref } from 'vue';
import type { ApplicationTask, ProfessorContact } from './application-planning';
import { normalizedContact } from './application-planning';
import { planningError } from '../../../../../local-server/planning-fields.mjs';
import type { ExamHistoryRecord } from './exam-history';
import type { MajorAdmissionFields } from './major-admissions';
import { admissionRangeError, validAdmissionFields } from './major-admissions';
import {
  normalizeExamRecord,
  prepareExamBatch,
  validExamHistory,
} from './exam-history';

import { jsonOptions, localApi } from './local-api';
import { geographyError } from './japan-geography';
import {
  normalizeUniversityCategory,
  UNIVERSITY_BUDGET_FIELDS,
  universityFees,
  validYenAmount,
} from './university-fees';

import { defineStore } from 'pinia';

export type EntityKind =
  | 'lab'
  | 'major'
  | 'professor'
  | 'school'
  | 'university';

export function professorInitials(name: string) {
  const value = name.trim();
  if (!value) return '师';
  if (/^[A-Za-z]/.test(value))
    return value
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  return [...value][0];
}

export interface University {
  id: string;
  name: string;
  japaneseName: string;
  location: string;
  category: string;
  region: string;
  prefecture?: string;
  qsRank: string;
  qsYear: string;
  admissionFee: string;
  annualTuition: string;
  feeNotes: string;
  monthlyRent: string;
  monthlyLivingExpenses: string;
  dormitoryStatus: string;
  dormitoryNotes: string;
  dormitoryWebsite: string;
  logoId: string;
  website: string;
  notes: string;
}

export interface GraduateSchool {
  id: string;
  universityId: string;
  name: string;
  japaneseName: string;
  research: string;
  website: string;
  notes: string;
}

export interface Major extends MajorAdmissionFields {
  id: string;
  schoolId: string;
  name: string;
  japaneseName: string;
  research: string;
  website: string;
  notes: string;
  examHistory: ExamHistoryRecord[];
}

export interface ResearchLab {
  timeline?: LabTimeline;
  languageRequirements?: string;
  mainProfessorId?: string;
  tasks?: ApplicationTask[];
  id: string;
  majorId: string;
  name: string;
  japaneseName: string;
  research: string;
  website: string;
  notes: string;
  examNotes: string;
  applicationNotes: string;
  wantApply: boolean;
}

export interface Professor {
  contact?: ProfessorContact;
  labId?: string;
  id: string;
  majorId: string;
  name: string;
  japaneseName: string;
  title: string;
  research: string;
  laboratory: string;
  email: string;
  personalWebsite: string;
  laboratoryWebsite: string;
  notes: string;
  favorite: boolean;
}

export type EditorFields = Record<string, string>;

interface ExplorerData {
  version: 2;
  labs?: ResearchLab[];
  universities: University[];
  schools: GraduateSchool[];
  majors: Major[];
  professors: Professor[];
}

interface LegacyProfessor extends Omit<
  Professor,
  'laboratoryWebsite' | 'majorId' | 'personalWebsite'
> {
  schoolId: string;
  website: string;
}

interface LegacyExplorerData {
  version: 1;
  universities: University[];
  schools: GraduateSchool[];
  professors: LegacyProfessor[];
}

// Keep the storage key stable so users retain their existing prototype records.
const STORAGE_KEY = 'japangrad-university-explorer-v1';
const LEGACY_BACKUP_KEY = `${STORAGE_KEY}-before-v2`;

export const titleOptions = ['助教', '讲师', '副教授', '教授'].map((title) => ({
  label: title,
  value: title,
}));

function hasStrings(value: unknown, fields: string[]): value is EditorFields {
  return (
    typeof value === 'object' &&
    value !== null &&
    fields.every((field) => typeof (value as EditorFields)[field] === 'string')
  );
}

function hasBaseData(
  value: unknown,
): value is ExplorerData | LegacyExplorerData {
  if (typeof value !== 'object' || value === null) return false;
  const data = value as ExplorerData | LegacyExplorerData;
  return (
    (data.version === 1 || data.version === 2) &&
    Array.isArray(data.universities) &&
    Array.isArray(data.schools) &&
    Array.isArray(data.professors) &&
    data.universities.every((item) =>
      hasStrings(item, [
        'id',
        'name',
        'japaneseName',
        'location',
        'category',
        'website',
        'notes',
      ]),
    ) &&
    data.universities.every(
      (item) =>
        UNIVERSITY_BUDGET_FIELDS.every((field) => {
          const value = item[field];
          return (
            value === undefined ||
            (typeof value === 'string' && validYenAmount(value))
          );
        }) &&
        (
          [
            'prefecture',
            'feeNotes',
            'dormitoryStatus',
            'dormitoryNotes',
            'dormitoryWebsite',
            'logoId',
          ] as const
        ).every(
          (field) =>
            item[field] === undefined || typeof item[field] === 'string',
        ),
    ) &&
    data.schools.every((item) =>
      hasStrings(item, [
        'id',
        'universityId',
        'name',
        'japaneseName',
        'research',
        'website',
        'notes',
      ]),
    ) &&
    data.schools.every((item) =>
      data.universities.some(
        (university) => university.id === item.universityId,
      ),
    )
  );
}

function uniqueIds(records: { id: string }[]) {
  const ids = records.map((item) => item.id);
  return ids.every(Boolean) && new Set(ids).size === ids.length;
}

function isLegacyData(value: unknown): value is LegacyExplorerData {
  return (
    hasBaseData(value) &&
    value.version === 1 &&
    value.professors.every(
      (item) =>
        hasStrings(item, [
          'id',
          'schoolId',
          'name',
          'japaneseName',
          'title',
          'research',
          'laboratory',
          'email',
          'website',
          'notes',
        ]) && typeof item.favorite === 'boolean',
    ) &&
    value.professors.every((item) =>
      value.schools.some((school) => school.id === item.schoolId),
    ) &&
    uniqueIds([...value.universities, ...value.schools, ...value.professors])
  );
}

function isExplorerData(value: unknown): value is ExplorerData {
  if (
    !hasBaseData(value) ||
    value.version !== 2 ||
    !Array.isArray(value.majors)
  )
    return false;
  return (
    (value.labs === undefined ||
      (Array.isArray(value.labs) &&
        value.labs.every(
          (lab) =>
            hasStrings(lab, [
              'id',
              'majorId',
              'name',
              'japaneseName',
              'research',
              'website',
              'notes',
              'examNotes',
              'applicationNotes',
            ]) &&
            typeof lab.wantApply === 'boolean' &&
            value.majors.some((major) => major.id === lab.majorId),
        ))) &&
    !planningError(value) &&
    (value.labs ?? []).every(
      (lab: ResearchLab) => !timelineError(lab.timeline),
    ) &&
    value.majors.every(
      (item) =>
        hasStrings(item, [
          'id',
          'schoolId',
          'name',
          'japaneseName',
          'research',
          'website',
          'notes',
        ]) &&
        (item.examHistory === undefined ||
          validExamHistory(item.examHistory)) &&
        validAdmissionFields(item),
    ) &&
    value.professors.every(
      (item) =>
        hasStrings(item, [
          'id',
          'majorId',
          'name',
          'japaneseName',
          'title',
          'research',
          'laboratory',
          'email',
          'personalWebsite',
          'laboratoryWebsite',
          'notes',
        ]) && typeof item.favorite === 'boolean',
    ) &&
    uniqueIds([
      ...value.universities,
      ...value.schools,
      ...value.majors,
      ...value.professors,
      ...(value.labs ?? []),
    ]) &&
    value.majors.every((major) =>
      value.schools.some((item) => item.id === major.schoolId),
    ) &&
    value.professors.every(
      (professor) =>
        value.majors.some((item) => item.id === professor.majorId) &&
        (value.labs === undefined ||
          value.labs.some(
            (item) =>
              item.id === professor.labId && item.majorId === professor.majorId,
          )),
    )
  );
}

function migrateLegacyData(value: LegacyExplorerData): ExplorerData {
  const majors: Major[] = [];
  const majorBySchool = new Map<string, Major>();
  const professors: Professor[] = value.professors.map((professor) => {
    let major = majorBySchool.get(professor.schoolId);
    if (!major) {
      major = {
        id: crypto.randomUUID(),
        schoolId: professor.schoolId,
        name: '未分类专攻',
        japaneseName: '',
        research: '',
        website: '',
        notes: '由旧版老师资料自动归类，可编辑为实际专攻。',
        examHistory: [],
        applicationStart: '',
        applicationEnd: '',
        applicationMaterials: '',
      };
      majorBySchool.set(professor.schoolId, major);
      majors.push(major);
    }
    const { schoolId: _schoolId, website, ...retained } = professor;
    return {
      ...retained,
      majorId: major.id,
      personalWebsite: website,
      laboratoryWebsite: '',
    };
  });
  return {
    version: 2,
    universities: value.universities,
    schools: value.schools,
    majors,
    professors,
  };
}

export function websiteUrl(value: string): string | undefined {
  if (!value.trim()) return undefined;
  try {
    const url = new URL(
      /^https?:\/\//i.test(value) ? value : `https://${value}`,
    );
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      !url.hostname.includes('.')
    )
      return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

export const useExplorerStore = defineStore('japangrad-explorer', () => {
  const universities = ref<University[]>([]);
  const schools = ref<GraduateSchool[]>([]);
  const majors = ref<Major[]>([]);
  const professors = ref<Professor[]>([]);
  const labs = ref<ResearchLab[]>([]);
  const storageError = ref('');
  const loaded = ref(false);
  const loading = ref(false);
  const saving = ref(false);
  const workspacePath = ref('');
  const migrationNotice = ref('');
  let revision = 0;
  let pending: Promise<unknown> = Promise.resolve();
  let loadPromise: Promise<void> | undefined;

  interface WorkspaceSnapshot {
    initialized: boolean;
    revision: number;
    data: ExplorerData;
    workspace: string;
  }
  function snapshot(): ExplorerData {
    return JSON.parse(
      JSON.stringify({
        version: 2,
        universities: universities.value,
        schools: schools.value,
        majors: majors.value,
        professors: professors.value,
        labs: labs.value,
      }),
    );
  }
  function apply(data: ExplorerData) {
    universities.value = data.universities.map((item) => ({
      ...item,
      region: item.region ?? '',
      qsRank: item.qsRank ?? '',
      qsYear: item.qsYear ?? '',
      category: normalizeUniversityCategory(item.category),
      ...universityFees(item),
      feeNotes: item.feeNotes ?? '',
      monthlyRent: item.monthlyRent ?? '',
      monthlyLivingExpenses: item.monthlyLivingExpenses ?? '',
      dormitoryStatus: item.dormitoryStatus || 'unknown',
      dormitoryNotes: item.dormitoryNotes ?? '',
      dormitoryWebsite: item.dormitoryWebsite ?? '',
      logoId: item.logoId ?? '',
    }));
    schools.value = data.schools;
    majors.value = data.majors.map((item) => ({
      ...item,
      examHistory: (item.examHistory ?? []).map(normalizeExamRecord),
      applicationStart: item.applicationStart ?? '',
      applicationEnd: item.applicationEnd ?? '',
      applicationMaterials: item.applicationMaterials ?? '',
      languageRequirements: item.languageRequirements ?? '',
    }));
    professors.value = data.professors.map((item) => ({
      ...item,
      contact: normalizedContact(item.contact),
    }));
    labs.value = (data.labs ?? []).map((item) => ({
      ...item,
      mainProfessorId: item.mainProfessorId ?? '',
      languageRequirements: item.languageRequirements ?? '',
      tasks: item.tasks ?? [],
      timeline: item.timeline ?? emptyTimeline(),
    }));
  }
  function load() {
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      loading.value = true;
      storageError.value = '';
      try {
        let result = await localApi<WorkspaceSnapshot>('/workspace');
        if (!isExplorerData(result.data))
          throw new Error('工作区数据格式不合法，原始文件已保留。');
        if (!result.initialized) {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw) {
            let old: unknown;
            try {
              old = JSON.parse(raw);
            } catch {
              throw new Error('旧浏览器数据无法读取，原有资料已保留。');
            }
            let data: ExplorerData | undefined;
            if (isExplorerData(old)) data = old;
            else if (isLegacyData(old)) data = migrateLegacyData(old);
            if (!data)
              throw new Error('旧浏览器数据格式不合法，原有资料已保留。');
            // Backup before migrating; never overwrite the original browser records.
            if (!localStorage.getItem(LEGACY_BACKUP_KEY))
              localStorage.setItem(LEGACY_BACKUP_KEY, raw);
            result = await localApi<WorkspaceSnapshot>(
              '/workspace',
              jsonOptions('PUT', { data, revision: result.revision }),
            );
            migrationNotice.value =
              '原浏览器资料已复制到本地工作区，原始浏览器资料仍保留。';
          }
        }
        apply(result.data);
        revision = result.revision;
        workspacePath.value = result.workspace;
        loaded.value = true;
      } catch (error) {
        storageError.value =
          error instanceof Error ? error.message : '本地工作区读取失败。';
        loadPromise = undefined;
      } finally {
        loading.value = false;
      }
    })();
    return loadPromise;
  }
  function mutate<T>(work: () => T): Promise<T> {
    const task = pending.then(async () => {
      if (!loaded.value)
        throw new Error('本地工作区尚未加载，请先连接本地服务。');
      const before = snapshot();
      saving.value = true;
      try {
        const value = work();
        const changed = snapshot();
        apply(before);
        const result = await localApi<WorkspaceSnapshot>(
          '/workspace',
          jsonOptions('PUT', { data: changed, revision }),
        );
        apply(result.data);
        revision = result.revision;
        storageError.value = '';
        return value;
      } catch (error) {
        apply(before);
        storageError.value =
          error instanceof Error ? error.message : '本地保存失败。';
        throw error;
      } finally {
        saving.value = false;
      }
    });
    pending = task.catch(() => {});
    return task;
  }

  function schoolsFor(universityId: string) {
    return schools.value.filter((item) => item.universityId === universityId);
  }
  function majorsFor(schoolId: string) {
    return majors.value.filter((item) => item.schoolId === schoolId);
  }
  function professorsFor(majorId: string) {
    return professors.value.filter((item) => item.majorId === majorId);
  }
  function labsFor(majorId: string) {
    return labs.value.filter((item) => item.majorId === majorId);
  }
  function professorsForLab(labId: string) {
    return professors.value.filter((item) => item.labId === labId);
  }
  function universityLabs(universityId: string) {
    const majorIds = new Set(
      universityMajors(universityId).map((item) => item.id),
    );
    return labs.value.filter((item) => majorIds.has(item.majorId));
  }
  function schoolLabs(schoolId: string) {
    const majorIds = new Set(majorsFor(schoolId).map((item) => item.id));
    return labs.value.filter((item) => majorIds.has(item.majorId));
  }
  function toggleWantApply(id: string) {
    return mutate(() => {
      const lab = labs.value.find((item) => item.id === id);
      if (!lab) throw new Error('研究室已不存在。');
      lab.wantApply = !lab.wantApply;
    });
  }
  function addJourneyLabs(ids: string[]) {
    return mutate(() => {
      const chosen = [...new Set(ids)].map((id) => {
        const lab = labs.value.find((item) => item.id === id);
        if (!lab) throw new Error('所选研究室已不存在，请重新选择。');
        return lab;
      });
      let count = 0;
      for (const lab of chosen) {
        if (lab.wantApply) continue;
        lab.wantApply = true;
        count++;
      }
      return count;
    });
  }
  function schoolProfessors(schoolId: string) {
    const majorIds = new Set(majorsFor(schoolId).map((item) => item.id));
    return professors.value.filter((item) => majorIds.has(item.majorId));
  }
  function universityMajors(universityId: string) {
    const schoolIds = new Set(schoolsFor(universityId).map((item) => item.id));
    return majors.value.filter((item) => schoolIds.has(item.schoolId));
  }
  function universityProfessors(universityId: string) {
    const majorIds = new Set(
      universityMajors(universityId).map((item) => item.id),
    );
    return professors.value.filter((item) => majorIds.has(item.majorId));
  }

  function saveEntity(
    kind: EntityKind,
    fields: EditorFields,
    parentId = '',
    id = '',
  ) {
    return mutate(() => {
      const entityId = id || crypto.randomUUID();
      const get = (key: string) => (fields[key] ?? '').trim();
      const common = {
        id: entityId,
        name: get('name'),
        japaneseName: get('japaneseName'),
        notes: get('notes'),
      };
      const website = get('website') ? (websiteUrl(get('website')) ?? '') : '';
      if (kind === 'university') {
        const locationError = geographyError(get('region'), get('prefecture'));
        if (locationError) throw new Error(locationError);
        const category = normalizeUniversityCategory(get('category'));
        const fees = universityFees({
          category,
          admissionFee: fields.admissionFee?.trim(),
          annualTuition: fields.annualTuition?.trim(),
        });
        if (
          !Object.values(fees).every(validYenAmount) ||
          !['monthlyRent', 'monthlyLivingExpenses'].every((field) =>
            validYenAmount(get(field)),
          )
        )
          throw new Error('费用请填写 0-999,999,999 之间的整数日元，或留空。');
        const value: University = {
          ...common,
          website,
          location: get('location'),
          category,
          region: get('region'),
          prefecture: get('prefecture'),
          qsRank: get('qsRank'),
          qsYear: get('qsYear'),
          ...fees,
          feeNotes: get('feeNotes'),
          monthlyRent: get('monthlyRent'),
          monthlyLivingExpenses: get('monthlyLivingExpenses'),
          dormitoryStatus: get('dormitoryStatus') || 'unknown',
          dormitoryNotes: get('dormitoryNotes'),
          dormitoryWebsite: get('dormitoryWebsite')
            ? (websiteUrl(get('dormitoryWebsite')) ?? '')
            : '',
          logoId: get('logoId'),
        };
        const index = universities.value.findIndex((item) => item.id === id);
        if (index === -1) universities.value.push(value);
        else universities.value[index] = value;
      } else if (kind === 'school') {
        const value: GraduateSchool = {
          ...common,
          website,
          universityId: parentId,
          research: get('research'),
        };
        const index = schools.value.findIndex((item) => item.id === id);
        if (index === -1) schools.value.push(value);
        else schools.value[index] = value;
      } else if (kind === 'major') {
        const previous = majors.value.find((item) => item.id === id);
        const value: Major = {
          ...common,
          website,
          schoolId: parentId,
          research: get('research'),
          examHistory: previous?.examHistory ?? [],
          applicationStart: previous?.applicationStart ?? '',
          applicationEnd: previous?.applicationEnd ?? '',
          applicationMaterials: previous?.applicationMaterials ?? '',
          languageRequirements: previous?.languageRequirements ?? '',
        };
        const index = majors.value.findIndex((item) => item.id === id);
        if (index === -1) majors.value.push(value);
        else majors.value[index] = value;
      } else if (kind === 'lab') {
        if (!majors.value.some((item) => item.id === parentId))
          throw new Error('所属专攻不存在。');
        const previous = labs.value.find((item) => item.id === id);
        const value: ResearchLab = {
          ...common,
          website,
          majorId: parentId,
          research: get('research'),
          examNotes: get('examNotes'),
          applicationNotes: get('applicationNotes'),
          languageRequirements:
            fields.languageRequirements === undefined
              ? (previous?.languageRequirements ?? '')
              : get('languageRequirements'),
          wantApply: previous?.wantApply ?? false,
          mainProfessorId: previous?.mainProfessorId ?? '',
          tasks: previous?.tasks ?? [],
          timeline: previous?.timeline ?? emptyTimeline(),
        };
        const index = labs.value.findIndex((item) => item.id === id);
        if (index === -1) labs.value.push(value);
        else labs.value[index] = value;
        for (const professor of professorsForLab(value.id))
          professor.laboratory = value.name;
      } else {
        const parent = labs.value.find((item) => item.id === parentId);
        const lab = labs.value.find(
          (item) => item.id === (get('labId') || parentId),
        );
        if (!lab || !parent || lab.majorId !== parent.majorId)
          throw new Error('请选择当前专攻下的研究室。');
        const previous = professors.value.find((item) => item.id === id);
        const value: Professor = {
          ...common,
          majorId: lab.majorId,
          labId: lab.id,
          title: get('title'),
          research: get('research'),
          laboratory: lab.name,
          email: get('email'),
          personalWebsite: get('personalWebsite')
            ? (websiteUrl(get('personalWebsite')) ?? '')
            : '',
          laboratoryWebsite: previous?.laboratoryWebsite ?? '',
          favorite: previous?.favorite ?? false,
          contact: normalizedContact(previous?.contact),
        };
        const index = professors.value.findIndex((item) => item.id === id);
        if (index === -1) professors.value.push(value);
        else professors.value[index] = value;
        for (const room of labs.value)
          if (room.mainProfessorId === value.id && room.id !== value.labId)
            room.mainProfessorId = '';
      }
      return entityId;
    });
  }

  function removeEntity(kind: EntityKind, id: string) {
    return mutate(() => {
      if (kind === 'professor') {
        professors.value = professors.value.filter((item) => item.id !== id);
        for (const lab of labs.value)
          if (lab.mainProfessorId === id) lab.mainProfessorId = '';
      } else if (kind === 'lab') {
        professors.value = professors.value.filter((item) => item.labId !== id);
        labs.value = labs.value.filter((item) => item.id !== id);
      } else if (kind === 'major') {
        labs.value = labs.value.filter((item) => item.majorId !== id);
        professors.value = professors.value.filter(
          (item) => item.majorId !== id,
        );
        majors.value = majors.value.filter((item) => item.id !== id);
      } else {
        const schoolIds = new Set(
          kind === 'university' ? schoolsFor(id).map((item) => item.id) : [id],
        );
        const majorIds = new Set(
          majors.value
            .filter((item) => schoolIds.has(item.schoolId))
            .map((item) => item.id),
        );
        professors.value = professors.value.filter(
          (item) => !majorIds.has(item.majorId),
        );
        labs.value = labs.value.filter((item) => !majorIds.has(item.majorId));
        majors.value = majors.value.filter((item) => !majorIds.has(item.id));
        schools.value = schools.value.filter((item) => !schoolIds.has(item.id));
        if (kind === 'university')
          universities.value = universities.value.filter(
            (item) => item.id !== id,
          );
      }
    });
  }
  function toggleFavorite(id: string) {
    return mutate(() => {
      const professor = professors.value.find((item) => item.id === id);
      if (professor) professor.favorite = !professor.favorite;
    }).catch(() => {});
  }
  function saveProfessorContact(
    professorId: string,
    contact: ProfessorContact,
    labId = '',
  ) {
    return mutate(() => {
      const person = professors.value.find((item) => item.id === professorId);
      if (!person) throw new Error('老师已不存在。');
      const lab = labId
        ? labs.value.find((item) => item.id === labId)
        : undefined;
      if (labId && (!lab || person.labId !== lab.id))
        throw new Error('请选择该研究室的老师。');
      const next = normalizedContact(contact);
      const error = planningError({
        professors: [{ ...person, contact: next }],
      });
      if (error) throw new Error(error);
      person.contact = next;
      if (lab) lab.mainProfessorId = person.id;
    });
  }
  function saveTimelineEvent(labId: string, entry: TimelineEntry) {
    return mutate(() => {
      const lab = labs.value.find((item) => item.id === labId);
      if (!lab) throw new Error('研究室已不存在。');
      const current = lab.timeline ?? emptyTimeline();
      const value = {
        ...entry,
        id: entry.id || crypto.randomUUID(),
        title: entry.title.trim(),
        notes: entry.notes.trim(),
      };
      const timeline = {
        events: [
          ...current.events.filter(
            (item) =>
              item.id !== value.id &&
              (!value.replaces || item.replaces !== value.replaces),
          ),
          value,
        ],
        hiddenSources: current.hiddenSources.filter(
          (source) => source !== value.replaces,
        ),
      };
      const error = timelineError(timeline);
      if (error) throw new Error(error);
      lab.timeline = timeline;
    });
  }
  function removeTimelineEvent(labId: string, entryId = '', source = '') {
    return mutate(() => {
      const lab = labs.value.find((item) => item.id === labId);
      if (!lab) throw new Error('研究室已不存在。');
      const current = lab.timeline ?? emptyTimeline();
      const previous = current.events.find((item) => item.id === entryId);
      const hiddenSource = previous?.replaces || source;
      const next = {
        events: current.events.filter((item) => item.id !== entryId),
        hiddenSources: [
          ...new Set([
            ...current.hiddenSources,
            ...(hiddenSource ? [hiddenSource] : []),
          ]),
        ],
      };
      const error = timelineError(next);
      if (error) throw new Error(error);
      lab.timeline = next;
    });
  }
  function restoreTimelineSources(labId: string) {
    return mutate(() => {
      const lab = labs.value.find((item) => item.id === labId);
      if (!lab) throw new Error('研究室已不存在。');
      lab.timeline = {
        ...(lab.timeline ?? emptyTimeline()),
        hiddenSources: [],
      };
    });
  }
  async function refresh() {
    await pending;
    const result = await localApi<WorkspaceSnapshot>('/workspace');
    if (!isExplorerData(result.data)) throw new Error('工作区数据格式错误。');
    apply(result.data);
    revision = result.revision;
  }
  function saveLabTasks(labId: string, tasks: ApplicationTask[]) {
    return mutate(() => {
      const lab = labs.value.find((item) => item.id === labId);
      if (!lab) throw new Error('研究室已不存在。');
      const next = tasks.map((item) => ({
        ...item,
        title: item.title.trim(),
        notes: item.notes.trim(),
      }));
      const error = planningError({
        labs: [{ ...lab, tasks: next }],
        professors: professors.value,
      });
      if (error) throw new Error(error);
      lab.tasks = next;
    });
  }
  function saveLabTask(labId: string, task: ApplicationTask) {
    return mutate(() => {
      const lab = labs.value.find((item) => item.id === labId);
      if (!lab) throw new Error('研究室已不存在。');
      const tasks = [...(lab.tasks ?? [])];
      const index = tasks.findIndex((item) => item.id === task.id);
      const value = {
        ...task,
        id: task.id || crypto.randomUUID(),
        title: task.title.trim(),
        notes: task.notes.trim(),
      };
      if (index < 0) tasks.push(value);
      else tasks[index] = value;
      const error = planningError({
        labs: [{ ...lab, tasks }],
        professors: professors.value,
      });
      if (error) throw new Error(error);
      lab.tasks = tasks;
    });
  }
  function removeLabTask(labId: string, id: string) {
    return mutate(() => {
      const lab = labs.value.find((item) => item.id === labId);
      if (!lab) throw new Error('研究室已不存在。');
      lab.tasks = (lab.tasks ?? []).filter((item) => item.id !== id);
    });
  }
  function saveExamRecord(
    majorId: string,
    fields: Omit<ExamHistoryRecord, 'id'>,
    id = '',
  ) {
    return mutate(() => {
      const major = majors.value.find((item) => item.id === majorId);
      if (!major) throw new Error('所属专攻已不存在，请返回上一级。');
      const record = { ...fields, id: id || crypto.randomUUID() };
      if (!validExamHistory([record]))
        throw new Error('请填写有效年度，并检查考试记录内容。');
      const index = major.examHistory.findIndex((item) => item.id === id);
      if (id && index === -1)
        throw new Error('该考试记录已不存在，请刷新后重试。');
      if (index === -1) major.examHistory.push(record);
      else major.examHistory[index] = record;
      return record.id;
    });
  }
  function removeExamRecord(majorId: string, id: string) {
    return mutate(() => {
      const major = majors.value.find((item) => item.id === majorId);
      if (!major) throw new Error('所属专攻已不存在。');
      major.examHistory = major.examHistory.filter((item) => item.id !== id);
    });
  }
  function saveMajorAdmission(majorId: string, fields: MajorAdmissionFields) {
    return mutate(() => {
      const major = majors.value.find((item) => item.id === majorId);
      if (!major) throw new Error('所属专攻已不存在。');
      const input = {
        applicationStart: fields.applicationStart.trim(),
        applicationEnd: fields.applicationEnd.trim(),
        applicationMaterials: fields.applicationMaterials.trim(),
        languageRequirements:
          fields.languageRequirements?.trim() ??
          major.languageRequirements ??
          '',
      };
      const error = admissionRangeError(input);
      if (error) throw new Error(error);
      Object.assign(major, input);
    });
  }
  function saveExamRecords(majorId: string, drafts: ExamHistoryRecord[]) {
    return mutate(() => {
      const major = majors.value.find((item) => item.id === majorId);
      if (!major) throw new Error('所属专攻已不存在。');
      const records = prepareExamBatch(drafts, major.examHistory).map(
        (record) => ({ ...record, id: crypto.randomUUID() }),
      );
      major.examHistory.push(...records);
      return records.length;
    });
  }
  return {
    universities,
    labs,
    labsFor,
    professorsForLab,
    universityLabs,
    schoolLabs,
    toggleWantApply,
    addJourneyLabs,
    saveProfessorContact,
    saveTimelineEvent,
    removeTimelineEvent,
    restoreTimelineSources,
    refresh,
    saveLabTasks,
    saveLabTask,
    removeLabTask,
    schools,
    majors,
    professors,
    storageError,
    loaded,
    loading,
    saving,
    workspacePath,
    migrationNotice,
    load,
    schoolsFor,
    majorsFor,
    professorsFor,
    schoolProfessors,
    universityMajors,
    universityProfessors,
    saveEntity,
    removeEntity,
    toggleFavorite,
    saveExamRecord,
    saveMajorAdmission,
    saveExamRecords,
    removeExamRecord,
  };
});
