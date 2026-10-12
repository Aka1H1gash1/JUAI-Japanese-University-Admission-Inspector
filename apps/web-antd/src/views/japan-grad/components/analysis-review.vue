<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { App, Button, Checkbox, Input, Modal } from 'ant-design-vue';
import type {
  AdmissionCycle,
  AdmissionFieldId,
  AnalysisJob,
  AnalysisProposal,
  Evidence,
} from '../admissions';
import {
  ADMISSION_FIELDS,
  cycleLabel,
  PROPOSAL_STATUS_LABELS,
  useAdmissionsStore,
} from '../admissions';
import { fileUrl } from '../documents';
import { jsonOptions, localApi } from '../local-api';
const props = defineProps<{
  cycle: AdmissionCycle;
  job?: AnalysisJob;
  proposal?: AnalysisProposal;
}>();
const open = defineModel<boolean>('open', { default: false });
const emit = defineEmits<{ applied: [cycle: AdmissionCycle] }>();
const admissions = useAdmissionsStore(),
  { message } = App.useApp();
const selected = ref<AdmissionFieldId[]>([]),
  values = ref<Partial<Record<AdmissionFieldId, string>>>({}),
  acknowledged = ref(false),
  allowReplace = ref(false),
  createTasks = ref(false),
  busy = ref(false),
  feedback = ref('');
const documentId = ref(''),
  page = ref(1),
  sourceText = ref(''),
  sourceLoading = ref(false),
  sourceError = ref('');
let generation = 0;
const rows = computed(() =>
  ADMISSION_FIELDS.filter((field) => props.proposal?.fields[field.id]),
);
const source = computed(() =>
  props.job?.sources.find((s) => s.id === documentId.value),
);
const pdf = computed(() =>
  source.value?.filename.toLowerCase().endsWith('.pdf'),
);
const replacing = computed(() =>
  selected.value.some(
    (key) =>
      props.cycle.fields[key] &&
      props.cycle.fields[key] !== values.value[key]?.trim(),
  ),
);
const canApply = computed(
  () =>
    props.proposal?.status === 'pending' &&
    selected.value.length > 0 &&
    selected.value.every((key) => values.value[key]?.trim()) &&
    acknowledged.value &&
    (!replacing.value || allowReplace.value),
);
watch(open, (value) => {
  if (!value) {
    generation++;
    return;
  }
  selected.value = [];
  values.value = Object.fromEntries(
    Object.entries(props.proposal?.fields ?? {}).map(([key, item]) => [
      key,
      item?.value ?? '',
    ]),
  );
  acknowledged.value = allowReplace.value = createTasks.value = false;
  feedback.value = '';
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
      `/admissions/jobs/${props.job.id}/pages?documentId=${documentId.value}&start=${page.value}&count=1`,
    );
    if (current === generation)
      sourceText.value = data.pages
        .map(
          (p) =>
            `${p.locator}\n\n${p.text || '此页没有可读取文字，请查看 PDF 页面图像。'}`,
        )
        .join('\n');
  } catch (e) {
    if (current === generation)
      sourceError.value = e instanceof Error ? e.message : '原文读取失败。';
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
    const result = await localApi<{ cycle: AdmissionCycle }>(
      `/admissions/proposals/${props.proposal.id}/apply`,
      jsonOptions('POST', {
        revision: props.cycle.revision,
        fields: Object.fromEntries(
          selected.value.map((key) => [key, values.value[key]?.trim()]),
        ),
        allowReplace: allowReplace.value,
        createTasks: createTasks.value,
      }),
    );
    admissions.upsert(result.cycle);
    open.value = false;
    emit('applied', result.cycle);
    message.success('所选要求已采纳到本轮申请');
  } catch (e) {
    feedback.value = e instanceof Error ? e.message : '采纳失败。';
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <Modal
    v-model:open="open"
    title="核对募集要项提取草稿"
    :width="1320"
    :footer="null"
    :closable="!busy"
    :mask-closable="!busy"
    :keyboard="!busy"
  >
    <template v-if="proposal && job"
      ><p class="analysis-review-context">
        {{ cycleLabel(job.context) }}<br />执行器：{{ proposal.executor }} ·
        {{ proposal.status === 'applied' ? '已采纳' : '待逐项核对' }}
      </p>
      <div class="analysis-review-body">
        <aside class="analysis-original">
          <header>
            <strong>{{ source?.title || '原始资料' }}</strong
            ><a
              v-if="source"
              :href="`${fileUrl(source.id)}#page=${page}`"
              target="_blank"
              rel="noopener noreferrer"
              >打开原文件 ↗</a
            >
          </header>
          <iframe
            v-if="source && pdf"
            :key="`${source.id}-${page}`"
            :src="`${fileUrl(source.id)}#page=${page}`"
            :title="`${source.title} 第 ${page} 页`"
          />
          <pre v-else-if="!sourceLoading">{{ sourceText }}</pre>
          <p v-if="sourceLoading">正在读取原文…</p>
          <p v-if="sourceError" class="form-error">{{ sourceError }}</p>
        </aside>
        <section class="analysis-proposed">
          <ul v-if="proposal.warnings.length" class="analysis-warnings">
            <li v-for="(warning, i) in proposal.warnings" :key="i">
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
                >{{ field.label }}</Checkbox
              ><span>{{
                PROPOSAL_STATUS_LABELS[proposal.fields[field.id]!.status]
              }}</span>
            </header>
            <p class="analysis-current">
              当前值：{{ cycle.fields[field.id] || '未填写' }}
            </p>
            <Input.TextArea
              v-model:value="values[field.id]"
              :rows="field.date || field.money ? 2 : 3"
              :maxlength="field.max"
              :disabled="busy || proposal.status === 'applied'"
              :aria-label="`${field.label}核对后的内容`"
              placeholder="核对后可修改或手动补充；空值不会采纳"
              @change="acknowledged = false"
            />
            <div
              v-for="(evidence, i) in proposal.fields[field.id]!.evidence"
              :key="i"
              class="analysis-evidence"
            >
              <Button type="link" size="small" @click="locate(evidence)"
                >{{
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
                }}</Button
              >
              <blockquote>{{ evidence.quote }}</blockquote>
            </div>
            <small v-if="!proposal.fields[field.id]!.evidence.length"
              >尚无原文依据，补录后将记录为人工核对修改。</small
            >
          </article>
        </section>
      </div>
      <footer
        v-if="proposal.status === 'pending'"
        class="analysis-review-footer"
      >
        <Checkbox v-model:checked="acknowledged" :disabled="busy"
          >我已核对所选字段的来源、年度与选拔类别</Checkbox
        ><Checkbox
          v-if="replacing"
          v-model:checked="allowReplace"
          :disabled="busy"
          >确认替换所选字段的已有内容</Checkbox
        ><Checkbox
          v-if="selected.includes('applicationMaterials')"
          v-model:checked="createTasks"
          :disabled="busy"
          >按核对后的材料内容逐行生成本轮清单</Checkbox
        >
        <p v-if="feedback" class="form-error" role="alert">{{ feedback }}</p>
        <div>
          <span>已选 {{ selected.length }} 项 · 未选字段保留当前内容</span
          ><Button :disabled="busy" @click="open = false">关闭</Button
          ><Button
            type="primary"
            :disabled="!canApply"
            :loading="busy"
            @click="apply"
            >采纳所选要求</Button
          >
        </div>
      </footer>
      <footer v-else class="form-footer">
        <span>本草稿已采纳，结果和出处保存在本轮申请中。</span
        ><Button @click="open = false">关闭</Button>
      </footer>
    </template>
  </Modal>
</template>
<style scoped>
.analysis-review-context {
  color: var(--jg-muted);
  font-size: 13px;
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
  border: 1px solid var(--jg-line);
  border-radius: 8px;
  overflow: hidden;
}
.analysis-original header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px;
  padding: 12px;
  font-size: 12px;
}
.analysis-original iframe {
  flex: 1;
  width: 100%;
  border: 0;
  min-height: 0;
}
.analysis-original pre {
  padding: 16px;
  margin: 0;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-family: inherit;
}
.analysis-proposed {
  overflow: auto;
  padding-right: 8px;
}
.analysis-warnings {
  margin: 0 0 16px;
  padding: 12px 12px 12px 28px;
  color: var(--jg-warning);
  background: var(--jg-subtle);
  font-size: 12px;
}
.analysis-field {
  padding: 16px 0;
  border-bottom: 1px solid var(--jg-line);
}
.analysis-field > header {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.analysis-field header > span {
  font-size: 12px;
  color: var(--jg-muted);
}
.analysis-current {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 12px;
  color: var(--jg-muted);
  max-height: 90px;
  overflow: auto;
}
.analysis-evidence blockquote {
  margin: 6px 0;
  padding-left: 12px;
  border-left: 2px solid var(--jg-accent-line);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 12px;
  color: var(--jg-secondary);
  max-height: 140px;
  overflow: auto;
}
.analysis-evidence :deep(.ant-btn) {
  height: auto;
  white-space: normal;
  text-align: left;
}
.analysis-field > small {
  display: block;
  margin-top: 8px;
  color: var(--jg-muted);
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
