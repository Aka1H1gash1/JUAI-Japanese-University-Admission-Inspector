<script setup lang="ts">
import type {
  CollectedField,
  CollectionDetail,
  CollectionEvidence,
  CollectionKind,
  CollectionStatus,
} from '../collection-types';

import { computed, ref, watch } from 'vue';

import { App, Button, Checkbox, Input, Modal, Select } from 'ant-design-vue';

import {
  ADMISSION_STATUS_NAMES,
  ADMISSION_SUMMARY_NAMES,
  COLLECTION_KINDS,
  COLLECTION_NAMES,
} from '../collection-types';
import { useExplorerStore } from '../explorer';
import { jsonOptions, localApi } from '../local-api';
import { requireValue } from '../required-value';
import { vAccessibleSelect } from '../select-accessibility';
const props = defineProps<{
  detail: CollectionDetail;
  config: CollectionStatus;
}>();
const emit = defineEmits<{ applied: []; refresh: [] }>();
const store = useExplorerStore();
const { message } = App.useApp();
type Row = CollectedField & { selected: boolean; edited: string };
const targetKind = ref<'unknown' | CollectionKind>('unknown');
const activeKinds = computed(() => {
  const index = COLLECTION_KINDS.indexOf(targetKind.value as CollectionKind);
  return index === -1 ? [] : COLLECTION_KINDS.slice(0, index + 1);
});
const professorEnabled = computed(() =>
  activeKinds.value.includes('professor'),
);
const hasMajor = computed(() => activeKinds.value.includes('major'));
const hasLab = computed(() => activeKinds.value.includes('lab'));
const admissionRows = ref<Row[]>([]);
const logoFailed = ref(false);
const logoSelected = ref(false);
const uploadedLogoId = ref('');
const logoPreview = computed(
  () => `/api/japangrad/collection/jobs/${props.detail.job.id}/logo`,
);
const choices = ref<Record<CollectionKind, string>>({
  university: '',
  school: '',
  major: '',
  lab: '',
  professor: '',
});
const rows = ref<Record<CollectionKind, Row[]>>({
  university: [],
  school: [],
  major: [],
  lab: [],
  professor: [],
});
const acknowledged = ref(false);
const allowReplace = ref(false);
const busy = ref(false);
const confirmedScopes = ref<string[]>([]);
const errorMessage = ref('');
const generateOpen = ref(false);
const wantApply = ref(false);
const documents = ref<
  {
    sourceId: string;
    kind: string;
    title: string;
    year: string;
    selected: boolean;
  }[]
>([]);
const exams = ref<{ id: string; year: string; session: string; rows: Row[] }[]>(
  [],
);
const source = ref<{
  id: string;
  title: string;
  url: string;
  kind: string;
  page: { page: number; text: string; ocr?: boolean };
}>();
const sourceError = ref('');
const sourceLoading = ref(false);
const sourceOpen = ref(false);
const sourceQuote = ref('');
let sourceGeneration = 0;
const collection = (kind: CollectionKind): any[] => {
  if (kind === 'university') {
    return store.universities;
  }
  if (kind === 'school') {
    return store.schools;
  }
  if (kind === 'major') {
    return store.majors;
  }
  if (kind === 'lab') {
    return store.labs;
  }
  return store.professors;
};
const current = (kind: CollectionKind) =>
  collection(kind).find((e) => e.id === choices.value[kind]);
function options(kind: CollectionKind) {
  return collection(kind)
    .filter((e) => {
      if (kind === 'school') {
        return (
          !!choices.value.university &&
          e.universityId === choices.value.university
        );
      }
      if (kind === 'major') {
        return !!choices.value.school && e.schoolId === choices.value.school;
      }
      if (kind === 'lab') {
        return !!choices.value.major && e.majorId === choices.value.major;
      }
      if (kind === 'professor') {
        return !!choices.value.lab && e.labId === choices.value.lab;
      }
      return true;
    })
    .map((e) => ({ value: e.id, label: e.name }));
}
const label = (kind: CollectionKind, field: string) =>
  props.config.fieldDefinitions[kind].find(([id]) => id === field)?.[1] ||
  field;
const examLabel = (field: string) =>
  props.config.examFields.find(([id]) => id === field)?.[1] || field;
function resetRows(kind: CollectionKind) {
  const entity = current(kind);
  const fields = props.detail.job.draft?.[kind] || [];
  const list = fields.map((f) => ({
    ...f,
    edited: f.value,
    selected:
      !f.requiresScopeConfirmation &&
      (!entity?.[f.field] || entity[f.field] === f.value),
  }));
  if (!list.some((r) => r.field === 'name'))
    list.unshift({
      field: 'name',
      value: '',
      edited: entity?.name || '',
      evidence: [],
      scopeNote: '',
      requiresScopeConfirmation: false,
      selected: false,
    });
  rows.value[kind] = list;
}
function initialKind(): 'unknown' | CollectionKind {
  const draft = props.detail.job.draft;
  if (draft?.subject && draft.subject.source !== 'legacy')
    return draft.subject.kind === 'special_program'
      ? 'unknown'
      : draft.subject.kind;
  const normalize = (url: string) =>
    url.replace(/\/$/, '').replace(/\/index\.html?$/i, '');
  const primary = normalize(props.detail.job.urls[0] || '');
  for (const kind of [...COLLECTION_KINDS].toReversed()) {
    const key = kind === 'professor' ? 'personalWebsite' : 'website';
    if (
      draft?.[kind].some(
        (f) => f.field === key && normalize(f.value) === primary,
      )
    )
      return kind;
  }
  return 'unknown';
}
function reset() {
  sourceGeneration++;
  sourceOpen.value = false;
  errorMessage.value = '';
  generateOpen.value = false;
  confirmedScopes.value = [];
  acknowledged.value = allowReplace.value = wantApply.value = false;
  targetKind.value = initialKind();
  logoFailed.value = false;
  uploadedLogoId.value = '';
  for (const kind of COLLECTION_KINDS) {
    const available = options(kind);
    const target = props.detail.job.target?.ids[kind];
    const matches = props.detail.matches[kind].filter((id) =>
      available.some((o) => o.value === id),
    );
    choices.value[kind] = (() => {
      if (
        target &&
        available.some((o) => o.value === target) &&
        (props.detail.job.parent ||
          matches.includes(target) ||
          !(props.detail.job.draft?.[kind] || []).some(
            (f) => f.field === 'name',
          ))
      ) {
        return target;
      }
      if (matches.length === 1) {
        return requireValue(matches[0]);
      }
      return '';
    })();
    resetRows(kind);
  }
  logoSelected.value =
    !!props.detail.job.draft?.logo && !current('university')?.logoId;
  admissionRows.value = (props.detail.job.draft?.admissions?.fields || []).map(
    (f) => ({ ...f, edited: f.value, selected: !f.requiresScopeConfirmation }),
  );
  exams.value = (props.detail.job.draft?.exams || []).map((e) => ({
    ...e,
    rows: e.fields.map((f) => {
      const record = current('major')?.examHistory?.find(
        (r: any) => r.year === e.year && r.session === e.session,
      );
      return {
        ...f,
        edited: f.value,
        selected:
          hasMajor.value &&
          !f.requiresScopeConfirmation &&
          (!record?.[f.field] || record[f.field] === f.value),
      };
    }),
  }));
  documents.value = (props.detail.job.draft?.documents || []).map((d) => ({
    ...d,
    selected:
      hasMajor.value &&
      d.kind === 'guidelines' &&
      !!d.year &&
      props.detail.job.draft?.admissions?.status !== 'uncertain',
  }));
}
watch(
  [() => props.detail.job.id, () => JSON.stringify(props.detail.job.draft)],
  reset,
  { immediate: true },
);
watch(
  () => props.detail.revision,
  () => {
    acknowledged.value = false;
    allowReplace.value = false;
    confirmedScopes.value = [];
  },
);
watch(professorEnabled, (enabled) => {
  if (!enabled)
    for (const doc of documents.value)
      if (doc.kind === 'paper') doc.selected = false;
  acknowledged.value = false;
});
function choose(kind: CollectionKind) {
  acknowledged.value = false;
  resetRows(kind);
  if (kind === 'university')
    logoSelected.value =
      !!props.detail.job.draft?.logo &&
      !current(kind)?.logoId &&
      !logoFailed.value;
  const i = COLLECTION_KINDS.indexOf(kind);
  for (const child of COLLECTION_KINDS.slice(i + 1)) {
    if (!options(child).some((o) => o.value === choices.value[child]))
      choices.value[child] = '';
    resetRows(child);
  }
  confirmedScopes.value = [];
}
function changeTarget() {
  acknowledged.value = false;
  confirmedScopes.value = [];
  wantApply.value = false;
  for (const exam of exams.value)
    for (const row of exam.rows)
      row.selected = hasMajor.value && !row.requiresScopeConfirmation;
  for (const doc of documents.value)
    doc.selected =
      hasMajor.value &&
      doc.kind === 'guidelines' &&
      !!doc.year &&
      props.detail.job.draft?.admissions?.status !== 'uncertain';
}
function edit(row: Row) {
  row.selected = !!row.edited.trim();
  acknowledged.value = false;
  confirmedScopes.value = [];
}
const replacing = computed(
  () =>
    !!(logoSelected.value && current('university')?.logoId) ||
    activeKinds.value.some(
      (kind) =>
        (kind !== 'professor' || professorEnabled.value) &&
        rows.value[kind].some(
          (r) =>
            r.selected &&
            current(kind)?.[r.field] &&
            current(kind)[r.field] !== r.edited.trim(),
        ),
    ) ||
    (hasMajor.value &&
      exams.value.some((e) => {
        const existing = current('major')?.examHistory?.find(
          (r: any) => r.year === e.year && r.session === e.session,
        );
        return e.rows.some(
          (r) =>
            r.selected &&
            existing?.[r.field] &&
            existing[r.field] !== r.edited.trim(),
        );
      })),
);
const neededScopes = computed(() => [
  ...activeKinds.value.flatMap((kind) =>
    kind !== 'professor' || professorEnabled.value
      ? rows.value[kind]
          .filter((r) => r.selected && r.requiresScopeConfirmation)
          .map((r) => `${kind}.${r.field}`)
      : [],
  ),
  ...(hasMajor.value
    ? exams.value.flatMap((e) =>
        e.rows
          .filter((r) => r.selected && r.requiresScopeConfirmation)
          .map((r) => `${e.id}.${r.field}`),
      )
    : []),
  ...admissionRows.value
    .filter((r) => r.selected && r.requiresScopeConfirmation)
    .map((r) => `admissions.${r.field}`),
]);
const generationPlan = computed(() =>
  activeKinds.value.map((kind) => {
    const selected = rows.value[kind].filter(
      (r) => r.selected && r.edited.trim(),
    );
    return {
      kind,
      enabled: kind !== 'professor' || professorEnabled.value,
      name:
        selected.find((r) => r.field === 'name')?.edited.trim() ||
        current(kind)?.name ||
        '',
      action: choices.value[kind] ? '更新已有' : '自动新建',
      count: selected.length,
    };
  }),
);
const selectedExamCount = computed(() =>
  hasMajor.value
    ? exams.value.filter((e) => e.rows.some((r) => r.selected)).length
    : 0,
);
const selectedDocumentCount = computed(
  () => documents.value.filter((d) => d.selected).length,
);
const generationIssues = computed(() => {
  const issues = generationPlan.value
    .filter((p) => p.enabled && !p.name)
    .map((p) => `请补充${COLLECTION_NAMES[p.kind]}名称，或选择已有档案。`);
  if (activeKinds.value.length === 0)
    issues.unshift('请先确认主链接对应的对象类型。');
  const remaining = neededScopes.value.filter(
    (key) => !confirmedScopes.value.includes(key),
  ).length;
  if (remaining) issues.push(`有 ${remaining} 个所选时间需要确认适用对象。`);
  if (
    hasMajor.value &&
    exams.value.some(
      (e) =>
        e.rows.some((r) => r.selected) &&
        (!/^\d{4}$/.test(e.year) ||
          Number(e.year) < 1900 ||
          Number(e.year) > 2200),
    )
  )
    issues.push('请确认所选考试的实际年份。');
  if (
    documents.value.some(
      (d) =>
        d.selected &&
        (!/^\d{4}$/.test(d.year) ||
          Number(d.year) < 1900 ||
          Number(d.year) > 2200),
    )
  )
    issues.push('请确认所选附件的归档年份。');
  return issues;
});
const canApply = computed(
  () =>
    !busy.value &&
    acknowledged.value &&
    (!replacing.value || allowReplace.value) &&
    generationIssues.value.length === 0,
);
function openGeneration() {
  acknowledged.value = false;
  errorMessage.value = '';
  generateOpen.value = true;
}
function toggleScope(key: string) {
  confirmedScopes.value = confirmedScopes.value.includes(key)
    ? confirmedScopes.value.filter((k) => k !== key)
    : [...confirmedScopes.value, key];
  acknowledged.value = false;
}
async function showSource(e: CollectionEvidence) {
  sourceQuote.value = e.quote;
  const version = ++sourceGeneration;
  sourceOpen.value = true;
  sourceLoading.value = true;
  sourceError.value = '';
  source.value = undefined;
  try {
    const value = await localApi<NonNullable<typeof source.value>>(
      `/collection/jobs/${props.detail.job.id}/sources/${e.sourceId}?page=${e.page}`,
    );
    if (version === sourceGeneration) source.value = value;
  } catch (error) {
    if (version === sourceGeneration)
      sourceError.value =
        error instanceof Error ? error.message : '来源读取失败。';
  } finally {
    if (version === sourceGeneration) sourceLoading.value = false;
  }
}
async function apply() {
  if (!canApply.value) return;
  busy.value = true;
  errorMessage.value = '';
  try {
    if (logoSelected.value && !uploadedLogoId.value) {
      const response = await fetch(logoPreview.value);
      if (!response.ok)
        throw new Error(
          '官网校徽暂未能读取，请取消校徽选择后保存其他信息，或稍后重试。',
        );
      let blob = await response.blob();
      if (blob.type.includes('svg')) {
        const doc = new DOMParser().parseFromString(
          await blob.text(),
          'image/svg+xml',
        );
        const svg = doc.documentElement;
        if (doc.querySelector('parsererror') || svg.localName !== 'svg')
          throw new Error('校徽 SVG 暂不能读取，可取消选择并手动上传图片。');
        const box = (svg.getAttribute('viewBox') || '')
          .split(/[ ,]+/)
          .map(Number);
        const width =
          Number.parseFloat(svg.getAttribute('width') || '') || box[2] || 512;
        const height =
          Number.parseFloat(svg.getAttribute('height') || '') || box[3] || 512;
        const scale = Math.min(1, 1024 / Math.max(width, height));
        svg.setAttribute(
          'width',
          String(Math.max(1, Math.round(width * scale))),
        );
        svg.setAttribute(
          'height',
          String(Math.max(1, Math.round(height * scale))),
        );
        blob = new Blob([new XMLSerializer().serializeToString(svg)], {
          type: 'image/svg+xml',
        });
      }
      const objectUrl = URL.createObjectURL(blob);
      let png: Blob;
      try {
        const image = new Image();
        await new Promise<void>((resolve, reject) => {
          image.addEventListener('load', () => resolve(), { once: true });
          image.addEventListener(
            'error',
            () =>
              reject(new Error('校徽暂不能转换，请取消选择后保存其他信息。')),
            { once: true },
          );
          image.src = objectUrl;
        });
        const scale = Math.min(
          1,
          512 / Math.max(image.naturalWidth, image.naturalHeight),
        );
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('当前浏览器无法保存校徽。');
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        png = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (value) =>
              value ? resolve(value) : reject(new Error('校徽转换失败。')),
            'image/png',
          ),
        );
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
      const uploaded = await localApi<{ id: string }>('/university-logos', {
        method: 'POST',
        headers: { 'Content-Type': 'image/png' },
        body: png,
      });
      uploadedLogoId.value = uploaded.id;
    }
    const entities = Object.fromEntries(
      activeKinds.value.map((kind) => [
        kind,
        {
          id: choices.value[kind] || undefined,
          fields: Object.fromEntries(
            rows.value[kind]
              .filter((r) => r.selected && r.edited.trim())
              .map((r) => [r.field, r.edited.trim()]),
          ),
        },
      ]),
    );
    await localApi(
      `/collection/jobs/${props.detail.job.id}/apply`,
      jsonOptions('POST', {
        confirm: true,
        revision: props.detail.revision,
        targetKind: targetKind.value,
        logoId: logoSelected.value ? uploadedLogoId.value : undefined,
        entities,
        confirmedScopes: confirmedScopes.value,
        allowReplace: allowReplace.value,
        wantApply: hasLab.value && wantApply.value,
        admissions: Object.fromEntries(
          admissionRows.value
            .filter((r) => r.selected && r.edited.trim())
            .map((r) => [r.field, r.edited.trim()]),
        ),
        exams: (hasMajor.value ? exams.value : [])
          .filter((e) => e.rows.some((r) => r.selected))
          .map((e) => ({
            id: e.id,
            year: e.year,
            session: e.session,
            fields: Object.fromEntries(
              e.rows
                .filter((r) => r.selected)
                .map((r) => [r.field, r.edited.trim()]),
            ),
          })),
        documents: documents.value
          .filter((d) => d.selected)
          .map((d) => ({ sourceId: d.sourceId, kind: d.kind, year: d.year })),
      }),
    );
    // The write has completed even if refreshing local navigation fails.
    generateOpen.value = false;
    try {
      await store.refresh();
    } catch {
      message.info('档案已保存，刷新页面即可查看最新资料。');
    }
    message.success('所选档案已自动填好，并建立所属关系。');
    emit('applied');
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '入库失败，草稿仍保留。';
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <section class="collection-review">
    <header class="collection-section-heading">
      <div>
        <h2>资料已填好，生成你的学校档案</h2>
        <p>按主链接对象建立本层档案，并补齐真实上级；已有上级可直接关联。</p>
      </div>
      <Button :disabled="busy" @click="emit('refresh')">刷新已有资料</Button>
    </header>
    <section class="collection-generation-preview" aria-label="将生成的档案">
      <div class="collection-generation-heading">
        <div>
          <span>READY TO CREATE / 自动建档</span>
          <h3>一份资料，填入完整档案。</h3>
        </div>
        <Button type="primary" :disabled="busy" @click="openGeneration">
          确认并生成档案
        </Button>
      </div>
      <label class="collection-target-kind">主链接对应<Select
          v-accessible-select
          v-model:value="targetKind"
          :disabled="busy"
          :options="[
            { value: 'unknown', label: '请确认对象类型' },
            ...COLLECTION_KINDS.map((kind) => ({
              value: kind,
              label: COLLECTION_NAMES[kind],
            })),
          ]"
          @change="changeTarget"
      /></label>
      <p v-if="detail.job.draft?.subject?.reason">
        {{ detail.job.draft.subject.reason }}
      </p>
      <div class="collection-generation-chain">
        <a
          v-for="item in generationPlan"
          :key="item.kind"
          :href="`#collection-entity-${item.kind}`"
          :class="{ skipped: !item.enabled }"
        >
          <small>{{ COLLECTION_NAMES[item.kind] }} ·
            {{ item.enabled ? item.action : '暂不生成' }}</small>
          <strong>{{
            item.enabled ? item.name || '补充名称' : '未选择老师'
          }}</strong>
          <span>{{
            item.enabled ? `已预填 ${item.count} 项` : '可在下方启用'
          }}</span>
        </a>
      </div>
      <p>
        {{
          hasMajor
            ? '所选考试记录写入对应专攻，募集要项可归档到专攻资料库。'
            : '本次只创建所选层级及其上级；募集要项原件保留在本任务来源中。'
        }}
        募集要项摘要会显示在主链接对应的档案页。
      </p>
    </section>
    <ul v-if="detail.job.draft?.warnings.length" class="collection-warnings">
      <li v-for="(warning, i) in detail.job.draft.warnings" :key="i">
        {{ warning }}
      </li>
    </ul>
    <section
      v-if="detail.job.draft?.logo"
      class="collection-entity collection-logo-candidate"
    >
      <div class="collection-logo-preview">
        <img
          v-if="!logoFailed"
          :src="logoPreview"
          alt="官网提取的大学校徽候选"
          @error="
            logoFailed = true;
            logoSelected = false;
          "
        /><span v-else>图片暂未取得</span>
      </div>
      <div>
        <h3>官网校徽候选</h3>
        <p class="collection-help">
          {{
            detail.job.draft.logo.reason ||
            detail.job.draft.logo.alt ||
            '请确认这是对应大学的校徽或官方校标。'
          }}
        </p>
        <Checkbox
          v-model:checked="logoSelected"
          :disabled="busy || logoFailed"
          @change="acknowledged = false"
        >
          将此校徽保存到大学档案
        </Checkbox>
        <p v-if="current('university')?.logoId" class="collection-help">
          已有校徽，替换时需确认。
        </p>
        <a
          :href="detail.job.draft.logo.url"
          target="_blank"
          rel="noopener noreferrer"
          >查看官网原图 ↗</a>
      </div>
    </section>
    <section
      v-if="
        detail.job.draft?.admissions &&
        detail.job.draft.admissions.status !== 'not_requested'
      "
      class="collection-entity collection-admissions-review"
    >
      <header>
        <h3>对应募集要项 · 摘要</h3>
        <small>{{
          ADMISSION_STATUS_NAMES[detail.job.draft.admissions.status]
        }}</small>
      </header>
      <p class="collection-help">
        {{
          detail.job.draft.admissions.scope ||
          '适用研究科、专攻、年度及选拔类别待核对。'
        }}
      </p>
      <p
        v-if="detail.job.draft.admissions.status !== 'found'"
        class="collection-scope"
      >
        {{
          detail.job.draft.admissions.status === 'not_found'
            ? '募集要项内容尚未取得，请补充官方招生链接后继续收集；已有基本信息仍可单独建档。'
            : '资料的归属或适用范围尚不明确，请先查看原文；不同选拔类别的时间请分别核对。'
        }}
      </p>
      <div
        v-for="row in admissionRows"
        :key="row.field"
        class="collection-field"
      >
        <Checkbox
          v-model:checked="row.selected"
          :disabled="busy || !row.edited.trim()"
          @change="acknowledged = false"
        >
          {{ ADMISSION_SUMMARY_NAMES[row.field] || row.field }}
        </Checkbox>
        <div>
          <Input.TextArea
            v-model:value="row.edited"
            :rows="3"
            :maxlength="
              config.admissionSummaryFields?.find(
                ([id]) => id === row.field,
              )?.[2] || 6000
            "
            :disabled="busy"
            :aria-label="`募集要项${ADMISSION_SUMMARY_NAMES[row.field] || row.field}`"
            @change="edit(row)"
          />
          <div class="collection-citations">
            <button
              v-for="(e, i) in row.evidence"
              :key="i"
              @click="showSource(e)"
            >
              {{ e.title }} · 第 {{ e.page }} 页{{
                e.verification === 'visual_review' ? ' · 需看图核对' : ''
              }}
            </button>
          </div>
          <div v-if="row.requiresScopeConfirmation" class="collection-scope">
            <p>
              {{
                row.scopeNote || '请核对时间的研究科、专攻、年度与选拔类别。'
              }}
            </p>
            <Checkbox
              :checked="confirmedScopes.includes(`admissions.${row.field}`)"
              :disabled="busy"
              @change="toggleScope(`admissions.${row.field}`)"
            >
              已核对本项时间的适用对象
            </Checkbox>
          </div>
          <p v-else-if="row.scopeNote" class="collection-help">
            {{ row.scopeNote }}
          </p>
        </div>
      </div>
    </section>
    <article
      v-for="kind in activeKinds"
      :key="kind"
      :id="`collection-entity-${kind}`"
      class="collection-entity"
    >
      <header>
        <h3>{{ COLLECTION_NAMES[kind] }}</h3>
        <Select
          v-if="kind !== 'professor' || professorEnabled"
          v-accessible-select
          v-model:value="choices[kind]"
          :disabled="busy"
          :options="[
            { value: '', label: `新建${COLLECTION_NAMES[kind]}档案` },
            ...options(kind),
          ]"
          :aria-label="`${COLLECTION_NAMES[kind]}入库位置`"
          @change="choose(kind)"
        />
      </header>
      <template v-if="kind !== 'professor' || professorEnabled">
        <div
          v-for="row in rows[kind]"
          :key="row.field"
          class="collection-field"
        >
          <div class="collection-field-label">
            <Checkbox
              v-model:checked="row.selected"
              :disabled="busy || !row.edited.trim()"
              @change="acknowledged = false"
            >
              {{ label(kind, row.field) }}
</Checkbox><small v-if="current(kind)?.[row.field]">当前：{{ current(kind)[row.field] }}</small><small v-else-if="row.field === 'name' && !row.value">未明确找到名称，请补充真实名称或选择已有档案。</small>
          </div>
          <div>
            <Select
              v-if="row.field === 'dormitoryStatus'"
              v-accessible-select
              v-model:value="row.edited"
              :disabled="busy"
              :options="[
                { value: 'available', label: '可申请寮' },
                { value: 'unavailable', label: '不可申请寮' },
                { value: 'unknown', label: '尚未明确' },
              ]"
              aria-label="寮申请状态"
              @change="edit(row)"
            />
            <Input.TextArea
              v-else
              v-model:value="row.edited"
              :rows="
                [
                  'name',
                  'japaneseName',
                  'email',
                  'website',
                  'personalWebsite',
                  'laboratoryWebsite',
                ].includes(row.field)
                  ? 1
                  : 2
              "
              :maxlength="
                config.fieldDefinitions[kind].find(
                  ([id]) => id === row.field,
                )?.[2]
              "
              :disabled="busy"
              :aria-label="`${COLLECTION_NAMES[kind]}${label(kind, row.field)}`"
              @change="edit(row)"
            />
            <div class="collection-citations">
              <button
                v-for="(e, i) in row.evidence"
                :key="i"
                @click="showSource(e)"
              >
                {{ e.title }} · {{ e.page }} 页{{
                  e.verification === 'visual_review' ? ' · 需看图核对' : ''
                }}
              </button>
            </div>
            <div v-if="row.requiresScopeConfirmation" class="collection-scope">
              <p>
                {{
                  row.scopeNote ||
                  '请查看原文，确认该时间的年度、研究科、专攻与选拔类别。'
                }}
              </p>
              <Checkbox
                :checked="confirmedScopes.includes(`${kind}.${row.field}`)"
                :disabled="busy"
                @change="toggleScope(`${kind}.${row.field}`)"
              >
                此时间适用于我的报考对象
              </Checkbox>
            </div>
          </div>
        </div>
      </template>
      <p v-else class="collection-help">
        没有明确的目标老师时，可先建立研究室档案。
      </p>
    </article>
    <section v-if="exams.length && hasMajor" class="collection-entity">
      <header>
        <h3>考试信息</h3>
        <small>按实际考试年份与批次写入专攻；同年份同批次会核对已有记录。</small>
      </header>
      <article v-for="exam in exams" :key="exam.id">
        <div class="collection-exam-meta">
          <label>实际考试年份<Input
              v-model:value="exam.year"
              :maxlength="4"
              :disabled="busy"
              @change="
                acknowledged = false;
                confirmedScopes = [];
              "
/></label><label>考试批次<Input
              v-model:value="exam.session"
              :maxlength="120"
              :disabled="busy"
              placeholder="按原文填写"
              @change="
                acknowledged = false;
                confirmedScopes = [];
              "
          /></label>
        </div>
        <div v-for="row in exam.rows" :key="row.field" class="collection-field">
          <Checkbox
            v-model:checked="row.selected"
            :disabled="busy || !row.edited.trim()"
            @change="acknowledged = false"
          >
            {{ examLabel(row.field) }}
          </Checkbox>
          <div>
            <Input.TextArea
              v-model:value="row.edited"
              :rows="2"
              :disabled="busy"
              :aria-label="`${exam.year}${examLabel(row.field)}`"
              @change="edit(row)"
            />
            <div class="collection-citations">
              <button
                v-for="(e, i) in row.evidence"
                :key="i"
                @click="showSource(e)"
              >
                {{ e.title }} · 第 {{ e.page }} 页
              </button>
            </div>
            <div v-if="row.requiresScopeConfirmation" class="collection-scope">
              <p>{{ row.scopeNote || '请确认此考试时间的适用对象。' }}</p>
              <Checkbox
                :checked="confirmedScopes.includes(`${exam.id}.${row.field}`)"
                :disabled="busy"
                @change="toggleScope(`${exam.id}.${row.field}`)"
              >
                已核对研究科、专攻及选拔类别
              </Checkbox>
            </div>
          </div>
        </div>
      </article>
    </section>
    <section v-if="documents.length" class="collection-entity">
      <header><h3>下载资料归档</h3></header>
      <div
        v-for="doc in documents"
        :key="`${doc.kind}-${doc.sourceId}`"
        class="collection-document"
      >
        <Checkbox
          v-model:checked="doc.selected"
          :disabled="
            busy || (doc.kind === 'paper' ? !professorEnabled : !hasMajor)
          "
        >
          {{ doc.title
          }}<small>{{
            doc.kind === 'paper' ? '归档到老师论文库' : '归档到专攻募集要项库'
          }}</small>
</Checkbox><label>归档年份<Input
            v-model:value="doc.year"
            :maxlength="4"
            placeholder="请核对年份"
            :disabled="busy || !doc.selected"
        /></label>
      </div>
    </section>
    <footer class="collection-apply">
      <p v-if="errorMessage" class="form-error" role="alert">
        {{ errorMessage }}
      </p>
      <Checkbox v-if="hasLab" v-model:checked="wantApply" :disabled="busy">
        将研究室加入想考清单
</Checkbox><small v-if="neededScopes.some((key) => !confirmedScopes.includes(key))">所选时间还有适用对象待确认，请查看字段下方提示。</small><Button
        type="primary"
        :loading="busy"
        :disabled="busy"
        @click="openGeneration"
      >
        确认并生成档案
      </Button>
    </footer>
    <Modal
      v-model:open="generateOpen"
      title="确认并生成档案"
      :width="720"
      :footer="null"
      :closable="!busy"
      :mask-closable="!busy"
      :keyboard="!busy"
    >
      <p class="collection-generation-intro">
        所选信息会自动填入以下档案，并建立所属关系。
      </p>
      <ul class="collection-generation-list">
        <li
          v-for="item in generationPlan.filter((p) => p.enabled)"
          :key="item.kind"
        >
          <span>{{ COLLECTION_NAMES[item.kind] }}</span><strong>{{ item.name || '请补充名称' }}</strong><small>{{ item.action }} · {{ item.count }} 项</small>
        </li>
      </ul>
      <p class="collection-generation-intro">
        同时写入 {{ selectedExamCount }} 条考试记录，归档
        {{ selectedDocumentCount }} 份资料{{
          wantApply ? '，并将研究室加入想考清单' : ''
        }}。
      </p>
      <ul v-if="generationIssues.length" class="collection-generation-issues">
        <li v-for="issue in generationIssues" :key="issue">{{ issue }}</li>
      </ul>
      <div class="collection-generation-confirm">
        <p v-if="errorMessage" class="form-error" role="alert">
          {{ errorMessage }}
        </p>
        <Checkbox
          v-if="replacing"
          v-model:checked="allowReplace"
          :disabled="busy"
        >
          确认替换所选字段已有的内容
        </Checkbox>
        <Checkbox v-model:checked="acknowledged" :disabled="busy">
          已核对名称、所属关系与所选资料，确认生成
        </Checkbox>
        <div>
          <Button :disabled="busy" @click="generateOpen = false">
            返回修改
</Button><Button
            type="primary"
            :loading="busy"
            :disabled="!canApply"
            @click="apply"
          >
            生成档案
          </Button>
        </div>
      </div>
    </Modal>
    <Modal
      v-model:open="sourceOpen"
      title="原文依据"
      :width="1000"
      :footer="null"
    >
      <p v-if="sourceLoading">正在读取保存的来源…</p>
      <p v-if="sourceError" class="form-error">{{ sourceError }}</p>
      <template v-if="source">
        <h3>{{ source.title }}</h3>
        <blockquote class="collection-source-quote">
          {{ sourceQuote }}
        </blockquote>
        <a :href="source.url" target="_blank" rel="noopener noreferrer">打开官网来源 ↗</a>
        <p v-if="source.page.ocr" class="collection-help">
          这段文字来自 OCR，请对照 PDF 原页核对。
        </p>
        <iframe
          v-if="source.kind === 'pdf'"
          :title="source.title"
          :src="`/api/japangrad/collection/jobs/${detail.job.id}/sources/${source.id}/file#page=${source.page.page}`"
          class="collection-pdf"
        ></iframe>
        <pre class="collection-source-text">{{
          source.page.text.slice(0, 50000) || '此页没有可读取文字。'
        }}</pre>
      </template>
    </Modal>
  </section>
</template>
<style scoped>
.collection-logo-candidate {
  display: flex;
  gap: 22px;
  align-items: center;
}

.collection-logo-preview {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 100px;
  height: 100px;
  padding: 12px;
  font-size: 11px;
  color: #59667d;
  background: white;
  border: 1px solid var(--jg-line);
  border-radius: 10px;
}

.collection-logo-preview img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.collection-logo-candidate a {
  display: inline-block;
  margin-top: 12px;
  font-size: 11px;
  color: var(--jg-accent-text);
}

.collection-target-kind {
  display: flex;
  gap: 12px;
  align-items: center;
  margin: 20px 0 10px;
  font-size: 12px;
  color: var(--jg-muted);
}

.collection-target-kind .ant-select {
  min-width: 180px;
}

.collection-admissions-review {
  border-top: 3px solid var(--jg-accent);
}

.collection-generation-preview {
  padding: 24px;
  margin: 22px 0;
  background: var(--jg-accent-soft);
  border: 1px solid var(--jg-accent-line);
  border-radius: 14px;
}

.collection-generation-heading {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
}

.collection-generation-heading span {
  font-size: 10px;
  color: var(--jg-accent-text);
  letter-spacing: 0.12em;
}

.collection-generation-heading h3 {
  margin: 8px 0 0;
  font-size: 22px;
  letter-spacing: -0.035em;
}

.collection-generation-chain {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(155px, 1fr));
  gap: 10px;
  margin: 22px 0 16px;
}

.collection-generation-chain a {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 14px;
  color: var(--jg-text);
  overflow-wrap: anywhere;
  background: var(--jg-surface);
  border: 1px solid var(--jg-accent-line);
  border-radius: 8px;
}

.collection-generation-chain a:hover,
.collection-generation-chain a:focus-visible {
  border-color: var(--jg-accent);
}

.collection-generation-chain small,
.collection-generation-chain span,
.collection-generation-preview > p,
.collection-generation-intro {
  font-size: 12px;
  line-height: 1.8;
  color: var(--jg-muted);
}

.collection-generation-chain strong {
  flex: 1;
  font-size: 15px;
  line-height: 1.6;
}

.collection-generation-chain .skipped {
  opacity: 0.65;
}

.collection-generation-preview > p {
  margin: 0;
}

.collection-generation-list {
  padding: 0;
  margin: 18px 0;
  list-style: none;
}

.collection-generation-list li {
  display: grid;
  grid-template-columns: 65px minmax(0, 1fr) 105px;
  gap: 14px;
  align-items: start;
  padding: 14px 0;
  font-size: 13px;
  overflow-wrap: anywhere;
  border-bottom: 1px solid var(--jg-line);
}

.collection-generation-list li > span,
.collection-generation-list small {
  font-size: 12px;
  color: var(--jg-muted);
}

.collection-generation-list small {
  text-align: right;
}

.collection-generation-issues {
  font-size: 12px;
  line-height: 1.8;
  color: var(--jg-warning);
}

.collection-generation-confirm {
  display: grid;
  gap: 14px;
  margin-top: 22px;
}

.collection-generation-confirm > div {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.collection-exam-meta {
  display: flex;
  gap: 14px;
  margin: 16px 0;
}

.collection-exam-meta label {
  display: grid;
  gap: 6px;
  min-width: 0;
  font-size: 12px;
  color: var(--jg-muted);
}

.collection-exam-meta label:first-child {
  max-width: 140px;
}

.collection-source-quote {
  padding: 12px 16px;
  margin: 12px 0;
  font-size: 13px;
  line-height: 1.8;
  color: var(--jg-text);
  white-space: pre-wrap;
  background: var(--jg-accent-soft);
  border-left: 3px solid var(--jg-accent);
}

.collection-entity {
  padding: 20px;
  margin: 16px 0;
  scroll-margin-top: 90px;
  background: var(--jg-surface);
  border: 1px solid var(--jg-line);
  border-radius: 12px;
}

.collection-entity > header {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  align-items: center;
  margin-bottom: 18px;
}

.collection-entity h3 {
  margin: 0;
  font-size: 17px;
}

.collection-entity > header > .ant-select {
  min-width: 200px;
  margin-left: auto;
}

.collection-entity small {
  font-size: 11px;
  color: var(--jg-muted);
}

.collection-field {
  display: grid;
  grid-template-columns: minmax(110px, 190px) minmax(0, 1fr);
  gap: 16px;
  padding: 14px 0;
  border-top: 1px solid var(--jg-line);
}

.collection-field-label small {
  display: block;
  max-height: 100px;
  margin: 7px 0 0;
  overflow: auto;
  line-height: 1.6;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.collection-citations {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 7px;
}

.collection-citations button {
  padding: 0;
  font-size: 11px;
  color: var(--jg-accent-text);
  text-align: left;
  text-decoration: underline;
  cursor: pointer;
  background: none;
  border: 0;
}

.collection-scope {
  padding: 8px 12px;
  margin-top: 10px;
  font-size: 12px;
  color: var(--jg-warning);
  background: var(--jg-subtle);
  border-left: 3px solid var(--jg-warning);
}

.collection-scope p {
  margin: 0 0 8px;
  white-space: pre-wrap;
}

.collection-document {
  display: flex;
  gap: 18px;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-top: 1px solid var(--jg-line);
}

.collection-document small {
  display: block;
  margin-top: 5px;
}

.collection-document label {
  display: grid;
  flex: 0 0 100px;
  gap: 5px;
  font-size: 11px;
  color: var(--jg-muted);
}

.collection-apply {
  display: grid;
  gap: 14px;
  padding: 20px;
  background: var(--jg-accent-soft);
  border: 1px solid var(--jg-accent-line);
  border-radius: 12px;
}

.collection-apply > .ant-btn {
  justify-self: end;
}

.collection-apply > small {
  color: var(--jg-warning);
}

.collection-source-text {
  max-height: 550px;
  padding: 16px;
  overflow: auto;
  font-size: 13px;
  line-height: 1.8;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  background: var(--jg-subtle);
  border-radius: 8px;
}

.collection-pdf {
  display: block;
  width: 100%;
  height: 480px;
  margin: 14px 0;
  border: 1px solid var(--jg-line);
}

.collection-warnings {
  padding: 14px 28px;
  font-size: 12px;
  line-height: 1.8;
  color: var(--jg-muted);
  background: var(--jg-subtle);
  border-radius: 8px;
}

.collection-help {
  font-size: 12px;
  color: var(--jg-muted);
}

.collection-section-heading {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  margin-top: 28px;
}

.collection-section-heading h2 {
  margin: 0 0 6px;
  font-size: 22px;
}

.collection-section-heading p {
  margin: 0;
  font-size: 12px;
  color: var(--jg-muted);
}

@media (max-width: 700px) {
  .collection-generation-chain {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .collection-generation-preview {
    padding: 18px;
  }

  .collection-generation-list li {
    grid-template-columns: 55px minmax(0, 1fr);
  }

  .collection-generation-list small {
    grid-column: 2;
    text-align: left;
  }

  .collection-field {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .collection-entity > header > .ant-select {
    width: 100%;
    margin-left: 0;
  }

  .collection-document {
    align-items: flex-start;
  }

  .collection-section-heading {
    flex-direction: column;
    align-items: flex-start;
  }

  .collection-entity {
    padding: 16px;
  }
}
</style>
