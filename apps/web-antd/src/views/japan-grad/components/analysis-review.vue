<script setup lang="ts">
/* eslint-disable perfectionist/sort-array-includes, perfectionist/sort-imports -- Guideline dates and paired type/value imports follow the user workflow. */
import type {
  AdmissionFieldId,
  AnalysisContext,
  AnalysisJob,
  AnalysisProposal,
  Evidence,
} from '../analysis-types';

import { computed, ref, watch } from 'vue';

import { App, Button, Checkbox, Input, Modal, Select } from 'ant-design-vue';

import { validPlannerDay } from '../application-planning';
import {
  ADMISSION_FIELDS,
  analysisObjectLabel,
  EXAM_FIELDS,
  PROPOSAL_STATUS_LABELS,
} from '../analysis-types';
import { documentReaderPath, fileUrl } from '../documents';
import { useExplorerStore } from '../explorer';
import { jsonOptions, localApi } from '../local-api';
import { requireValue } from '../required-value';
import { vAccessibleSelect } from '../select-accessibility';
const props = defineProps<{
  context: AnalysisContext;
  job?: AnalysisJob;
  proposal?: AnalysisProposal;
}>();
const emit = defineEmits<{ applied: [context: AnalysisContext] }>();
const open = defineModel<boolean>('open', { default: false });
const store = useExplorerStore();
const { message } = App.useApp();
const acknowledged = ref(false);
const allowReplace = ref(false);
const busy = ref(false);
const confirmedScopes = ref<AdmissionFieldId[]>([]);
const createMaterials = ref(false);
const createTodos = ref(false);
const feedback = ref('');
const selected = ref<AdmissionFieldId[]>([]);
const values = ref<Partial<Record<AdmissionFieldId, string>>>({});
const documentId = ref('');
const page = ref(1);
const sourceText = ref('');
const sourceLoading = ref(false);
const sourceError = ref('');
let generation = 0;
const rows = computed(() =>
  ADMISSION_FIELDS.filter((field) => props.proposal?.fields[field.id]),
);
const displayWarnings = computed(() =>
  (props.proposal?.warnings || []).map((warning) => {
    if (!warning.includes('完成读取的来源页：')) return warning;
    const total = warning.match(/本次选择\s*(\d+)\s*页/)?.[1];
    const read = new Set(warning.match(/D\d+P\d+/g) || []).size;
    return `本次选择 ${total || read} 页，已读取 ${read} 页。每项依据可点击下方原文页码查看。`;
  }),
);
const source = computed(() =>
  props.job?.sources.find((s) => s.id === documentId.value),
);
const pdf = computed(() =>
  source.value?.filename.toLowerCase().endsWith('.pdf'),
);
const examRecordId = ref('');
const examYear = ref('');
const examSession = ref('');
const labId = ref('');
const hasExam = computed(() =>
  selected.value.some((key) => EXAM_FIELDS.includes(key)),
);
const hasTodoDates = computed(() =>
  selected.value.some(
    (key) =>
      [
        'applicationStart',
        'applicationEnd',
        'writtenDate',
        'interviewDate',
        'resultDate',
      ].includes(key) && validPlannerDay(values.value[key]?.trim() ?? ''),
  ),
);
function currentValue(key: AdmissionFieldId) {
  return EXAM_FIELDS.includes(key)
    ? (props.context.major.examHistory.find(
        (e) => e.id === examRecordId.value,
      )?.[key as 'interviewDate' | 'resultDate' | 'subjects' | 'writtenDate'] ??
        '')
    : (props.context.requirements.fields[key] ?? '');
}
watch(examRecordId, (id) => {
  const record = props.context.major.examHistory.find((e) => e.id === id);
  examYear.value = record?.year ?? '';
  examSession.value = record?.session ?? '';
  acknowledged.value = false;
  confirmedScopes.value = [];
});
const replacing = computed(() =>
  selected.value.some(
    (key) =>
      currentValue(key) && currentValue(key) !== values.value[key]?.trim(),
  ),
);
const canApply = computed(
  () =>
    props.proposal?.status === 'pending' &&
    selected.value.length > 0 &&
    selected.value.every((key) => values.value[key]?.trim()) &&
    selected.value.every(
      (key) =>
        !props.proposal?.fields[key]?.requiresScopeConfirmation ||
        confirmedScopes.value.includes(key),
    ) &&
    acknowledged.value &&
    (!hasExam.value || /^\d{4}$/.test(examYear.value)) &&
    (!(createMaterials.value || createTodos.value) || !!labId.value) &&
    (!replacing.value || allowReplace.value),
);
watch(open, (value) => {
  if (!value) {
    generation++;
    return;
  }
  selected.value = [];
  confirmedScopes.value = [];
  values.value = Object.fromEntries(
    Object.entries(props.proposal?.fields ?? {}).map(([key, item]) => [
      key,
      item?.value ?? '',
    ]),
  );
  acknowledged.value = allowReplace.value = false;
  createMaterials.value = createTodos.value = false;
  feedback.value = '';
  examRecordId.value = '';
  examYear.value = '';
  examSession.value = '';
  labId.value =
    props.context.labs.length === 1
      ? requireValue(props.context.labs[0]).id
      : '';
  const evidence = Object.values(props.proposal?.fields ?? {}).flatMap(
    (item) => item?.evidence ?? [],
  )[0];
  documentId.value = evidence?.documentId || props.job?.sources[0]?.id || '';
  page.value = evidence?.page || 1;
  void loadPage();
});
async function loadPage() {
  if (!props.job || !documentId.value) return;
  const current = ++generation;
  sourceLoading.value = true;
  sourceError.value = '';
  try {
    const data = await localApi<{ pages: { text: string; locator: string }[] }>(
      `/analysis/jobs/${props.job.id}/pages?documentId=${documentId.value}&start=${page.value}&count=1`,
    );
    if (current === generation)
      sourceText.value = data.pages
        .map(
          (p) =>
            `${p.locator}\n\n${p.text || '此页没有可读取文字，请查看 PDF 页面图像。'}`,
        )
        .join('\n');
  } catch (error) {
    if (current === generation)
      sourceError.value =
        error instanceof Error ? error.message : '原文读取失败。';
  } finally {
    if (current === generation) sourceLoading.value = false;
  }
}
function locate(e: Evidence) {
  documentId.value = e.documentId;
  page.value = e.page;
  void loadPage();
}
function toggle(key: AdmissionFieldId) {
  selected.value = selected.value.includes(key)
    ? selected.value.filter((id) => id !== key)
    : [...selected.value, key];
  acknowledged.value = false;
}
async function apply() {
  if (!canApply.value || !props.proposal) return;
  busy.value = true;
  feedback.value = '';
  try {
    const result = await localApi<{ context: AnalysisContext }>(
      `/analysis/proposals/${props.proposal.id}/apply`,
      jsonOptions('POST', {
        revision: props.context.revision,
        examRecordId: examRecordId.value,
        examYear: examYear.value,
        examSession: examSession.value,
        labId: labId.value,
        fields: Object.fromEntries(
          selected.value.map((key) => [key, values.value[key]?.trim()]),
        ),
        allowReplace: allowReplace.value,
        createMaterials: createMaterials.value,
        createTodos: createTodos.value,
        confirmedScopes: confirmedScopes.value,
      }),
    );
    await store.refresh();
    open.value = false;
    emit('applied', result.context);
    message.success('所选要求已采纳到专攻资料');
  } catch (error) {
    feedback.value = error instanceof Error ? error.message : '采纳失败。';
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <!-- eslint-disable vue/html-closing-bracket-newline, vue/multiline-html-element-content-newline -->
  <Modal
    v-model:open="open"
    title="核对募集要项提取草稿"
    :width="1320"
    :footer="null"
    :closable="!busy"
    :mask-closable="!busy"
    :keyboard="!busy"
  >
    <template v-if="proposal && job">
      <p class="analysis-review-context">
        {{ analysisObjectLabel(job.context) }}<br />执行器：{{
          proposal.executor
        }}
        ·
        {{ proposal.status === 'applied' ? '已采纳' : '待逐项核对' }}
      </p>
      <div class="analysis-review-body">
        <aside class="analysis-original">
          <header>
            <strong>{{ source?.title || '原始资料' }}</strong
            ><RouterLink
              v-if="source"
              :to="{
                path: documentReaderPath(source.id),
                query: { page: String(page), sha256: source.sha256 },
              }"
              target="_blank"
              rel="noopener noreferrer"
            >
              阅读与笔记 ↗
            </RouterLink>
          </header>
          <iframe
            v-if="source && pdf"
            :key="`${source.id}-${page}`"
            :src="`${fileUrl(source.id)}#page=${page}`"
            :title="`${source.title} 第 ${page} 页`"
          ></iframe>
          <pre v-else-if="!sourceLoading">{{ sourceText }}</pre>
          <p v-if="sourceLoading">正在读取原文…</p>
          <p v-if="sourceError" class="form-error">{{ sourceError }}</p>
        </aside>
        <section class="analysis-proposed">
          <ul v-if="displayWarnings.length" class="analysis-warnings">
            <li v-for="(warning, i) in displayWarnings" :key="i">
              {{ warning }}
            </li>
          </ul>
          <article v-for="field in rows" :key="field.id" class="analysis-field">
            <header>
              <Checkbox
                :checked="selected.includes(field.id)"
                :disabled="
                  busy ||
                  proposal.status === 'applied' ||
                  !values[field.id]?.trim()
                "
                @change="toggle(field.id)"
              >
                {{ field.label }} </Checkbox
              ><span>{{
                PROPOSAL_STATUS_LABELS[proposal.fields[field.id]!.status]
              }}</span>
            </header>
            <p class="analysis-current">
              当前值：{{ currentValue(field.id) || '未填写' }}
            </p>
            <div
              v-if="proposal.fields[field.id]?.requiresScopeConfirmation"
              class="analysis-scope-confirm"
            >
              <strong>请确认这项时间适用于你的报考对象</strong>
              <p>{{ proposal.fields[field.id]?.scopeNote }}</p>
              <Button
                v-if="proposal.fields[field.id]?.evidence[0]"
                size="small"
                type="link"
                @click="locate(proposal.fields[field.id]!.evidence[0]!)"
              >
                查看时间所在原文 · 第
                {{ proposal.fields[field.id]!.evidence[0]!.page }} 页
              </Button>
              <Checkbox
                :checked="confirmedScopes.includes(field.id)"
                :disabled="busy || proposal.status === 'applied'"
                @change="
                  confirmedScopes = confirmedScopes.includes(field.id)
                    ? confirmedScopes.filter((id) => id !== field.id)
                    : [...confirmedScopes, field.id]
                "
              >
                我已核对研究科、专攻及选拔类别，此时间适用于我的申请
              </Checkbox>
            </div>
            <Input.TextArea
              v-model:value="values[field.id]"
              :rows="field.date || field.money ? 2 : 3"
              :maxlength="field.max"
              :disabled="busy || proposal.status === 'applied'"
              :aria-label="`${field.label}核对后的内容`"
              placeholder="核对后可修改或手动补充；空值不会采纳"
              @change="
                acknowledged = false;
                confirmedScopes = confirmedScopes.filter(
                  (id) => id !== field.id,
                );
              "
            />
            <div
              v-for="(evidence, i) in proposal.fields[field.id]!.evidence"
              :key="i"
              class="analysis-evidence"
            >
              <Button type="link" size="small" @click="locate(evidence)">
                {{
                  job.sources.find((s) => s.id === evidence.documentId)?.title
                }}
                · 定位 {{ evidence.page
                }}{{
                  job.sources
                    .find((s) => s.id === evidence.documentId)
                    ?.filename.toLowerCase()
                    .endsWith('.pdf')
                    ? ' 页'
                    : ' 块'
                }}{{
                  evidence.verification === 'visual_review'
                    ? ' · 需看图核对'
                    : ''
                }}
              </Button>
              <blockquote>{{ evidence.quote }}</blockquote>
            </div>
            <small v-if="!proposal.fields[field.id]!.evidence.length"
              >尚无原文依据，补录后将记录为人工核对修改。</small
            >
          </article>
        </section>
      </div>
      <div
        v-if="proposal.status === 'pending' && hasExam"
        class="analysis-exam-destination"
      >
        <label>考试记录</label
        ><Select
          v-accessible-select
          v-model:value="examRecordId"
          :options="[
            { value: '', label: '新增考试记录' },
            ...context.major.examHistory.map((e) => ({
              value: e.id,
              label: `${e.year} 年 ${e.session || '未分批次'}`,
            })),
          ]"
          aria-label="采纳到哪个考试记录"
        />
        <Input
          v-model:value="examYear"
          :disabled="!!examRecordId || busy"
          :maxlength="4"
          placeholder="确认考试年份，如 2027"
          aria-label="采纳考试年份"
        />
        <Input
          v-model:value="examSession"
          :disabled="!!examRecordId || busy"
          :maxlength="120"
          placeholder="考试批次，可留空"
          aria-label="采纳考试批次"
        />
      </div>
      <footer
        v-if="proposal.status === 'pending'"
        class="analysis-review-footer"
      >
        <Checkbox v-model:checked="acknowledged" :disabled="busy">
          我已核对所选字段的来源、年度与选拔类别 </Checkbox
        ><Checkbox
          v-if="replacing"
          v-model:checked="allowReplace"
          :disabled="busy"
        >
          确认替换所选字段的已有内容 </Checkbox
        ><Checkbox
          v-if="selected.includes('applicationMaterials')"
          v-model:checked="createMaterials"
          :disabled="busy"
        >
          智能导入材料到研究室
        </Checkbox>
        <Checkbox
          v-if="hasTodoDates"
          v-model:checked="createTodos"
          :disabled="busy"
        >
          智能导入带日期的待办到研究室
        </Checkbox>
        <Select
          v-if="createMaterials || createTodos"
          v-accessible-select
          v-model:value="labId"
          :options="context.labs.map((l) => ({ value: l.id, label: l.name }))"
          placeholder="选择接收智能导入内容的研究室"
          aria-label="智能导入内容接收研究室"
        />
        <p v-if="feedback" class="form-error" role="alert">{{ feedback }}</p>
        <div>
          <span>已选 {{ selected.length }} 项 · 未选字段保留当前内容</span
          ><Button :disabled="busy" @click="open = false">关闭</Button
          ><Button
            type="primary"
            :disabled="!canApply"
            :loading="busy"
            @click="apply"
          >
            采纳所选要求
          </Button>
        </div>
      </footer>
      <footer v-else class="form-footer">
        <span>本草稿已采纳，结果和出处保存在专攻资料中。</span
        ><Button @click="open = false">关闭</Button>
      </footer>
    </template>
  </Modal>
</template>
<style scoped>
.analysis-scope-confirm {
  display: grid;
  gap: 8px;
  padding: 12px;
  margin: 10px 0;
  font-size: 12px;
  color: var(--jg-warning);
  background: var(--jg-subtle);
  border-left: 3px solid var(--jg-warning);
  border-radius: 5px;
}

.analysis-scope-confirm p {
  margin: 0;
  white-space: pre-wrap;
}

.analysis-scope-confirm .ant-btn {
  justify-self: start;
  padding-left: 0;
}

.analysis-review-context {
  font-size: 13px;
  color: var(--jg-muted);
}

.analysis-review-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
  gap: 20px;
  height: 58vh;
  min-height: 240px;
}

.analysis-original {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--jg-line);
  border-radius: 8px;
}

.analysis-original header {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: space-between;
  padding: 12px;
  font-size: 12px;
}

.analysis-original iframe {
  flex: 1;
  width: 100%;
  min-height: 0;
  border: 0;
}

.analysis-original pre {
  padding: 16px;
  margin: 0;
  overflow: auto;
  font-family: inherit;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.analysis-proposed {
  padding-right: 8px;
  overflow: auto;
}

.analysis-warnings {
  padding: 12px 12px 12px 28px;
  margin: 0 0 16px;
  font-size: 12px;
  color: var(--jg-warning);
  background: var(--jg-subtle);
}

.analysis-field {
  padding: 16px 0;
  border-bottom: 1px solid var(--jg-line);
}

.analysis-field > header {
  display: flex;
  gap: 8px;
  justify-content: space-between;
}

.analysis-field header > span {
  font-size: 12px;
  color: var(--jg-muted);
}

.analysis-current {
  max-height: 90px;
  overflow: auto;
  font-size: 12px;
  color: var(--jg-muted);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.analysis-evidence blockquote {
  max-height: 140px;
  padding-left: 12px;
  margin: 6px 0;
  overflow: auto;
  font-size: 12px;
  color: var(--jg-secondary);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  border-left: 2px solid var(--jg-accent-line);
}

.analysis-evidence :deep(.ant-btn) {
  height: auto;
  text-align: left;
  white-space: normal;
}

.analysis-field > small {
  display: block;
  margin-top: 8px;
  color: var(--jg-muted);
}

.analysis-exam-destination {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 16px;
}

.analysis-exam-destination .ant-select {
  min-width: 240px;
}

.analysis-exam-destination .ant-input {
  max-width: 220px;
}

.analysis-review-footer {
  display: grid;
  gap: 12px;
  padding-top: 18px;
}

.analysis-review-footer :deep(.ant-checkbox-wrapper) {
  margin: 0;
}

.analysis-review-footer > div {
  display: flex;
  gap: 10px;
  align-items: center;
}

.analysis-review-footer > div > span {
  flex: 1;
  font-size: 12px;
  color: var(--jg-muted);
}

@media (max-width: 800px) {
  .analysis-review-body {
    grid-template-columns: minmax(0, 1fr);
    height: 62vh;
    overflow: auto;
  }

  .analysis-original {
    min-height: 330px;
  }

  .analysis-proposed {
    overflow: visible;
  }

  .analysis-review-footer > div {
    flex-wrap: wrap;
  }

  .analysis-review-footer > div > span {
    flex-basis: 100%;
  }
}
</style>
