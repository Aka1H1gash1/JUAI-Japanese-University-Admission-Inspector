<script setup lang="ts">
import type { University } from '../explorer';
import type { LabTarget } from '../lab-targets';
import type { ReportDetail, ReportScope, ReportStage } from '../profile-report';

import { computed, ref, watch } from 'vue';

import { App, Button, Checkbox, Input, Modal, Select } from 'ant-design-vue';

import { useExplorerStore } from '../explorer';
import {
  buildProfileReport,
  REPORT_STAGES,
  REPORT_TITLES,
} from '../profile-report';
import { createProfileWorkbook, downloadReport } from '../profile-report-files';
const props = defineProps<{
  scope: ReportScope;
  universities?: University[];
  targets?: LabTarget[];
  initialIds?: string[];
}>();
const open = defineModel<boolean>('open', { default: false });
const store = useExplorerStore();
const { message } = App.useApp();
const busy = ref<'' | 'pdf' | 'xlsx'>('');
const detail = ref<ReportDetail>('overview');
const ids = ref<string[]>([]);
const query = ref('');
const stage = ref<ReportStage>('auto');
const year = ref('latest');
const entries = computed(() =>
  props.scope === 'university'
    ? (props.universities || []).map((u) => ({
        id: u.id,
        title: u.name,
        caption: u.location,
      }))
    : (props.targets || []).map((t) => ({
        id: t.lab.id,
        title: t.lab.name,
        caption: `${t.university.name} / ${t.major.name}`,
      })),
);
const visible = computed(() =>
  entries.value.filter((e) =>
    `${e.title} ${e.caption}`
      .toLowerCase()
      .includes(query.value.trim().toLowerCase()),
  ),
);
const years = computed(() => [
  { value: 'latest', label: '各专攻最新年份' },
  ...[
    ...new Set(
      (props.targets || []).flatMap((t) =>
        t.major.examHistory.map((e) => e.year),
      ),
    ),
  ]
    .toSorted()
    .toReversed()
    .map((value) => ({ value, label: `${value} 年` })),
]);
const report = computed(() =>
  ids.value.some((id) => entries.value.some((e) => e.id === id))
    ? buildProfileReport({
        scope: props.scope,
        detail: detail.value,
        stage: stage.value,
        year: year.value,
        universities: (props.universities || []).filter((u) =>
          ids.value.includes(u.id),
        ),
        targets: (props.targets || []).filter((t) =>
          ids.value.includes(t.lab.id),
        ),
        schoolNames: (id) => store.schoolsFor(id).map((s) => s.name),
      })
    : undefined,
);
watch(open, (value) => {
  if (!value) return;
  query.value = '';
  const known = new Set(entries.value.map((e) => e.id));
  ids.value = (
    props.initialIds?.length ? props.initialIds : entries.value.map((e) => e.id)
  )
    .filter((id) => known.has(id))
    .slice(0, 100);
  detail.value = props.scope === 'favorites' ? 'stage' : 'overview';
  stage.value = 'auto';
  year.value = 'latest';
});
function toggle(id: string) {
  if (ids.value.includes(id)) ids.value = ids.value.filter((v) => v !== id);
  else if (ids.value.length < 100) ids.value.push(id);
  else message.info('单次最多100项。');
}
async function download(format: 'pdf' | 'xlsx') {
  if (busy.value || !report.value) return;
  busy.value = format;
  try {
    const snapshot = report.value;
    let bytes: Uint8Array;
    if (format === 'xlsx') bytes = createProfileWorkbook(snapshot);
    else {
      const { createProfilePdf } = await import('../profile-report-pdf');
      bytes = await createProfilePdf(snapshot);
    }
    downloadReport(bytes, snapshot, format);
    message.success(
      `已生成${snapshot.records.length}份档案的${format === 'pdf' ? 'PDF' : 'Excel'}文件。`,
    );
  } catch (error) {
    message.error(error instanceof Error ? error.message : '导出失败');
  } finally {
    busy.value = '';
  }
}
</script>
<template>
  <Modal
    v-model:open="open"
    :title="`导出${REPORT_TITLES[scope]}`"
    :width="960"
    :body-style="{ maxHeight: '76vh', overflowY: 'auto' }"
    :mask-closable="!busy"
  >
    <div class="profile-export-options">
      <label>详细程度<Select
          v-model:value="detail"
          :options="[
            { value: 'overview', label: '概览版 · 快速比较' },
            { value: 'stage', label: '阶段版 · 当前重点' },
            { value: 'detailed', label: '详细版 · 清单与来源' },
          ]"
/></label><label v-if="scope !== 'university'">报告用途<Select
          v-model:value="stage"
          :options="[
            { value: 'auto', label: '按主要联系老师的阶段自动匹配' },
            ...Object.entries(REPORT_STAGES).map(([value, label]) => ({
              value,
              label,
            })),
          ]"
/></label><label v-if="scope !== 'university'">考试年份<Select v-model:value="year" :options="years" /></label>
    </div>
    <p class="export-hint">
      {{
        scope === 'university'
          ? '导出大学概况、研究科与费用；详细版补充备注。'
          : '阶段版围绕选校、联络、面试、出愿或结果整理；不会改写档案阶段。'
      }}
      单次最多100项。
    </p>
    <Input
      v-model:value="query"
      placeholder="搜索要导出的档案"
      aria-label="搜索导出档案"
      allow-clear
    />
    <div class="profile-export-selection">
      <div>
        <Button
          size="small"
          @click="
            ids = [...new Set([...ids, ...visible.map((e) => e.id)])].slice(
              0,
              100,
            )
          "
        >
          选择当前结果
</Button><Button size="small" @click="ids = []">清空</Button><span>已选 {{ ids.length }} / {{ entries.length }}</span>
      </div>
      <section>
        <label v-for="e in visible" :key="e.id"><Checkbox
            :checked="ids.includes(e.id)"
            @change="toggle(e.id)"
          /><span><strong>{{ e.title }}</strong><small>{{ e.caption }}</small></span></label>
      </section>
    </div>
    <section v-if="report" class="profile-export-preview">
      <header>
        <strong>内容预览</strong><span>{{ report.records.length }}份档案 · {{ report.date }}</span>
      </header>
      <h3>{{ report.records[0]?.title }}</h3>
      <p>{{ report.records[0]?.subtitle }} · {{ report.records[0]?.stage }}</p>
      <div v-for="s in report.records[0]?.sections" :key="s.title">
        <h4>{{ s.title }}</h4>
        <dl>
          <template v-for="r in s.rows" :key="r.label">
            <dt>{{ r.label }}</dt>
            <dd>
              {{
                String(r.value).length > 240
                  ? `${String(r.value).slice(0, 240)}…（预览节选）`
                  : String(r.value)
              }}
            </dd>
          </template>
        </dl>
      </div>
    </section>
    <template #footer>
      <footer class="profile-export-footer">
        <span>PDF保留可搜索的中日文文本。首次生成需加载字体。</span>
        <div>
          <slot name="extra"></slot><Button
            :disabled="!ids.length || !!busy"
            :loading="busy === 'xlsx'"
            @click="download('xlsx')"
          >
            导出 Excel
</Button><Button
            type="primary"
            :disabled="!ids.length || !!busy"
            :loading="busy === 'pdf'"
            @click="download('pdf')"
          >
            导出 PDF
          </Button>
        </div>
      </footer>
    </template>
  </Modal>
</template>
<style scoped>
.profile-export-options {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin: 10px 0;
}

.profile-export-options label {
  display: grid;
  flex: 1;
  gap: 5px;
  min-width: 162px;
}

.export-hint {
  font-size: 11px;
  line-height: 1.8;
  color: var(--jg-muted);
}

.profile-export-selection {
  margin: 14px 0;
}

.profile-export-selection > div {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 10px;
  font-size: 11px;
}

.profile-export-selection > section {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
  max-height: 187px;
  overflow: auto;
}

.profile-export-selection label {
  display: flex;
  gap: 7px;
  align-items: start;
  padding: 8px;
  border: 1px solid var(--jg-line);
  border-radius: 7px;
}

.profile-export-selection small {
  display: block;
  font-size: 11px;
  color: var(--jg-muted);
}

.profile-export-preview {
  padding: 20px;
  background: var(--jg-subtle);
  border: 1px solid var(--jg-line);
  border-radius: 10px;
}

.profile-export-preview header {
  display: flex;
  gap: 8px;
  justify-content: space-between;
  font-size: 11px;
  color: var(--jg-muted);
}

.profile-export-preview h3 {
  margin: 14px 0 7px;
  font-size: 17px;
}

.profile-export-preview p {
  font-size: 11px;
  color: var(--jg-secondary);
}

.profile-export-preview h4 {
  margin: 17px 0 8px;
  font-size: 12px;
}

.profile-export-preview dl {
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr);
  gap: 7px 14px;
  font-size: 11px;
  line-height: 1.8;
}

.profile-export-preview dt {
  color: var(--jg-muted);
}

.profile-export-preview dd {
  margin: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.profile-export-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  margin-top: 17px;
}

.profile-export-footer > span {
  font-size: 11px;
  color: var(--jg-muted);
}

.profile-export-footer > div {
  display: flex;
  gap: 8px;
}

@media (max-width: 640px) {
  .profile-export-selection > section {
    grid-template-columns: minmax(0, 1fr);
  }

  .profile-export-preview {
    padding: 14px;
  }

  .profile-export-preview dl {
    grid-template-columns: minmax(0, 1fr);
    gap: 3px;
  }

  .profile-export-preview dd {
    margin-bottom: 7px;
  }
}
</style>
