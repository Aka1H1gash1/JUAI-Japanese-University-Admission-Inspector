<script setup lang="ts">
import type { AnalysisJob } from '../analysis-types';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { Button, Input, Select } from 'ant-design-vue';

import { jsonOptions, localApi } from '../local-api';
import { vAccessibleSelect } from '../select-accessibility';
interface Settings {
  ocr: { available: boolean; name: string };
  managed: {
    configured: boolean;
    connectionName: string;
    provider?: { model: string; protocol: string };
    keyConfigured: boolean;
    binding: { enabled: boolean };
  };
}
interface Preview {
  documents: {
    id: string;
    title: string;
    totalPages: number;
    selectedPages: number;
    lowTextPages: number[];
    warnings: string[];
  }[];
  selectedPages: number;
  characters: number;
  lowTextPages: number;
}
interface Run {
  id: string;
  status:
    | 'analyzing'
    | 'cancelled'
    | 'completed'
    | 'failed'
    | 'preparing'
    | 'reading';
  message: string;
  error: string;
  model: string;
  completedBatches: number;
  totalBatches: number;
  processedPages: number;
  totalPages?: number;
  proposalId?: string;
  inputTokens?: number;
  outputTokens?: number;
  createdAt: string;
}

const props = defineProps<{ job: AnalysisJob }>();
const emit = defineEmits<{ updated: []; review: [id: string] }>();
const preview = ref<Preview>();
const runs = ref<Run[]>([]);
const settings = ref<Settings>();
const ranges = ref<Record<string, string>>({});
const scanMode = ref('auto');
const busy = ref(false);
const errorMessage = ref('');
let generation = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
const latest = computed(() => runs.value[0]);
const running = computed(
  () =>
    !!latest.value &&
    ['analyzing', 'preparing', 'reading'].includes(latest.value.status),
);
const modelLabel = computed(
  () =>
    settings.value?.managed.provider?.model ||
    (settings.value?.managed.provider?.protocol === 'codex'
      ? '本机默认模型'
      : ''),
);
const endpoint = computed(() => `/analysis/jobs/${props.job.id}/ai`);
const runLabels = {
  preparing: '准备中',
  reading: '读取原页',
  analyzing: 'AI 提取中',
  completed: '草稿已就绪',
  failed: '提取未完成',
  cancelled: '已停止',
};
async function load() {
  const version = ++generation;
  clearTimeout(timer);
  errorMessage.value = '';
  try {
    const [value, selection] = await Promise.all([
      localApi<Settings>('/analysis/ai/settings'),
      localApi<Preview>(
        `${endpoint.value}/preview`,
        jsonOptions('POST', { ranges: ranges.value }),
      ),
    ]);
    if (version !== generation) return;
    settings.value = value;
    preview.value = selection;
    await poll(version);
  } catch (error) {
    if (version === generation)
      errorMessage.value =
        error instanceof Error ? error.message : 'AI 配置读取失败。';
  }
}
async function poll(version = generation) {
  clearTimeout(timer);
  try {
    const value = await localApi<{ runs: Run[] }>(endpoint.value);
    if (version !== generation) return;
    const previous = latest.value;
    runs.value = value.runs;
    if (
      latest.value?.proposalId &&
      latest.value.proposalId !== previous?.proposalId
    )
      emit('updated');
    if (running.value) timer = setTimeout(() => void poll(version), 2000);
  } catch (error) {
    if (version !== generation) return;
    errorMessage.value =
      error instanceof Error ? error.message : '任务读取失败。';
    if (running.value) timer = setTimeout(() => void poll(version), 5000);
  }
}
watch(
  () => props.job.id,
  () => {
    ranges.value = {};
    runs.value = [];
    void load();
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  generation++;
  clearTimeout(timer);
});
async function updateRange() {
  busy.value = true;
  errorMessage.value = '';
  try {
    preview.value = await localApi<Preview>(
      `${endpoint.value}/preview`,
      jsonOptions('POST', { ranges: ranges.value }),
    );
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '页码范围不正确。';
  } finally {
    busy.value = false;
  }
}
async function start() {
  busy.value = true;
  errorMessage.value = '';
  try {
    const run = await localApi<Run>(
      endpoint.value,
      jsonOptions('POST', {
        mode: 'managed',
        scanMode: scanMode.value,
        ranges: ranges.value,
      }),
    );
    runs.value = [run, ...runs.value.filter((r) => r.id !== run.id)];
    await poll();
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : 'AI 提取启动失败。';
  } finally {
    busy.value = false;
  }
}
async function stop() {
  busy.value = true;
  errorMessage.value = '';
  try {
    await localApi(`${endpoint.value}/stop`, jsonOptions('POST', {}));
    await poll();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '停止失败。';
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <section class="analysis-ai" aria-labelledby="analysis-ai-title">
    <header class="ai-heading">
      <div>
        <span class="ai-eyebrow">DOCUMENT → DRAFT</span>
        <h3 id="analysis-ai-title">让 AI 整理报考要求</h3>
        <p>提取日期、科目、语言要求与材料，逐项附上原文依据。</p>
      </div>
      <span class="ai-step">01 提取 <i>→</i> 02 核对 <i>→</i> 03 填表</span>
    </header>
    <p v-if="errorMessage" class="form-error" role="alert">
      {{ errorMessage }}
    </p>
    <template v-if="settings">
      <div class="ai-connection ai-managed-connection">
        <div>
          <strong>{{
            settings.managed.connectionName ||
            (settings.managed.binding.enabled
              ? '尚未分配 AI 连接'
              : '此功能的 AI 已停用')
          }}</strong>
          <p>
            {{ modelLabel || '在 AI 管理中为募集要项提取选择连接与模型。' }}
          </p>
          <small
            v-if="
              settings.managed.provider?.protocol !== 'codex' &&
              settings.managed.configured &&
              !settings.managed.keyConfigured
            "
            >远程 API 需要先在 AI 管理填写密钥；本地接口可不填。</small>
        </div>
        <RouterLink to="/japan-grad/ai?tab=features">前往 AI 管理 ↗</RouterLink>
      </div>
      <details class="ai-reading-options">
        <summary>
          分析范围与扫描件处理
          <span v-if="preview">{{ preview.selectedPages }} 页 ·
            {{ preview.lowTextPages }} 页文字较少</span>
        </summary>
        <div class="ai-ranges">
          <label v-for="doc in preview?.documents" :key="doc.id"><span>{{ doc.title
              }}<small>共 {{ doc.totalPages }} 页<span v-if="doc.lowTextPages.length">
                  · 文字较少：{{ doc.lowTextPages.slice(0, 20).join('、')
                  }}{{ doc.lowTextPages.length > 20 ? '…' : '' }}</span></small></span><Input
              v-model:value="ranges[doc.id]"
              placeholder="全文；或 1-5,8,12-14"
              :maxlength="1000"
              :disabled="running"
              :aria-label="`${doc.title}的分析页码`"
/></label><Button
            size="small"
            :loading="busy"
            :disabled="running"
            @click="updateRange"
          >
            更新范围统计
          </Button>
        </div>
        <label class="ai-scan-label">页面读取方式<Select
            v-accessible-select
            v-model:value="scanMode"
            :disabled="running"
            :options="[
              { value: 'auto', label: '自动：文字优先，扫描页优先本机 OCR' },
              { value: 'text', label: '仅读取文字层' },
              { value: 'ocr', label: '所有所选页先做本机 OCR' },
              { value: 'vision', label: '所有所选页交给图片模型' },
            ]"
        /></label>
        <p>
          {{
            settings.ocr.available
              ? `本机 OCR 可用：${settings.ocr.name}。识别后仅将文字交给 AI。`
              : '本机日语 OCR 不可用；扫描页可交给支持图片的模型直接识别。'
          }}
        </p>
        <p>
          表格错列或文字乱码时，可以手动改用 OCR / 图片。每次最多 120 页文字、24
          页 OCR 或 18 页图片，AI 请求最多 12 批。留空页码表示全文。
        </p>
      </details>
      <footer class="ai-start">
        <div>
          <strong>{{
            running
              ? latest?.message
              : modelLabel
                ? `使用 ${modelLabel}`
                : '选好模型后开始'
          }}</strong><small>点击后将所选内容交给模型处理；生成草稿后由你确认填表。</small>
        </div>
        <Button v-if="running" :loading="busy" @click="stop">停止提取</Button><Button
          v-else
          type="primary"
          :loading="busy"
          :disabled="!settings.managed.configured"
          @click="start"
        >
          {{ latest ? '重新 AI 提取' : 'AI 提取为草稿' }}
        </Button>
      </footer>
    </template>
    <p v-else>正在读取模型与资料范围…</p>
    <section v-if="latest" class="ai-run" aria-live="polite">
      <div class="ai-run-title">
        <strong>{{ runLabels[latest.status] }}</strong><small>{{ latest.model }} ·
          {{ new Date(latest.createdAt).toLocaleString() }}</small>
      </div>
      <progress
        v-if="running && latest.totalBatches"
        :value="latest.completedBatches"
        :max="latest.totalBatches"
        aria-label="AI 提取进度"
      ></progress>
      <p>{{ latest.message }}</p>
      <p v-if="latest.error" class="form-error">{{ latest.error }}</p>
      <small v-if="latest.totalBatches">完成 {{ latest.completedBatches }} / {{ latest.totalBatches }} 批 ·
        {{ latest.processedPages }} / {{ latest.totalPages }} 页<span
          v-if="latest.inputTokens || latest.outputTokens"
        >
          · 输入 {{ latest.inputTokens || 0 }} / 输出
          {{ latest.outputTokens || 0 }} tokens</span></small>
      <div class="ai-inline">
        <Button
          v-if="latest.proposalId"
          :disabled="running"
          @click="emit('review', latest.proposalId)"
        >
          核对 AI 草稿并填表
</Button><Button type="text" size="small" @click="poll()">刷新状态</Button>
      </div>
      <details v-if="runs.length > 1" class="ai-history">
        <summary>之前的提取记录</summary>
        <article v-for="run in runs.slice(1)" :key="run.id">
          <span>{{ runLabels[run.status] }} · {{ run.model
            }}<small>{{
              new Date(run.createdAt).toLocaleString()
            }}</small></span><Button
            v-if="run.proposalId"
            size="small"
            @click="emit('review', run.proposalId)"
          >
            查看草稿
          </Button>
        </article>
      </details>
    </section>
  </section>
</template>
<style scoped>
.ai-managed-connection {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  padding: 16px 0 0;
}

.ai-managed-connection strong {
  display: block;
  margin-bottom: 5px;
  font-size: 14px;
  color: var(--jg-text);
}

.ai-managed-connection a {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--jg-accent-text);
  text-decoration: underline;
}

@media (max-width: 600px) {
  .ai-managed-connection {
    flex-direction: column;
    align-items: flex-start;
  }
}

.analysis-ai {
  margin: 12px 0 24px;
  overflow: hidden;
  background: var(--jg-surface);
  border: 1px solid var(--jg-accent-line);
  border-radius: 14px;
}

.ai-heading {
  display: flex;
  gap: 20px;
  justify-content: space-between;
  padding: 24px 24px 18px;
  background: var(--jg-accent-soft);
}

.ai-eyebrow {
  font-size: 10px;
  font-weight: 700;
  color: var(--jg-accent-text);
  letter-spacing: 0.16em;
}

.ai-heading h3 {
  margin: 7px 0 6px;
  font-size: 21px;
  color: var(--jg-text);
  letter-spacing: -0.03em;
}

.ai-heading p {
  margin: 0;
  font-size: 13px;
  color: var(--jg-muted);
}

.ai-step {
  align-self: center;
  font-size: 11px;
  color: var(--jg-accent-text);
  white-space: nowrap;
}

.ai-step i {
  margin: 0 8px;
  font-style: normal;
  opacity: 0.5;
}

.analysis-ai > .form-error {
  margin: 16px 24px;
}

.analysis-ai > p {
  padding: 0 24px;
}

.ai-model-options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  min-width: 0;
  padding: 0;
  margin: 20px 24px 0;
  border: 0;
}

.ai-model-options legend {
  margin-bottom: 10px;
  font-size: 12px;
  color: var(--jg-muted);
}

.ai-model-options label {
  display: flex;
  gap: 9px;
  align-items: flex-start;
  min-width: 0;
  padding: 14px 12px;
  cursor: pointer;
  border: 1px solid var(--jg-line);
  border-radius: 9px;
}

.ai-model-options label.selected {
  background: var(--jg-accent-soft);
  border-color: var(--jg-accent);
}

.ai-model-options input {
  margin-top: 3px;
  accent-color: var(--jg-accent);
}

.ai-model-options strong {
  display: block;
  font-size: 13px;
  color: var(--jg-text);
}

.ai-model-options small {
  display: block;
  margin-top: 5px;
  font-size: 11px;
  color: var(--jg-muted);
  overflow-wrap: anywhere;
}

.ai-connection {
  margin: 14px 24px 18px;
  font-size: 12px;
  color: var(--jg-muted);
}

.ai-connection p {
  margin: 0;
}

.ai-connection > small {
  display: block;
  margin-top: 8px;
  font-size: 11px;
}

.ai-inline {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.ai-inline > .ant-select {
  flex: 1;
  min-width: 180px;
}

.ai-reading-options {
  padding-top: 14px;
  margin: 0 24px 18px;
  font-size: 12px;
  border-top: 1px solid var(--jg-line);
}

.ai-reading-options summary {
  color: var(--jg-text);
  cursor: pointer;
}

.ai-reading-options summary > span {
  margin-left: 10px;
  color: var(--jg-muted);
}

.ai-reading-options p {
  margin: 8px 0;
  line-height: 1.7;
  color: var(--jg-muted);
}

.ai-ranges {
  display: grid;
  gap: 12px;
  margin: 16px 0;
}

.ai-ranges > label {
  display: grid;
  grid-template-columns: 1fr minmax(140px, 240px);
  gap: 12px;
  align-items: center;
}

.ai-ranges small {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: var(--jg-muted);
  overflow-wrap: anywhere;
}

.ai-ranges > .ant-btn {
  justify-self: start;
}

.ai-scan-label {
  display: grid;
  gap: 7px;
  max-width: 480px;
}

.ai-start {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-top: 1px solid var(--jg-line);
}

.ai-start strong {
  display: block;
  font-size: 12px;
  overflow-wrap: anywhere;
}

.ai-start small {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: var(--jg-muted);
}

.ai-run {
  padding: 18px 24px;
  background: var(--jg-subtle);
  border-top: 1px solid var(--jg-line);
}

.ai-run-title {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.ai-run-title strong {
  font-size: 13px;
  color: var(--jg-accent-text);
}

.ai-run small {
  font-size: 11px;
  color: var(--jg-muted);
  overflow-wrap: anywhere;
}

.ai-run p {
  margin: 8px 0;
  font-size: 12px;
}

.ai-run .ai-inline {
  margin-top: 12px;
}

.ai-run progress {
  width: 100%;
  height: 5px;
  margin-top: 12px;
  accent-color: var(--jg-accent);
}

.ai-history {
  margin-top: 14px;
  font-size: 12px;
}

.ai-history summary {
  color: var(--jg-muted);
  cursor: pointer;
}

.ai-history article {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid var(--jg-line);
}

.ai-history small {
  display: block;
}

.ai-api-form {
  display: grid;
  gap: 16px;
}

.ai-api-form label:not(.ant-checkbox-wrapper) {
  display: grid;
  gap: 6px;
  font-size: 12px;
}

.ai-api-form p,
.ai-api-form > small {
  font-size: 12px;
  line-height: 1.7;
  color: var(--jg-muted);
}

.ai-api-form .ai-inline {
  justify-content: flex-end;
}

@media (max-width: 760px) {
  .ai-heading {
    flex-direction: column;
    gap: 12px;
  }

  .ai-step {
    align-self: flex-start;
  }

  .ai-model-options {
    grid-template-columns: 1fr;
  }

  .ai-start {
    flex-direction: column;
    align-items: stretch;
  }

  .ai-ranges > label {
    grid-template-columns: 1fr;
  }

  .ai-run-title {
    flex-direction: column;
    gap: 3px;
    align-items: flex-start;
  }
}
</style>
