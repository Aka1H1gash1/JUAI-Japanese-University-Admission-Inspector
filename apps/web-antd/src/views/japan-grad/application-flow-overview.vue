<script setup lang="ts">
import type { AdmissionBatch } from './foundation-types';

import { computed, onMounted, onUnmounted, ref } from 'vue';

import { buildPlannerEvents } from './application-calendar';
import { agendaGroups, FLOW_STAGES } from './application-flow-model';
import ExplorerIcon from './components/explorer-icon.vue';
import UniversityLogo from './components/university-logo.vue';
import { useExplorerStore } from './explorer';
import { labContext } from './lab-targets';
import { localApi } from './local-api';

import './application-flow-prototype.css';
interface Summary {
  id: string;
  lab_id: string;
  batch_id: null | string;
  workflow: { currentStage: null | string };
  materials: {
    id: string;
    title: string;
    complete: boolean;
    fileCount: number;
  }[];
}
const store = useExplorerStore();
const rows = ref<Summary[]>([]);
const errorMessage = ref('');
const loading = ref(true);
const batches = ref<Record<string, AdmissionBatch>>({});
const targets = computed(() =>
  store.labs
    .filter((l) => l.wantApply)
    .flatMap((l) => {
      const t = labContext(store, l.id);
      return t ? [t] : [];
    }),
);
const items = computed(() =>
  rows.value.flatMap((row) => {
    const target = targets.value.find((t) => t.lab.id === row.lab_id);
    return target
      ? [
          {
            ...row,
            target,
            batch: row.batch_id ? batches.value[row.batch_id] : undefined,
            pending: row.materials.filter((m) => !m.complete),
            stage:
              FLOW_STAGES.find((s) => s.id === row.workflow.currentStage)
                ?.label || '申请阶段未设置',
          },
        ]
      : [];
  }),
);
const events = computed(() =>
  agendaGroups(
    buildPlannerEvents(targets.value, 'all').filter((e) =>
      ['exam', 'followup', 'interview', 'result', 'written'].includes(e.kind),
    ),
  ),
);
async function load() {
  loading.value = true;
  try {
    await store.load();
    const [summary, lists] = await Promise.all([
      localApi<Summary[]>('/applications/summary'),
      Promise.all(
        [...new Set(targets.value.map((item) => item.major.id))].map((id) =>
          localApi<AdmissionBatch[]>(`/foundation/majors/${id}/batches`),
        ),
      ),
    ]);
    rows.value = summary;
    batches.value = Object.fromEntries(
      lists.flat().map((item) => [item.id, item]),
    );
    errorMessage.value = '';
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '读取申请进度失败';
  } finally {
    loading.value = false;
  }
}
onMounted(() => {
  void load();
  window.addEventListener('focus', load);
  window.addEventListener('juai:application-change', load);
});
onUnmounted(() => {
  window.removeEventListener('focus', load);
  window.removeEventListener('juai:application-change', load);
});
</script>
<template>
  <section class="flow-prototype juai-design">
    <header class="flow-heading">
      <div>
        <p class="flow-eyebrow">修考之路 · 进度摘要</p>
        <h1>申请总览</h1>
        <p class="flow-heading-context">申请阶段、材料缺项与已有考试日程</p>
      </div>
      <RouterLink to="/japan-grad/journey" class="flow-text-action">
        修考之路 <ExplorerIcon name="arrow" />
      </RouterLink>
    </header>
    <p v-if="errorMessage" role="alert" class="flow-alert">
      {{ errorMessage }}
    </p>
    <p v-if="loading" role="status">正在读取申请进度…</p>
    <div class="flow-overview-grid">
      <section class="flow-overview-main">
        <header class="flow-section-heading">
          <h2>我的申请目标</h2>
          <span>{{ items.length }} 个申请目标</span>
        </header>
        <article
          v-for="item in items"
          :key="item.id"
          class="flow-overview-target"
          style="padding-bottom: 24px; border-bottom: 1px solid var(--jg-line)"
        >
          <div class="flow-target-identity">
            <UniversityLogo
              :name="item.target.university.name"
              :catalog-id="item.target.university.catalogId"
              :logo-id="item.target.university.logoId"
            />
            <div>
              <h3>{{ item.target.lab.name }}</h3>
              <p>
                {{ item.target.university.name }} ·
                {{ item.target.major.name }} ·
                {{ item.batch?.label || '未指定招生批次' }}
              </p>
              <p v-if="item.batch">
                考试 {{ item.batch.examDate || '未确认' }} · 面试
                {{ item.batch.interviewDate || '未确认' }}
              </p>
            </div>
            <span class="flow-state-label">{{ item.stage }}</span>
          </div>
          <div class="flow-summary-axis">
            <span
              v-for="stage in FLOW_STAGES"
              :key="stage.id"
              :class="{ 'is-active': stage.id === item.workflow.currentStage }"
              >{{ stage.label }}</span>
          </div>
          <div class="flow-overview-bottom">
            <div v-if="item.materials.length">
              <strong>{{ item.pending.length }}</strong> 项材料待准备 ·
              {{ item.materials.filter((m) => !m.fileCount).length }} 项尚无文件
            </div>
            <div v-else>材料清单尚未建立</div>
            <RouterLink
              :to="`/japan-grad/applications/labs/${item.lab_id}?target=${item.id}`"
              class="flow-text-action"
            >
              继续准备 <ExplorerIcon name="arrow" />
            </RouterLink>
          </div>
          <div class="flow-missing-list">
            <span v-for="material in item.pending" :key="material.id">{{
              material.title
            }}</span>
          </div>
        </article>
        <div v-if="!loading && !items.length" class="flow-empty-copy">
          尚无申请目标。<RouterLink to="/japan-grad/journey">
            前往修考之路选择研究室
          </RouterLink>
        </div>
        <RouterLink
          v-for="target in targets.filter(
            (t) => !rows.some((r) => r.lab_id === t.lab.id),
          )"
          :key="target.lab.id"
          :to="`/japan-grad/applications/labs/${target.lab.id}`"
          class="flow-text-action"
        >
          为 {{ target.lab.name }} 建立申请目标 →
        </RouterLink>
      </section>
      <section class="flow-overview-dates">
        <header class="flow-section-heading">
          <h2>原时间线日程</h2>
          <RouterLink to="/japan-grad/calendar" class="flow-text-action">
            日历 <ExplorerIcon name="arrow" />
          </RouterLink>
        </header>
        <div v-for="event in events" :key="event.id" class="flow-date-entry">
          <span>{{ event.title }}</span><strong>{{ event.start }}</strong><small>{{ event.universityName }} · {{ event.labName }} ·
            原时间线记录，适用范围以原通知为准</small>
        </div>
        <p v-if="!events.length" class="flow-muted">尚无已记录的考试日期。</p>
      </section>
    </div>
  </section>
</template>
