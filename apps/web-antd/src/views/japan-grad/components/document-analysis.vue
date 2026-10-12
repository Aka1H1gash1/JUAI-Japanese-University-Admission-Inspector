<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  App,
  Button,
  Checkbox,
  Input,
  InputNumber,
  Select,
} from 'ant-design-vue';
import type {
  AnalysisContext,
  AnalysisJob,
  AnalysisProposal,
} from '../analysis-types';
import {
  ADMISSION_FIELDS,
  DEGREE_LABELS,
  JOB_STATUS_LABELS,
} from '../analysis-types';
import type { StoredDocument } from '../documents';
import { fileUrl } from '../documents';
import { jsonOptions, localApi } from '../local-api';
import { vAccessibleSelect } from '../select-accessibility';
import AnalysisReview from './analysis-review.vue';
import AgentConnections from './agent-connections.vue';
const props = defineProps<{ majorId: string }>();
const route = useRoute(),
  router = useRouter(),
  { message } = App.useApp();
const context = ref<AnalysisContext>(),
  documents = ref<StoredDocument[]>([]),
  jobs = ref<AnalysisJob[]>([]),
  ids = ref<string[]>([]),
  selectedJob = ref<AnalysisJob>(),
  proposals = ref<AnalysisProposal[]>([]),
  proposal = ref<AnalysisProposal>();
const reviewOpen = ref(false),
  agentOpen = ref(false),
  busy = ref(false),
  loading = ref(false),
  feedback = ref(''),
  fileInput = ref<HTMLInputElement>();
const admissionYear = ref(new Date().getFullYear() + 1),
  degree = ref('master'),
  selectionType = ref(''),
  analysisNotes = ref('');
let generation = 0,
  timer: ReturnType<typeof setTimeout> | undefined;
const canRead = computed(
  () =>
    selectedJob.value &&
    ['ready', 'awaiting_review'].includes(selectedJob.value.status),
);
const accepted = computed(() =>
  ADMISSION_FIELDS.filter((f) => context.value?.requirements.fields[f.id]),
);
async function load() {
  const current = ++generation;
  loading.value = true;
  feedback.value = '';
  clearTimeout(timer);
  try {
    const [docs, value] = await Promise.all([
      localApi<StoredDocument[]>(
        `/documents?ownerType=major&ownerId=${props.majorId}`,
      ),
      localApi<AnalysisContext>(`/analysis/majors/${props.majorId}`),
    ]);
    if (current !== generation) return;
    documents.value = docs.filter((d) => d.kind === 'guidelines');
    context.value = value;
    jobs.value = value.jobs.toSorted((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
    const requested =
      typeof route.query.documentId === 'string' ? route.query.documentId : '';
    const doc = documents.value.find((d) => d.id === requested);
    if (doc) {
      ids.value = [doc.id];
      admissionYear.value = doc.year;
    }
    if (selectedJob.value?.id || jobs.value[0]?.id)
      await viewJob(selectedJob.value?.id || jobs.value[0]!.id);
  } catch (e) {
    if (current === generation)
      feedback.value = e instanceof Error ? e.message : '分析资料读取失败。';
  } finally {
    loading.value = false;
  }
}
async function viewJob(id: string) {
  clearTimeout(timer);
  const current = ++generation;
  try {
    const result = await localApi<{
      job: AnalysisJob;
      proposals: AnalysisProposal[];
    }>(`/analysis/jobs/${id}`);
    if (current !== generation) return;
    selectedJob.value = result.job;
    proposals.value = result.proposals;
    const index = jobs.value.findIndex((j) => j.id === id);
    if (index >= 0) jobs.value[index] = result.job;
    if (['queued', 'parsing'].includes(result.job.status))
      timer = setTimeout(() => void viewJob(id), 2500);
  } catch (e) {
    if (current === generation)
      feedback.value = e instanceof Error ? e.message : '任务读取失败。';
  }
}
watch(
  () => props.majorId,
  () => {
    selectedJob.value = undefined;
    jobs.value = [];
    ids.value = [];
    proposals.value = [];
    void load();
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  generation++;
  clearTimeout(timer);
});
function toggle(id: string) {
  ids.value = ids.value.includes(id)
    ? ids.value.filter((value) => value !== id)
    : [...ids.value, id];
  if (ids.value.length === 1)
    admissionYear.value =
      documents.value.find((d) => d.id === ids.value[0])?.year ??
      admissionYear.value;
}
async function create() {
  busy.value = true;
  feedback.value = '';
  try {
    const result = await localApi<AnalysisJob>(
      '/analysis/jobs',
      jsonOptions('POST', {
        majorId: props.majorId,
        documentIds: ids.value,
        context: {
          admissionYear: admissionYear.value,
          degree: degree.value,
          selectionType: selectionType.value,
          notes: analysisNotes.value,
        },
      }),
    );
    jobs.value.unshift(result);
    await viewJob(result.id);
    message.success('读取任务已创建，完成后可核对草稿或交给 Agent 分析。');
  } catch (e) {
    feedback.value = e instanceof Error ? e.message : '任务创建失败。';
  } finally {
    busy.value = false;
  }
}
async function retry() {
  if (!selectedJob.value) return;
  busy.value = true;
  feedback.value = '';
  try {
    await localApi(
      `/analysis/jobs/${selectedJob.value.id}/retry`,
      jsonOptions('POST', {}),
    );
    await viewJob(selectedJob.value.id);
  } catch (e) {
    feedback.value = e instanceof Error ? e.message : '重试失败。';
  } finally {
    busy.value = false;
  }
}
async function importFile(file?: File) {
  if (!file || !selectedJob.value) return;
  if (
    file.size > 8 * 1024 * 1024 ||
    !file.name.toLowerCase().endsWith('.json')
  ) {
    feedback.value = '请选择一个不超过 8 MB 的结果 JSON 文件。';
    return;
  }
  busy.value = true;
  feedback.value = '';
  try {
    const input = JSON.parse(await file.text());
    await localApi(
      `/analysis/jobs/${selectedJob.value.id}/proposals`,
      jsonOptions('POST', { requestKey: crypto.randomUUID(), proposal: input }),
    );
    await viewJob(selectedJob.value.id);
    message.success('Agent 分析结果已导入待核对列表');
  } catch (e) {
    feedback.value = e instanceof Error ? e.message : 'JSON 读取或导入失败。';
  } finally {
    busy.value = false;
    if (fileInput.value) fileInput.value.value = '';
  }
}
function drop(e: DragEvent) {
  if (busy.value || !canRead.value) return;
  const files = e.dataTransfer?.files;
  if (files?.length !== 1) {
    feedback.value = '每次只导入一个结果 JSON 文件。';
    return;
  }
  void importFile(files[0]);
}
async function review(item: AnalysisProposal) {
  busy.value = true;
  feedback.value = '';
  try {
    context.value = await localApi<AnalysisContext>(
      `/analysis/majors/${props.majorId}`,
    );
    proposal.value = item;
    reviewOpen.value = true;
  } catch (e) {
    feedback.value = e instanceof Error ? e.message : '核对资料读取失败。';
  } finally {
    busy.value = false;
  }
}
async function applied(value: AnalysisContext) {
  context.value = { ...value, jobs: jobs.value };
  if (selectedJob.value) await viewJob(selectedJob.value.id);
}
function goToMajor() {
  if (!context.value) return;
  const c = context.value;
  void router.push(
    `/japan-grad/universities/${c.university.id}/schools/${c.school.id}/majors/${c.major.id}`,
  );
}
</script>
<template>
  <section class="document-analysis">
    <header class="collection-heading">
      <div>
        <h2>募集要项分析</h2>
        <p>
          直接分析专攻资料，对照原文采纳要求，并更新考试表或研究室材料清单。
        </p>
      </div>
      <div class="detail-actions">
        <Button :disabled="busy || loading" @click="load">刷新任务</Button
        ><Button @click="agentOpen = true">连接我的 Agent</Button>
      </div>
    </header>
    <p v-if="feedback" class="form-error" role="alert">{{ feedback }}</p>
    <p v-if="loading">正在读取资料与分析任务…</p>
    <div class="analysis-setup">
      <h3>选择分析资料</h3>
      <p>选择募集要项、专攻补充说明或修订通知，并说明这次要分析的对象。</p>
      <div class="analysis-context-fields">
        <label
          >资料年度<InputNumber
            v-model:value="admissionYear"
            :min="1900"
            :max="2200"
            :precision="0"
            :disabled="busy" /></label
        ><label
          >学位 / 身份<Select
            v-accessible-select
            v-model:value="degree"
            :options="
              Object.entries(DEGREE_LABELS).map(([value, label]) => ({
                value,
                label,
              }))
            "
            :disabled="busy" /></label
        ><label
          >选拔类别<Input
            v-model:value="selectionType"
            :maxlength="100"
            :disabled="busy"
            placeholder="如外国人特别选拔；不确定可留空"
        /></label>
      </div>
      <Input.TextArea
        v-model:value="analysisNotes"
        :maxlength="1000"
        :rows="2"
        :disabled="busy"
        placeholder="可补充希望核对的范围或疑问"
        aria-label="本次分析说明"
      />
      <div class="analysis-document-list">
        <Checkbox
          v-for="doc in documents"
          :key="doc.id"
          :checked="ids.includes(doc.id)"
          :disabled="busy"
          @change="toggle(doc.id)"
          ><strong>{{ doc.title }}</strong
          ><small>{{ doc.year }} 年 · {{ doc.filename }}</small></Checkbox
        >
      </div>
      <p v-if="!documents.length">还没有募集要项，请先在专攻资料库上传。</p>
      <div class="detail-actions">
        <Button @click="goToMajor">前往专攻资料库</Button
        ><Button
          type="primary"
          :disabled="!ids.length || ids.length > 10"
          :loading="busy"
          @click="create"
          >读取并生成待核对草稿</Button
        >
      </div>
      <small
        >本地读取支持文字型 PDF、DOCX、MD、TXT。扫描 PDF 可交给支持图片理解的
        Agent 按页分析；旧 DOC 请先转为 PDF 或 DOCX。</small
      >
    </div>
    <section v-if="jobs.length" class="analysis-jobs">
      <h3>分析任务</h3>
      <Select
        v-accessible-select
        :value="selectedJob?.id"
        :options="
          jobs.map((j) => ({
            value: j.id,
            label: `${new Date(j.createdAt).toLocaleString()} · ${JOB_STATUS_LABELS[j.status]} · ${j.sources.map((s) => s.title).join('、')}`,
          }))
        "
        aria-label="选择募集要项分析任务"
        @change="typeof $event === 'string' && viewJob($event)"
      /><template v-if="selectedJob"
        ><p>
          {{ JOB_STATUS_LABELS[selectedJob.status] }} ·
          {{ selectedJob.sources.length }} 份资料
        </p>
        <p v-if="selectedJob.error" class="form-error">
          {{ selectedJob.error }}
        </p>
        <Button
          v-if="selectedJob.status === 'failed'"
          :loading="busy"
          @click="retry"
          >重新读取</Button
        >
        <div v-if="canRead" class="analysis-agent-actions">
          <a
            class="analysis-package-link"
            :href="`/api/japangrad/analysis/jobs/${selectedJob.id}/package`"
            >下载 Agent 任务包（ZIP）</a
          ><Button :disabled="busy" @click="viewJob(selectedJob.id)"
            >刷新 Agent 回传结果</Button
          >
          <p>
            任务包解压后交给有本地文件能力的 Agent 生成
            result.json，再导入下方。连接 MCP 后可直接回传草稿。
          </p>
          <div class="analysis-import" @dragover.prevent @drop.prevent="drop">
            <label :for="`analysis-result-${majorId}`"
              >拖拽一个结果 JSON 文件到这里，或点击选择文件</label
            ><input
              :id="`analysis-result-${majorId}`"
              ref="fileInput"
              type="file"
              accept=".json,application/json"
              :disabled="busy"
              @change="
                importFile(($event.target as HTMLInputElement).files?.[0])
              "
            />
          </div>
        </div>
        <div class="analysis-proposals">
          <article v-for="item in proposals" :key="item.id">
            <div>
              <strong>{{ item.executor }}</strong
              ><small
                >{{ new Date(item.createdAt).toLocaleString() }} ·
                {{ item.status === 'applied' ? '已采纳' : '待核对' }} ·
                {{
                  Object.values(item.fields).filter(
                    (f) => f?.status === 'found',
                  ).length
                }}
                项已定位</small
              >
            </div>
            <Button :disabled="busy" @click="review(item)">{{
              item.status === 'applied' ? '查看核对记录' : '对照原文核对'
            }}</Button>
          </article>
        </div></template
      >
    </section>
    <section v-if="accepted.length && context" class="analysis-accepted">
      <h3>已确认的报考资料</h3>
      <article v-for="field in accepted" :key="field.id">
        <h4>{{ field.label }}</h4>
        <p>{{ context.requirements.fields[field.id] }}</p>
        <details
          v-if="context.requirements.provenance[field.id]?.evidence.length"
        >
          <summary>查看原文依据</summary>
          <blockquote
            v-for="(e, i) in context.requirements.provenance[field.id]!
              .evidence"
            :key="i"
          >
            <a
              :href="`${fileUrl(e.documentId)}#page=${e.page}`"
              target="_blank"
              rel="noopener noreferrer"
              >来源定位 {{ e.page }} ↗</a
            >
            <p>{{ e.quote }}</p>
          </blockquote>
        </details>
      </article>
    </section>
    <AnalysisReview
      v-if="context"
      v-model:open="reviewOpen"
      :context="context"
      :job="selectedJob"
      :proposal="proposal"
      @applied="applied"
    /><AgentConnections v-model:open="agentOpen" />
  </section>
</template>
<style scoped>
.analysis-setup {
  padding: 20px;
  background: var(--jg-surface);
  border: 1px solid var(--jg-line);
  border-radius: 10px;
  margin: 20px 0;
}
.analysis-setup h3,
.analysis-jobs h3 {
  margin: 0 0 12px;
  font-size: 16px;
}
.analysis-setup p,
.analysis-setup > small {
  color: var(--jg-muted);
  font-size: 13px;
}
.analysis-context-fields {
  display: grid;
  grid-template-columns: 140px 160px minmax(180px, 1fr);
  gap: 16px;
  margin: 18px 0;
}
.analysis-context-fields label {
  display: grid;
  gap: 8px;
  font-size: 13px;
}
.analysis-context-fields :is(.ant-select, .ant-input-number) {
  width: 100%;
}
.analysis-setup .detail-actions {
  margin: 16px 0;
  justify-content: flex-start;
}
.analysis-document-list {
  display: grid;
  gap: 12px;
  margin-top: 16px;
  max-height: 250px;
  overflow: auto;
}
.analysis-document-list .ant-checkbox-wrapper {
  margin: 0;
  align-items: flex-start;
}
.analysis-document-list small,
.analysis-proposals small {
  display: block;
  margin-top: 4px;
  color: var(--jg-muted);
}
.analysis-jobs > .ant-select {
  width: 100%;
}
.analysis-agent-actions {
  padding: 20px 0;
}
.analysis-agent-actions p {
  color: var(--jg-muted);
  font-size: 13px;
}
.analysis-package-link {
  display: inline-block;
  margin-right: 16px;
  color: var(--jg-accent-text);
  text-decoration: underline;
}
.analysis-import {
  position: relative;
  border: 1px dashed var(--jg-border);
  border-radius: 8px;
  padding: 24px;
  text-align: center;
  background: var(--jg-subtle);
}
.analysis-import label {
  display: block;
  cursor: pointer;
}
.analysis-import input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}
.analysis-import:focus-within {
  outline: 2px solid var(--jg-accent);
  outline-offset: 3px;
}
.analysis-proposals {
  display: grid;
  gap: 12px;
  margin-top: 16px;
}
.analysis-proposals article {
  display: flex;
  align-items: center;
  gap: 16px;
  justify-content: space-between;
  padding: 18px;
  border: 1px solid var(--jg-line);
  border-radius: 8px;
  background: var(--jg-surface);
}
.analysis-proposals small {
  font-size: 12px;
}
.analysis-accepted {
  margin-top: 28px;
}
.analysis-accepted > article {
  padding: 16px 0;
  border-bottom: 1px solid var(--jg-line);
}
.analysis-accepted p {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.analysis-accepted details {
  color: var(--jg-muted);
  font-size: 12px;
}
.analysis-accepted summary {
  cursor: pointer;
}
.analysis-accepted blockquote {
  margin: 12px 0;
  padding-left: 12px;
  border-left: 2px solid var(--jg-accent-line);
}
@media (max-width: 680px) {
  .analysis-context-fields {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
