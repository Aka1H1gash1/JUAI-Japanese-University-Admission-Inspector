<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { App, Button, Input, Modal, Select, Tabs } from 'ant-design-vue';
import { useExplorerStore } from './explorer';
import { geographySearchTerms } from './japan-geography';
import { labComparisonRows, labContext, labPath } from './lab-targets';
import { vAccessibleSelect } from './select-accessibility';
import ExplorerIcon from './components/explorer-icon.vue';
import ResearchLabCard from './components/research-lab-card.vue';
import JourneyLabPicker from './components/journey-lab-picker.vue';
import JourneyContactBoard from './components/journey-contact-board.vue';
import JourneyContactDialog from './components/journey-contact-dialog.vue';
import JourneyTimeline from './components/journey-timeline.vue';
import JourneyTaskPanel from './components/journey-task-panel.vue';
const store = useExplorerStore();
const { message } = App.useApp();
const route = useRoute();
const router = useRouter();
const view = computed({
  get: () =>
    ['contacts', 'timeline'].includes(String(route.query.view))
      ? String(route.query.view)
      : 'targets',
  set: (value: string) => {
    void router.replace({ query: { ...route.query, view: value } });
  },
});
const contactOpen = ref(false);
const contactLabId = ref('');
function manageContact(id: string) {
  contactLabId.value = id;
  contactOpen.value = true;
}
const query = ref('');
const year = ref('latest');
const comparisonOpen = ref(false);
const pickerOpen = ref(false);
const exporting = ref(false);
const selected = ref<string[]>([]);
const targets = computed(() =>
  store.labs
    .filter((lab) => lab.wantApply)
    .flatMap((lab) => {
      const value = labContext(store, lab.id);
      return value ? [value] : [];
    }),
);
const visible = computed(() =>
  targets.value.filter((item) =>
    [
      item.lab.name,
      item.lab.research,
      item.university.name,
      item.major.name,
      item.school.name,
      ...geographySearchTerms(item.university),
      ...item.professors.map((person) => person.name),
    ].some((value) =>
      value.toLowerCase().includes(query.value.trim().toLowerCase()),
    ),
  ),
);
const selectedTargets = computed(() =>
  targets.value.filter((item) => selected.value.includes(item.lab.id)),
);
const rows = computed(() =>
  labComparisonRows(selectedTargets.value, year.value),
);
const universityCount = computed(
  () => new Set(targets.value.map((item) => item.university.id)).size,
);
const yearOptions = computed(() => [
  { label: '各专攻最新记录年份', value: 'latest' },
  ...[
    ...new Set(
      targets.value.flatMap((item) =>
        item.major.examHistory.map((exam) => exam.year),
      ),
    ),
  ]
    .sort()
    .reverse()
    .map((value) => ({ label: `${value} 年`, value })),
]);
watch(
  () => targets.value.map((item) => item.lab.id),
  (ids) => {
    selected.value = selected.value.filter((id) => ids.includes(id));
    if (selected.value.length < 2) comparisonOpen.value = false;
  },
);
watch(yearOptions, (options) => {
  if (!options.some((item) => item.value === year.value)) year.value = 'latest';
});
function select(id: string) {
  if (selected.value.includes(id))
    selected.value = selected.value.filter((item) => item !== id);
  else if (selected.value.length < 6) selected.value.push(id);
  else message.info('一次最多对比 6 个研究室，请先取消一个已选目标。');
}
async function exportWorkbook(scope: 'visible' | 'selected') {
  exporting.value = true;
  try {
    const { downloadJourneyWorkbook } = await import('./journey-export');
    const data = scope === 'selected' ? selectedTargets.value : visible.value;
    downloadJourneyWorkbook(data, year.value);
    message.success(`已导出 ${data.length} 个研究室，包含对比和历年考试明细。`);
  } catch (error) {
    message.error(
      error instanceof Error ? error.message : '导出失败，请重试。',
    );
  } finally {
    exporting.value = false;
  }
}
</script>
<template>
  <section class="explorer-page journey-page">
    <header class="page-heading">
      <div>
        <h1>修考之路<span class="heading-dot">。</span></h1>
        <p class="page-description">
          把想考的研究室放在一起，比较研究方向、报考安排与留学预算。
        </p>
      </div>
      <div class="detail-actions">
        <Button type="primary" class="icon-button" @click="pickerOpen = true"
          ><ExplorerIcon name="plus" />新增研究室</Button
        >
        <Button
          class="icon-button"
          :disabled="!visible.length"
          :loading="exporting"
          @click="exportWorkbook('visible')"
          ><ExplorerIcon name="export" />导出 Excel</Button
        >
      </div>
    </header>
    <template v-if="targets.length">
      <div class="journey-summary">
        <span
          ><strong>{{ targets.length }}</strong> 个想考研究室</span
        ><span
          >来自 <strong>{{ universityCount }}</strong> 所大学</span
        ><button type="button" class="text-button" @click="pickerOpen = true">
          继续添加研究室 →
        </button>
      </div>
      <div class="journey-planning-layout">
        <div class="journey-planning-main">
          <div class="list-toolbar">
            <Input
              v-model:value="query"
              allow-clear
              class="explorer-search"
              placeholder="搜索研究室、大学、方向、地域或老师"
              aria-label="搜索想考研究室"
              ><template #prefix
                ><ExplorerIcon name="search" /></template></Input
            ><Select
              v-accessible-select
              v-model:value="year"
              aria-label="对比与日程考试年份"
              class="journey-year-select"
              :options="yearOptions"
            /><Button
              class="icon-button"
              :disabled="selectedTargets.length < 2"
              @click="comparisonOpen = true"
              ><ExplorerIcon name="compare" />横向对比{{
                selectedTargets.length ? `（${selectedTargets.length}）` : ''
              }}</Button
            >
          </div>
          <div class="list-caption">
            <span
              >当前显示 {{ visible.length }} 个 · 勾选 2–6
              个研究室进行对比</span
            ><span>导出范围为当前搜索结果；考试明细包含历年全部记录</span>
          </div>
          <div v-if="selected.length" class="journey-selection">
            <span>已选 {{ selected.length }} 个研究室</span
            ><Button :loading="exporting" @click="exportWorkbook('selected')"
              >导出所选</Button
            ><Button type="text" @click="selected = []">清空选择</Button>
          </div>
          <Tabs v-model:active-key="view" class="journey-workspace-tabs"
            ><Tabs.TabPane key="targets" tab="研究室清单">
              <div v-if="visible.length" class="research-lab-grid">
                <ResearchLabCard
                  v-for="item in visible"
                  :key="item.lab.id"
                  :lab-id="item.lab.id"
                  show-affiliation
                  selectable
                  :selected="selected.includes(item.lab.id)"
                  @select="select"
                  @contact="manageContact"
                />
              </div>
              <div v-else class="search-empty">
                <ExplorerIcon name="search" />
                <h2>没有符合条件的研究室</h2>
                <Button @click="query = ''">清除搜索</Button>
              </div> </Tabs.TabPane
            ><Tabs.TabPane key="contacts" tab="教授联络看板"
              ><JourneyContactBoard
                v-if="view === 'contacts'"
                :targets="visible"
                @manage="manageContact" /></Tabs.TabPane
            ><Tabs.TabPane key="timeline" tab="时间线与日程"
              ><JourneyTimeline
                v-if="view === 'timeline'"
                :targets="visible"
                :year="year" /></Tabs.TabPane
          ></Tabs>
        </div>
        <JourneyTaskPanel
          :targets="targets"
          :year="year"
          @timeline="
            query = '';
            view = 'timeline';
          "
        />
      </div>
    </template>
    <section v-else class="collection-empty journey-empty">
      <span class="empty-symbol"><ExplorerIcon name="book" /></span>
      <h2>从一个想考的研究室开始</h2>
      <p>直接选择已整理的研究室，建立想考清单，再比较方向、考试和费用。</p>
      <Button type="primary" class="icon-button" @click="pickerOpen = true"
        ><ExplorerIcon name="plus" />新增研究室</Button
      >
    </section>
    <JourneyContactDialog v-model:open="contactOpen" :lab-id="contactLabId" />
    <JourneyLabPicker v-model:open="pickerOpen" @added="query = ''" />
    <Modal
      v-model:open="comparisonOpen"
      title="想考研究室横向对比"
      :width="1280"
      :footer="null"
      class="explorer-comparison-modal"
    >
      <p class="comparison-intro">
        考试信息采用{{
          year === 'latest' ? '各专攻最新已记录年份' : `${year} 年记录`
        }}，同年多个批次分别展示。年度开销不含一次性入学金。
      </p>
      <div class="comparison-scroll">
        <table class="comparison-table">
          <caption class="sr-only">
            所选研究室的方向、预算与报考信息
          </caption>
          <thead>
            <tr>
              <th scope="col">比较项</th>
              <th
                v-for="item in selectedTargets"
                :key="item.lab.id"
                scope="col"
              >
                <RouterLink :to="labPath(item)" @click="comparisonOpen = false"
                  >{{ item.lab.name }} →</RouterLink
                ><small>{{ item.university.name }}</small>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.label">
              <th scope="row">{{ row.label }}</th>
              <td
                v-for="(value, index) in row.values"
                :key="index"
                :class="{ 'is-missing': !value }"
              >
                {{ value || '待填写' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="journey-comparison-footer">
        <span>共 {{ selectedTargets.length }} 个研究室 · 所有金额均为日元</span
        ><Button
          type="primary"
          :loading="exporting"
          @click="exportWorkbook('selected')"
          >导出这份对比（Excel）</Button
        >
      </div>
    </Modal>
  </section>
</template>
