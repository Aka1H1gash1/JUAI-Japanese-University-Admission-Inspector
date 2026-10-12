<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { App, Button, Checkbox, Select } from 'ant-design-vue';
import type {
  AdmissionCycle,
  AnalysisJob,
  AnalysisProposal,
  AdmissionContext,
} from '../admissions';
import { JOB_STATUS_LABELS } from '../admissions';
import type { StoredDocument } from '../documents';
import { jsonOptions, localApi } from '../local-api';
import { vAccessibleSelect } from '../select-accessibility';
import AnalysisReview from './analysis-review.vue';
import AgentConnections from './agent-connections.vue';
const props = defineProps<{ cycle: AdmissionCycle }>();
const emit = defineEmits<{ updated: [cycle: AdmissionCycle] }>();
const route = useRoute(),
  router = useRouter(),
  { message } = App.useApp();
const documents = ref<StoredDocument[]>([]),
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
let generation = 0,
  timer: ReturnType<typeof setTimeout> | undefined;
const canRead = computed(
  () =>
    selectedJob.value &&
    ['ready', 'awaiting_review'].includes(selectedJob.value.status),
);
async function load() {
  const current = ++generation;
  loading.value = true;
  feedback.value = '';
  clearTimeout(timer);
  try {
    const [docs, detail] = await Promise.all([
      localApi<StoredDocument[]>(
        `/documents?ownerType=major&ownerId=${props.cycle.majorId}`,
      ),
      localApi<AdmissionContext & { jobs: AnalysisJob[] }>(
        `/admissions/cycles/${props.cycle.id}`,
      ),
    ]);
    if (current !== generation) return;
    documents.value = docs.filter((d) => d.kind === 'guidelines');
    jobs.value = detail.jobs.toSorted((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
    const requested =
      typeof route.query.documentId === 'string' ? route.query.documentId : '';
    if (requested && documents.value.some((d) => d.id === requested))
      ids.value = [requested];
    const nextId = selectedJob.value?.id || jobs.value[0]?.id;
    if (nextId) await viewJob(nextId);
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
    }>(`/admissions/jobs/${id}`);
    if (current !== generation) return;
    selectedJob.value = result.job;
    proposals.value = result.proposals;
    const index = jobs.value.findIndex((j) => j.id === result.job.id);
    if (index >= 0) jobs.value[index] = result.job;
    if (['queued', 'parsing'].includes(result.job.status))
      timer = setTimeout(() => void viewJob(id), 2500);
  } catch (e) {
    if (current === generation)
      feedback.value = e instanceof Error ? e.message : '任务读取失败。';
  }
}
watch(
  () => props.cycle.id,
  () => {
    selectedJob.value = undefined;
    ids.value = [];
    jobs.value = [];
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
}
async function create() {
  busy.value = true;
  feedback.value = '';
  try {
    const result = await localApi<AnalysisJob>(
      '/admissions/jobs',
      jsonOptions('POST', { cycleId: props.cycle.id, documentIds: ids.value }),
    );
    jobs.value.unshift(result);
    await viewJob(result.id);
    message.success('已创建读取任务，完成后可核对本地草稿或交给 Agent 分析。');
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
      `/admissions/jobs/${selectedJob.value.id}/retry`,
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
      `/admissions/jobs/${selectedJob.value.id}/proposals`,
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
function review(item: AnalysisProposal) {
  proposal.value = item;
  reviewOpen.value = true;
}
async function applied(cycle: AdmissionCycle) {
  emit('updated', cycle);
  if (selectedJob.value) await viewJob(selectedJob.value.id);
}
async function goToMajor() {
  const { university, school, major } = await localApi<AdmissionContext>(
    `/admissions/cycles/${props.cycle.id}`,
  );
  await router.push(
    `/japan-grad/universities/${university.id}/schools/${school.id}/majors/${major.id}`,
  );
}
</script>
<template>
  <section class="admission-analysis">
    <header class="collection-heading">
      <div>
        <h2>募集要项分析</h2>
        <p>先读取原文，再核对要求；Agent 与本地读取使用同一套草稿格式。</p>
      </div>
      <div class="detail-actions">
        <Button :disabled="busy || loading" @click="load">刷新任务</Button
        ><Button @click="agentOpen = true">连接我的 Agent</Button>
      </div>
    </header>
    <p v-if="feedback" class="form-error" role="alert">{{ feedback }}</p>
    <p v-if="loading">正在读取资料与分析任务…</p>
    <div class="analysis-setup">
      <h3>选择本轮资料</h3>
      <p>
        请确认文件中的年度、学位和选拔类别；可同时选择通则、专攻补充说明与修订通知。
      </p>
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
            :href="`/api/japangrad/admissions/jobs/${selectedJob.id}/package`"
            >下载 Agent 任务包（ZIP）</a
          ><Button :disabled="busy" @click="viewJob(selectedJob.id)"
            >刷新 Agent 回传结果</Button
          >
          <p>
            任务包解压后交给有本地文件能力的 Agent，按目录中的说明生成
            result.json，再导入下方。连接 MCP 后 Agent
            可直接读取页面并回传草稿。
          </p>
          <div
            class="analysis-import"
            :aria-disabled="busy"
            @dragover.prevent
            @drop.prevent="drop"
          >
            <label :for="`analysis-result-${cycle.id}`"
              >拖拽一个结果 JSON 文件到这里，或点击选择文件</label
            ><input
              :id="`analysis-result-${cycle.id}`"
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
    <AnalysisReview
      v-model:open="reviewOpen"
      :cycle="cycle"
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
</style>
