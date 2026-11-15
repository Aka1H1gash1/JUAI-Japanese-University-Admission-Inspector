<script setup lang="ts">
import type { StoredDocument } from '../documents';
import type { ExamHistoryRecord } from '../exam-history';
import type { AdmissionBatch } from '../foundation-types';

import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import {
  App,
  Button,
  Checkbox,
  Input,
  InputNumber,
  Modal,
  Select,
} from 'ant-design-vue';

import ContentSection from '../design-system/content-section.vue';
import DateMarker from '../design-system/date-marker.vue';
import { useExplorerStore, websiteUrl } from '../explorer';
import { jsonOptions, localApi } from '../local-api';
import { vAccessibleSelect } from '../select-accessibility';
const props = defineProps<{ majorId: string; files?: StoredDocument[] }>();
const emit = defineEmits<{
  count: [value: number];
  selected: [batch: AdmissionBatch | undefined];
}>();
const { modal } = App.useApp();
const route = useRoute();
const router = useRouter();
const busy = ref(false);
const errorMessage = ref('');
const loading = ref(false);
const open = ref(false);
const rows = ref<AdmissionBatch[]>([]);
const selectedId = ref('');
const selected = computed(
  () => rows.value.find((r) => r.id === selectedId.value) || rows.value[0],
);
const blank = (): AdmissionBatch => ({
  id: '',
  majorId: props.majorId,
  version: 0,
  admissionYear: null,
  label: '',
  examType: '',
  scope: '',
  examDate: '',
  interviewDate: '',
  subjects: '',
  materials: '',
  language: '',
  consent: 'unknown',
  sourceUrl: '',
  notes: '',
});
const draft = ref(blank());
const store = useExplorerStore();
const sourceOpen = ref(false);
const sourceId = ref<string>();
const sourceExam = ref<ExamHistoryRecord>();
const scopeConfirmed = ref(false);
const sourceExams = computed(
  () =>
    store.majors.find((major) => major.id === props.majorId)?.examHistory || [],
);
function chooseSource() {
  sourceId.value = sourceExams.value[0]?.id;
  sourceOpen.value = true;
}
function adoptSource() {
  const record = sourceExams.value.find((entry) => entry.id === sourceId.value);
  if (!record) return;
  edit();
  sourceExam.value = record;
  scopeConfirmed.value = false;
  draft.value = {
    ...blank(),
    label: record.session,
    examDate: record.writtenDate || record.examDate || '',
    interviewDate: record.interviewDate || '',
    subjects: record.subjects || '',
    sourceUrl: record.sourceUrl || '',
    notes: record.notes || '',
  };
  sourceOpen.value = false;
}

const api = () =>
  `/foundation/majors/${encodeURIComponent(props.majorId)}/batches`;
let generation = 0;
onBeforeUnmount(() => generation++);
async function load() {
  const current = ++generation;
  loading.value = true;
  try {
    const result = await localApi<AdmissionBatch[]>(api());
    if (current !== generation) return;
    rows.value = result;
    emit('count', rows.value.length);
    emit('selected', selected.value);
    errorMessage.value = '';
  } catch (error) {
    if (current === generation)
      errorMessage.value =
        error instanceof Error ? error.message : '批次读取失败';
  } finally {
    if (current === generation) loading.value = false;
  }
}
watch(
  () => props.majorId,
  () => {
    rows.value = [];
    selectedId.value =
      typeof route.query.batch === 'string' ? route.query.batch : '';
    void load();
  },
  { immediate: true },
);
watch(
  () => route.query.batch,
  (value) => {
    selectedId.value = typeof value === 'string' ? value : '';
    emit('selected', selected.value);
  },
);
function choose(value: unknown) {
  selectedId.value = String(value);
  void router.replace({ query: { ...route.query, batch: selectedId.value } });
  emit('selected', selected.value);
}
async function attachFile(id: string, expectedBatchId?: string) {
  const current = selected.value;
  if (expectedBatchId && current?.id !== expectedBatchId)
    throw new Error('当前批次已改变，请手动关联文件。');
  if (!current) return;
  await localApi(
    `${api()}/${current.id}`,
    jsonOptions('PUT', {
      ...current,
      documentIds: [...new Set([...(current.documentIds || []), id])],
    }),
  );
  await load();
}
defineExpose({ attachFile });
function edit(existing?: AdmissionBatch) {
  sourceExam.value = undefined;
  scopeConfirmed.value = false;
  draft.value = existing
    ? { ...existing, documentIds: [...(existing.documentIds || [])] }
    : blank();
  errorMessage.value = '';
  open.value = true;
}
async function save() {
  if (busy.value) return;
  if (sourceExam.value && !scopeConfirmed.value) {
    errorMessage.value = '请先核对考试类别、适用范围与年度。';
    return;
  }
  busy.value = true;
  try {
    const d = draft.value;
    const saved = await localApi<AdmissionBatch>(
      `${api()}${d.id ? `/${d.id}` : ''}`,
      jsonOptions(d.id ? 'PUT' : 'POST', d),
    );
    selectedId.value = saved.id;
    void router.replace({ query: { ...route.query, batch: saved.id } });
    open.value = false;
    await load();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '保存失败';
  } finally {
    busy.value = false;
  }
}
function remove() {
  const value = selected.value;
  if (!value) return;
  modal.confirm({
    title: `删除「${value.label}」？`,
    content: '只删除本招生批次及其文件关联，原文件和旧资料保留。',
    okText: '删除批次',
    cancelText: '取消',
    okButtonProps: { danger: true },
    async onOk() {
      await localApi(
        `${api()}/${value.id}`,
        jsonOptions('DELETE', { version: value.version }),
      );
      await load();
    },
  });
}
const consentLabels = {
  required: '必须',
  optional: '非必须',
  unknown: '未确认',
};
</script>
<template>
  <ContentSection title="招生信息">
    <template #actions>
      <Button @click="edit()">新增批次</Button><Button v-if="sourceExams.length" @click="chooseSource">
从已解析考试建立
</Button><Button v-if="selected" @click="edit(selected)"> 编辑本批次 </Button>
    </template>
    <p v-if="loading" role="status">正在读取招生批次…</p>
    <p v-if="errorMessage && !open" role="alert" class="form-error">
      {{ errorMessage }} <Button size="small" @click="load">重试</Button>
    </p>
    <template v-if="selected">
      <Select
        v-accessible-select
        :value="selectedId || selected.id"
        @change="choose"
        :options="
          rows.map((r) => ({
            value: r.id,
            label: `${r.admissionYear || '年度未确认'} · ${r.label}`,
          }))
        "
        aria-label="选择招生批次"
        style="width: min(100%, 360px)"
      />
      <p class="juai-scope-note" style="margin-top: 12px">
        {{ selected.examType || '考试类别未确认' }} ·
        {{ selected.scope || '适用范围未确认' }}
      </p>
      <div class="juai-date-row">
        <DateMarker label="考试日期" :value="selected.examDate" /><DateMarker
          label="面试日期"
          :value="selected.interviewDate"
        />
      </div>
      <dl class="juai-facts">
        <div>
          <dt>考试科目</dt>
          <dd>{{ selected.subjects || '未确认' }}</dd>
        </div>
        <div>
          <dt>内诺要求</dt>
          <dd>{{ consentLabels[selected.consent] }}</dd>
        </div>
        <div>
          <dt>所需材料</dt>
          <dd>{{ selected.materials || '未确认' }}</dd>
        </div>
        <div>
          <dt>语言要求</dt>
          <dd>{{ selected.language || '未确认' }}</dd>
        </div>
      </dl>
      <p v-if="selected.notes" class="juai-prose" style="margin-top: 16px">
        {{ selected.notes }}
      </p>
      <div class="juai-link-row">
        <a
          v-if="websiteUrl(selected.sourceUrl)"
          :href="websiteUrl(selected.sourceUrl)"
          target="_blank"
          rel="noopener noreferrer"
          >本批次来源 ↗</a><Button type="text" danger @click="remove">删除本批次</Button>
      </div>
    </template>
    <p
      v-else-if="!loading && !errorMessage && !$slots.legacy"
      class="juai-scope-note"
    >
      尚未添加招生批次。请核对入学年度、考试类别与适用范围后新增。
    </p>
    <div v-if="!selected && !loading && !errorMessage">
      <slot name="legacy"></slot>
    </div>
    <Modal
      v-model:open="open"
      :title="draft.id ? '编辑招生批次' : '新增招生批次'"
      :width="720"
      :footer="null"
      :closable="!busy"
      :mask-closable="!busy"
    >
      <form class="batch-editor" @submit.prevent="save">
        <div
          v-if="sourceExam"
          class="juai-scope-note"
          style="margin-bottom: 20px"
        >
          <p>
            来源：实际考试 {{ sourceExam.year }} 年 ·
            {{
              sourceExam.session
            }}。入学年度、考试类别及适用范围需分别核对；未知可留空。仅载入该条记录的日期、科目与来源，不覆盖旧记录或现有批次。
          </p>
          <Checkbox v-model:checked="scopeConfirmed" :disabled="busy">
已核对该记录的年度、类别与适用范围，未确认项保持留空
</Checkbox>
        </div>
        <div class="batch-editor-grid">
          <label>入学年度<InputNumber
              :value="draft.admissionYear ?? undefined"
              @change="
                (v) => (draft.admissionYear = typeof v === 'number' ? v : null)
              "
              :min="1900"
              :max="2200"
              :precision="0"
              :disabled="busy"
              placeholder="未确认可留空"
          /></label>
          <label>批次名称<Input
              v-model:value="draft.label"
              :maxlength="120"
              :disabled="busy"
          /></label>
          <label>考试类别<Input
              v-model:value="draft.examType"
              :maxlength="240"
              :disabled="busy"
          /></label>
          <label>适用范围<Input
              v-model:value="draft.scope"
              :maxlength="4000"
              :disabled="busy"
          /></label>
          <label>考试日期<Input
              v-model:value="draft.examDate"
              :maxlength="240"
              :disabled="busy"
              placeholder="明确日期或原文说明"
          /></label>
          <label>面试日期<Input
              v-model:value="draft.interviewDate"
              :maxlength="240"
              :disabled="busy"
          /></label>
          <label>考试科目<Input.TextArea
              v-model:value="draft.subjects"
              :maxlength="2000"
              :rows="2"
              :disabled="busy"
          /></label>
          <label>所需材料<Input.TextArea
              v-model:value="draft.materials"
              :maxlength="8000"
              :rows="2"
              :disabled="busy"
          /></label>
          <label>语言要求<Input.TextArea
              v-model:value="draft.language"
              :maxlength="4000"
              :rows="2"
              :disabled="busy"
          /></label>
          <label>内诺要求<Select
              v-accessible-select
              aria-label="内诺要求"
              v-model:value="draft.consent"
              :options="
                Object.entries(consentLabels).map(([value, label]) => ({
                  value,
                  label,
                }))
              "
              :disabled="busy"
          /></label>
          <label>来源网址<Input
              v-model:value="draft.sourceUrl"
              :maxlength="2048"
              :disabled="busy"
          /></label>
          <label>补充说明<Input.TextArea
              v-model:value="draft.notes"
              :maxlength="4000"
              :rows="2"
              :disabled="busy"
          /></label>
          <label style="grid-column: 1/-1">关联本专攻文件<Select
              v-accessible-select
              aria-label="关联本专攻文件"
              v-model:value="draft.documentIds"
              mode="multiple"
              :disabled="busy"
              :options="
                (files || []).map((f) => ({
                  value: f.id,
                  label: `${f.title} · ${f.year}`,
                }))
              "
              placeholder="选择募集要项、相关文件或过去问"
          /></label>
        </div>
        <p v-if="errorMessage" role="alert" class="form-error">
          {{ errorMessage }}
        </p>
        <footer>
          <Button :disabled="busy" @click="open = false">取消</Button><Button type="primary" html-type="submit" :loading="busy">
            保存批次
          </Button>
        </footer>
      </form>
    </Modal>
  </ContentSection>
  <Modal
    v-model:open="sourceOpen"
    title="从已解析考试建立招生批次"
    :footer="null"
  >
    <p class="juai-scope-note">
      选择一条已保存的考试记录，载入后核对入学年度与适用范围。原记录保留。
    </p>
    <Select
      v-accessible-select
      v-model:value="sourceId"
      aria-label="选择已解析考试记录"
      style="width: 100%; margin: 16px 0"
      :options="
        sourceExams.map((record) => ({
          value: record.id,
          label: `实际考试 ${record.year} 年 · ${record.session}`,
        }))
      "
    />
    <Button type="primary" :disabled="!sourceId" @click="adoptSource">
载入并核对
</Button>
  </Modal>
</template>
<style scoped>
.batch-editor {
  padding-top: 16px;
}

.batch-editor-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.batch-editor label {
  display: grid;
  gap: 6px;
  font-size: 12px;
}

.batch-editor footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 20px;
}

@media (max-width: 600px) {
  .batch-editor-grid {
    grid-template-columns: 1fr;
  }
}
</style>
