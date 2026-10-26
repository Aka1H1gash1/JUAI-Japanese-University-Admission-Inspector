<script setup lang="ts">
import type {
  CollectedField,
  CollectionDetail,
  CollectionEvidence,
  CollectionStatus,
} from '../collection-types';

import { computed, ref, watch } from 'vue';

import { App, Button, Checkbox, Input, Select } from 'ant-design-vue';

import {
  ADMISSION_STATUS_NAMES,
  ADMISSION_SUMMARY_NAMES,
} from '../collection-types';
import { jsonOptions, localApi } from '../local-api';
import { vAccessibleSelect } from '../select-accessibility';
import { PROGRAM_DEGREES } from '../special-program-types';
const props = defineProps<{
  detail: CollectionDetail;
  config: CollectionStatus;
}>();
const emit = defineEmits<{ applied: [] }>();
const { message } = App.useApp();
type Row = CollectedField & { selected: boolean; edited: string };
const acknowledged = ref(false);
const busy = ref(false);
const confirmed = ref<string[]>([]);
const errorMessage = ref('');
const rows = ref<Row[]>([]);
const summaries = ref<Row[]>([]);
watch(
  () => JSON.stringify(props.detail.job.draft),
  () => {
    rows.value = (props.detail.job.draft?.specialProgram || []).map((f) => ({
      ...f,
      edited: f.value,
      selected: !f.requiresScopeConfirmation,
    }));
    if (!rows.value.some((r) => r.field === 'name'))
      rows.value.unshift({
        field: 'name',
        value: '',
        edited: '',
        evidence: [],
        scopeNote: '',
        requiresScopeConfirmation: false,
        selected: false,
      });
    summaries.value = (props.detail.job.draft?.admissions?.fields || []).map(
      (f) => ({
        ...f,
        edited: f.value,
        selected: !f.requiresScopeConfirmation,
      }),
    );
    confirmed.value = [];
    acknowledged.value = false;
  },
  { immediate: true },
);
const name = computed(() =>
  rows.value.find((r) => r.field === 'name' && r.selected)?.edited.trim(),
);
const pending = computed(() =>
  [
    ...rows.value
      .filter((r) => r.selected && r.requiresScopeConfirmation)
      .map((r) => `special_program.${r.field}`),
    ...summaries.value
      .filter((r) => r.selected && r.requiresScopeConfirmation)
      .map((r) => `admissions.${r.field}`),
  ].some((key) => !confirmed.value.includes(key)),
);
const groups = computed(() => [
  { prefix: 'special_program', label: '项目资料', rows: rows.value },
  { prefix: 'admissions', label: '募集要项摘要', rows: summaries.value },
]);
const label = (group: string, field: string) =>
  group === 'admissions'
    ? ADMISSION_SUMMARY_NAMES[field] || field
    : props.config.specialProgramFields?.find(([key]) => key === field)?.[1] ||
      field;
function edit(row: Row) {
  row.selected = !!row.edited.trim();
  acknowledged.value = false;
  confirmed.value = [];
}
function toggle(key: string) {
  confirmed.value = confirmed.value.includes(key)
    ? confirmed.value.filter((v) => v !== key)
    : [...confirmed.value, key];
  acknowledged.value = false;
}
function sourceUrl(e: CollectionEvidence) {
  return props.detail.job.sources?.find((s) => s.id === e.sourceId)?.kind ===
    'pdf'
    ? `/api/japangrad/collection/jobs/${props.detail.job.id}/sources/${e.sourceId}/file#page=${e.page}`
    : e.url;
}
async function apply() {
  if (!acknowledged.value || !name.value || pending.value || busy.value) return;
  busy.value = true;
  errorMessage.value = '';
  try {
    const fields = (items: Row[]) =>
      Object.fromEntries(
        items
          .filter((r) => r.selected && r.edited.trim())
          .map((r) => [r.field, r.edited.trim()]),
      );
    await localApi(
      `/collection/jobs/${props.detail.job.id}/apply`,
      jsonOptions('POST', {
        confirm: true,
        fields: fields(rows.value),
        admissions: fields(summaries.value),
        confirmedScopes: confirmed.value,
      }),
    );
    message.success('特殊入学项目已生成。');
    emit('applied');
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '项目生成失败。';
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <section class="special-review">
    <header>
      <h2>核对并生成特殊入学项目</h2>
      <p>只创建这个项目，保留院校名称、项目要求、募集要项摘要与原件来源。</p>
    </header>
    <ul
      v-if="detail.job.draft?.warnings.length"
      class="special-review-warnings"
    >
      <li v-for="(warning, i) in detail.job.draft.warnings" :key="i">
        {{ warning }}
      </li>
    </ul>
    <p v-if="detail.job.draft?.admissions" class="special-review-scope">
      {{ ADMISSION_STATUS_NAMES[detail.job.draft.admissions.status] }} ·
      {{ detail.job.draft.admissions.scope }}
    </p>
    <section v-for="group in groups" :key="group.prefix">
      <h3>{{ group.label }}</h3>
      <div
        v-for="row in group.rows"
        :key="row.field"
        class="special-review-field"
      >
        <Checkbox
          v-model:checked="row.selected"
          :disabled="busy || !row.edited.trim()"
          @change="acknowledged = false"
        >
          {{ label(group.prefix, row.field) }}
        </Checkbox>
        <div>
          <Select
            v-if="row.field === 'degree'"
            v-accessible-select
            v-model:value="row.edited"
            :disabled="busy"
            :options="
              Object.entries(PROGRAM_DEGREES).map(([value, label]) => ({
                value,
                label,
              }))
            "
            @change="edit(row)"
          />
          <Input.TextArea
            v-else
            v-model:value="row.edited"
            :rows="
              [
                'name',
                'website',
                'category',
                'institutionName',
                'intake',
                'language',
              ].includes(row.field)
                ? 1
                : 3
            "
            :maxlength="
              (group.prefix === 'admissions'
                ? config.admissionSummaryFields
                : config.specialProgramFields
              )?.find(([id]) => id === row.field)?.[2] || 4000
            "
            :disabled="busy"
            :aria-label="label(group.prefix, row.field)"
            @change="edit(row)"
          />
          <p v-if="row.scopeNote" class="special-review-scope">
            {{ row.scopeNote }}
          </p>
          <div class="special-review-citations">
            <a
              v-for="(e, i) in row.evidence"
              :key="i"
              :href="sourceUrl(e)"
              :title="e.quote"
              target="_blank"
              rel="noopener noreferrer"
              >{{ e.title }} · 第 {{ e.page }} 页 ↗</a>
          </div>
          <Checkbox
            v-if="row.requiresScopeConfirmation"
            :checked="confirmed.includes(`${group.prefix}.${row.field}`)"
            :disabled="busy"
            @change="toggle(`${group.prefix}.${row.field}`)"
          >
            已核对该时间的入学年份、身份及选拔类别
          </Checkbox>
        </div>
      </div>
    </section>
    <footer>
      <p v-if="errorMessage" class="form-error" role="alert">
        {{ errorMessage }}
      </p>
      <p v-if="pending" class="special-review-scope">
        所选时间仍需确认适用对象。
      </p>
      <Checkbox v-model:checked="acknowledged" :disabled="busy">
        已核对项目资料、所属院校及所选时间，确认生成
</Checkbox><Button
        type="primary"
        :loading="busy"
        :disabled="!acknowledged || !name || pending"
        @click="apply"
      >
        生成特殊入学项目
      </Button>
    </footer>
  </section>
</template>
<style scoped>
.special-review {
  margin-top: 28px;
}

.special-review header h2 {
  margin: 0 0 10px;
  font-size: 23px;
}

.special-review header p,
.special-review-scope {
  font-size: 12px;
  line-height: 1.8;
  color: var(--jg-muted);
}

.special-review-warnings {
  padding: 16px 30px;
  font-size: 12px;
  line-height: 1.8;
  color: var(--jg-muted);
  background: var(--jg-subtle);
  border-radius: 8px;
}

.special-review > section {
  padding: 22px;
  margin: 18px 0;
  background: var(--jg-surface);
  border: 1px solid var(--jg-line);
  border-radius: 12px;
}

.special-review h3 {
  margin: 0 0 18px;
  font-size: 18px;
}

.special-review-field {
  display: grid;
  grid-template-columns: 150px minmax(0, 1fr);
  gap: 18px;
  padding: 15px 0;
  border-top: 1px solid var(--jg-line);
}

.special-review-citations {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin: 9px 0;
}

.special-review-citations a {
  font-size: 11px;
  color: var(--jg-accent-text);
}

.special-review footer {
  display: grid;
  gap: 15px;
  padding: 22px;
  background: var(--jg-accent-soft);
  border: 1px solid var(--jg-accent-line);
  border-radius: 12px;
}

.special-review footer > .ant-btn {
  justify-self: end;
}

@media (max-width: 650px) {
  .special-review-field {
    grid-template-columns: 1fr;
    gap: 8px;
  }
}
</style>
