import { ref, watch } from 'vue';

import { defineStore } from 'pinia';

export type EntityKind = 'major' | 'professor' | 'school' | 'university';

export interface University {
  id: string;
  name: string;
  japaneseName: string;
  location: string;
  category: string;
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

export interface Major {
  id: string;
  schoolId: string;
  name: string;
  japaneseName: string;
  research: string;
  website: string;
  notes: string;
}

export interface Professor {
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
    value.majors.every((item) =>
      hasStrings(item, [
        'id',
        'schoolId',
        'name',
        'japaneseName',
        'research',
        'website',
        'notes',
      ]),
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
    ]) &&
    value.majors.every((major) =>
      value.schools.some((item) => item.id === major.schoolId),
    ) &&
    value.professors.every((professor) =>
      value.majors.some((item) => item.id === professor.majorId),
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
  const storageError = ref('');
  let canSave = true;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      let data: ExplorerData;
      if (isExplorerData(parsed)) data = parsed;
      else if (isLegacyData(parsed)) data = migrateLegacyData(parsed);
      else throw new Error('Invalid explorer data');
      universities.value = data.universities;
      schools.value = data.schools;
      majors.value = data.majors;
      professors.value = data.professors;
      if (isLegacyData(parsed)) {
        // Preserve the original combined link and free-form title without guessing its meaning.
        try {
          if (!localStorage.getItem(LEGACY_BACKUP_KEY))
            localStorage.setItem(LEGACY_BACKUP_KEY, raw);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch {
          storageError.value =
            '旧资料已载入，本地升级保存失败。请保持此页面打开。';
        }
      }
    }
  } catch {
    canSave = false;
    storageError.value =
      '本地数据无法读取。原有数据已保留，本次填写暂时不会保存。';
  }

  watch(
    [universities, schools, majors, professors],
    () => {
      if (!canSave) return;
      try {
        const data: ExplorerData = {
          version: 2,
          universities: universities.value,
          schools: schools.value,
          majors: majors.value,
          professors: professors.value,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        storageError.value = '';
      } catch {
        storageError.value =
          '浏览器本地保存失败，请保持此页面打开，以免丢失本次填写。';
      }
    },
    { deep: true, flush: 'sync' },
  );

  function schoolsFor(universityId: string) {
    return schools.value.filter((item) => item.universityId === universityId);
  }
  function majorsFor(schoolId: string) {
    return majors.value.filter((item) => item.schoolId === schoolId);
  }
  function professorsFor(majorId: string) {
    return professors.value.filter((item) => item.majorId === majorId);
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
      const value: University = {
        ...common,
        website,
        location: get('location'),
        category: get('category'),
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
      const value: Major = {
        ...common,
        website,
        schoolId: parentId,
        research: get('research'),
      };
      const index = majors.value.findIndex((item) => item.id === id);
      if (index === -1) majors.value.push(value);
      else majors.value[index] = value;
    } else {
      const previous = professors.value.find((item) => item.id === id);
      const value: Professor = {
        ...common,
        majorId: parentId,
        title: get('title'),
        research: get('research'),
        laboratory: get('laboratory'),
        email: get('email'),
        personalWebsite: get('personalWebsite')
          ? (websiteUrl(get('personalWebsite')) ?? '')
          : '',
        laboratoryWebsite: get('laboratoryWebsite')
          ? (websiteUrl(get('laboratoryWebsite')) ?? '')
          : '',
        favorite: previous?.favorite ?? false,
      };
      const index = professors.value.findIndex((item) => item.id === id);
      if (index === -1) professors.value.push(value);
      else professors.value[index] = value;
    }
    return entityId;
  }

  function removeEntity(kind: EntityKind, id: string) {
    if (kind === 'professor')
      professors.value = professors.value.filter((item) => item.id !== id);
    else if (kind === 'major') {
      professors.value = professors.value.filter((item) => item.majorId !== id);
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
      majors.value = majors.value.filter((item) => !majorIds.has(item.id));
      schools.value = schools.value.filter((item) => !schoolIds.has(item.id));
      if (kind === 'university')
        universities.value = universities.value.filter(
          (item) => item.id !== id,
        );
    }
  }
  function toggleFavorite(id: string) {
    const professor = professors.value.find((item) => item.id === id);
    if (professor) professor.favorite = !professor.favorite;
  }
  return {
    universities,
    schools,
    majors,
    professors,
    storageError,
    schoolsFor,
    majorsFor,
    professorsFor,
    schoolProfessors,
    universityMajors,
    universityProfessors,
    saveEntity,
    removeEntity,
    toggleFavorite,
  };
});
