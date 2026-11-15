<script setup lang="ts">
import type { AdmissionBatch } from '../foundation-types';

import { computed, ref, watch } from 'vue';

import { App, Button, Input, InputNumber, Modal, Select } from 'ant-design-vue';

import ContentSection from '../design-system/content-section.vue';
import DateMarker from '../design-system/date-marker.vue';
import { websiteUrl } from '../explorer';
import { jsonOptions, localApi } from '../local-api';
const props = defineProps<{ majorId: string }>();
const emit = defineEmits<{ count: [value: number] }>();
const { modal } = App.useApp();
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
const api = () =>
  `/foundation/majors/${encodeURIComponent(props.majorId)}/batches`;
async function load() {
  loading.value = true;
  try {
    rows.value = await localApi<AdmissionBatch[]>(api());
    emit('count', rows.value.length);
    errorMessage.value = '';
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '批次读取失败';
  } finally {
    loading.value = false;
  }
}
watch(
  () => props.majorId,
  () => {
    rows.value = [];
    selectedId.value = '';
    void load();
  },
  { immediate: true },
);
function edit(existing?: AdmissionBatch) {
  draft.value = existing ? { ...existing } : blank();
  errorMessage.value = '';
  open.value = true;
}
async function save() {
  busy.value = true;
  try {
    const d = draft.value;
    const saved = await localApi<AdmissionBatch>(
      `${api()}${d.id ? `/${d.id}` : ''}`,
      jsonOptions(d.id ? 'PUT' : 'POST', d),
    );
    selectedId.value = saved.id;
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
  <ContentSection
    title="招生批次"
    :subtitle="selected ? undefined : '按入学年度、批次和考试类别独立记录'"
  >
    <template #actions>
      <Button @click="edit()">新增批次</Button><Button v-if="selected" @click="edit(selected)"> 编辑本批次 </Button>
    </template>
    <p v-if="loading" role="status">正在读取招生批次…</p>
    <p v-if="errorMessage && !open" role="alert" class="form-error">
      {{ errorMessage }} <Button size="small" @click="load">重试</Button>
    </p>
    <template v-if="selected">
      <Select
        :value="selectedId || selected.id"
        @change="(v) => (selectedId = String(v))"
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
    <p v-else-if="!loading && !errorMessage" class="juai-scope-note">
      尚未建立结构化招生批次。下方保留旧考试和通用资料，不会自动把考试年份当作入学年度。
    </p>
    <Modal
      v-model:open="open"
      :title="draft.id ? '编辑招生批次' : '新增招生批次'"
      :width="720"
      :footer="null"
      :closable="!busy"
      :mask-closable="!busy"
    >
      <form class="batch-editor" @submit.prevent="save">
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
