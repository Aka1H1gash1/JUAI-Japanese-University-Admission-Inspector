<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Button, Input, Select } from 'ant-design-vue';
import {
  cycleLabel,
  CYCLE_STATUS_LABELS,
  useAdmissionsStore,
} from '../admissions';
import type { AdmissionCycle } from '../admissions';
import { useExplorerStore } from '../explorer';
import { vAccessibleSelect } from '../select-accessibility';
import AdmissionCycleEditor from './admission-cycle-editor.vue';
import AgentConnections from './agent-connections.vue';
import ExplorerIcon from './explorer-icon.vue';
const props = defineProps<{ majorId?: string }>();
const admissions = useAdmissionsStore(),
  store = useExplorerStore(),
  route = useRoute(),
  router = useRouter();
const editorOpen = ref(false),
  agentOpen = ref(false),
  query = ref(''),
  year = ref('');
onMounted(() => void admissions.load());
const scopeMajor = computed(
  () =>
    props.majorId ||
    (typeof route.query.majorId === 'string' ? route.query.majorId : ''),
);
const rows = computed(() =>
  admissions.cycles.filter(
    (c) =>
      (!scopeMajor.value || c.majorId === scopeMajor.value) &&
      (!year.value || String(c.intakeYear) === year.value) &&
      `${cycleLabel(c)} ${affiliation(c)} ${c.labIds.map((id) => store.labs.find((l) => l.id === id)?.name).join(' ')}`
        .toLowerCase()
        .includes(query.value.trim().toLowerCase()),
  ),
);
const years = computed(() =>
  [...new Set(admissions.cycles.map((c) => c.intakeYear))]
    .sort((a, b) => b - a)
    .map((value) => ({ value: String(value), label: `${value} 年入学` })),
);
function affiliation(c: AdmissionCycle) {
  const major = store.majors.find((m) => m.id === c.majorId);
  const school = store.schools.find((s) => s.id === major?.schoolId);
  return `${store.universities.find((u) => u.id === school?.universityId)?.name ?? ''} / ${major?.name ?? ''}`;
}
function path(c: AdmissionCycle) {
  return {
    path: `/japan-grad/admissions/${c.id}`,
    query:
      typeof route.query.documentId === 'string'
        ? { documentId: route.query.documentId, tab: 'analysis' }
        : {},
  };
}
function saved(c: AdmissionCycle) {
  void router.push(path(c));
}
</script>
<template>
  <section class="admission-cycle-list">
    <header class="collection-heading">
      <div>
        <h2>
          申请年度与批次 <span class="count-tag">{{ rows.length }}</span>
        </h2>
        <p>为每一轮入学申请独立保存要求、材料与结果。</p>
      </div>
      <div class="detail-actions">
        <Button @click="agentOpen = true">Agent 工作区接入</Button
        ><Button
          type="primary"
          :disabled="!store.majors.length"
          class="icon-button"
          @click="editorOpen = true"
          ><ExplorerIcon name="plus" />新增申请轮次</Button
        >
      </div>
    </header>
    <div class="list-toolbar">
      <Input
        v-model:value="query"
        allow-clear
        placeholder="搜索大学、研究室、选拔类别或批次"
        aria-label="搜索申请轮次"
      /><Select
        v-accessible-select
        :value="year || undefined"
        :options="years"
        allow-clear
        placeholder="全部入学年份"
        aria-label="筛选入学年份"
        @change="year = typeof $event === 'string' ? $event : ''"
      />
    </div>
    <p v-if="admissions.error" class="form-error" role="alert">
      {{ admissions.error }}
      <Button size="small" @click="admissions.load">重试</Button>
    </p>
    <p v-if="admissions.loading">正在读取申请轮次…</p>
    <div v-else-if="rows.length" class="cycle-list-rows">
      <RouterLink
        v-for="c in rows"
        :key="c.id"
        :to="path(c)"
        class="cycle-list-row"
        ><div>
          <strong>{{ cycleLabel(c) }}</strong
          ><small>{{ affiliation(c) }}</small
          ><small>{{
            c.labIds
              .map((id) => store.labs.find((l) => l.id === id)?.name)
              .filter(Boolean)
              .join('、') || '尚未关联研究室'
          }}</small>
        </div>
        <div>
          <span class="cycle-state">{{ CYCLE_STATUS_LABELS[c.status] }}</span
          ><small
            >出愿：{{
              [c.fields.applicationStart, c.fields.applicationEnd]
                .filter(Boolean)
                .join(' ～ ') || '待填写'
            }}</small
          >
        </div>
        <ExplorerIcon name="arrow"
      /></RouterLink>
    </div>
    <div v-else class="search-empty">
      <h3>{{ query || year ? '没有符合条件的申请轮次' : '建立第一轮申请' }}</h3>
      <p>选择专攻、入学年度与选拔类别，再读取对应募集要项。</p>
      <Button
        v-if="query || year"
        @click="
          query = '';
          year = '';
        "
        >清除筛选</Button
      ><Button
        v-else
        :disabled="!store.majors.length"
        @click="editorOpen = true"
        >新增申请轮次</Button
      >
    </div>
    <AdmissionCycleEditor
      v-model:open="editorOpen"
      :major-id="scopeMajor || undefined"
      @saved="saved"
    /><AgentConnections v-model:open="agentOpen" />
  </section>
</template>
<style scoped>
.cycle-list-rows {
  display: grid;
  border: 1px solid var(--jg-line);
  border-radius: 10px;
  overflow: hidden;
  background: var(--jg-surface);
}
.cycle-list-row {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(180px, 1fr) 24px;
  gap: 20px;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid var(--jg-line);
}
.cycle-list-row:last-child {
  border-bottom: 0;
}
.cycle-list-row:hover {
  background: var(--jg-subtle);
}
.cycle-list-row strong {
  color: var(--jg-text);
}
.cycle-list-row small {
  display: block;
  margin-top: 6px;
  color: var(--jg-muted);
  overflow-wrap: anywhere;
}
.cycle-state {
  color: var(--jg-accent-text);
}
.list-toolbar {
  margin: 20px 0;
}
.list-toolbar > .ant-input-affix-wrapper {
  max-width: 520px;
}
.list-toolbar > .ant-select {
  width: 200px;
}
@media (max-width: 700px) {
  .cycle-list-row {
    grid-template-columns: minmax(0, 1fr) 24px;
    gap: 10px;
  }
  .cycle-list-row > div:nth-child(2) {
    grid-column: 1;
  }
  .cycle-list-row > svg {
    grid-column: 2;
    grid-row: 1 / 3;
  }
}
</style>
