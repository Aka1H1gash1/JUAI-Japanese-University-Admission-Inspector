<script setup lang="ts">
import type { Professor } from './explorer';
import type { LabTarget } from './lab-targets';

import { computed, ref, watch } from 'vue';

import { useStorage } from '@vueuse/core';
import { Button, Checkbox, Input, Select } from 'ant-design-vue';

import {
  CONTACT_LABELS,
  normalizedContact,
  primaryProfessor,
} from './application-planning';
import EntityEditor from './components/entity-editor.vue';
import ListPagination from './components/list-pagination.vue';
import ProfileExportDialog from './components/profile-export-dialog.vue';
import { useExplorerStore } from './explorer';
import { labContext, labLanguageRequirements, labPath } from './lab-targets';
import { foreignStudentLabel } from './profile-report';
import { usePagination } from './use-pagination';
const store = useExplorerStore();
const entity = ref('labs');
const query = ref('');
const universityId = ref('');
const view = useStorage<'cards' | 'rows'>('juai-lab-overview-view', 'cards');
const editingId = ref('');
const editorOpen = ref(false);
const exportOpen = ref(false);
const initialIds = ref<string[]>([]);
const selected = ref<string[]>([]);
const targets = computed(() =>
  store.labs.flatMap((l) => {
    const t = labContext(store, l.id);
    return t ? [t] : [];
  }),
);
interface Entry {
  id: string;
  title: string;
  research: string;
  target: LabTarget;
  professor?: Professor;
}
const entries = computed<Entry[]>(() =>
  entity.value === 'teachers'
    ? targets.value.flatMap((t) =>
        t.professors.map((p) => ({
          id: p.id,
          title: p.name,
          research: p.research || t.lab.research,
          target: t,
          professor: p,
        })),
      )
    : targets.value.map((t) => ({
        id: t.lab.id,
        title: t.lab.name,
        research: t.lab.research,
        target: t,
      })),
);
const visible = computed(() =>
  entries.value.filter(
    (e) =>
      (!universityId.value || e.target.university.id === universityId.value) &&
      [
        e.title,
        e.research,
        e.target.lab.name,
        e.target.university.name,
        e.target.school.name,
        e.target.major.name,
        ...e.target.professors.map((p) => p.name),
      ]
        .join(' ')
        .toLowerCase()
        .includes(query.value.trim().toLowerCase()),
  ),
);
const { page, pageSize, total, paged } = usePagination(visible, [
  entity,
  query,
  universityId,
]);
const teacherCount = computed(() =>
  targets.value.reduce((n, t) => n + t.professors.length, 0),
);
watch(targets, (list) => {
  const ids = new Set(list.map((t) => t.lab.id));
  selected.value = selected.value.filter((id) => ids.has(id));
});
function toggle(id: string) {
  selected.value = selected.value.includes(id)
    ? selected.value.filter((v) => v !== id)
    : [...selected.value, id];
}
function path(e: Entry) {
  return (
    labPath(e.target) + (e.professor ? `/professors/${e.professor.id}` : '')
  );
}
function stage(e: Entry) {
  return CONTACT_LABELS[
    normalizedContact((e.professor || primaryProfessor(e.target))?.contact)
      .status
  ];
}
function edit(id: string) {
  editingId.value = id;
  editorOpen.value = true;
}
function openExport() {
  initialIds.value = [
    ...new Set(
      selected.value.length > 0
        ? selected.value
        : visible.value.map((e) => e.target.lab.id),
    ),
  ];
  exportOpen.value = true;
}
</script>
<template>
  <section class="explorer-page lab-overview">
    <header class="page-heading">
      <div>
        <h1>老师与研究室</h1>
        <p class="page-description">
          {{ targets.length }} 个备选研究室 · {{ teacherCount }} 位老师
        </p>
      </div>
      <div class="overview-actions">
        <RouterLink to="/japan-grad/journey">前往心仪研究室与细筛 ↗</RouterLink><Button :disabled="!targets.length" @click="openExport">
          导出备选研究室
        </Button>
      </div>
    </header>
    <div class="overview-toolbar">
      <Select
        v-model:value="entity"
        aria-label="概览对象"
        :options="[
          { value: 'labs', label: '研究室' },
          { value: 'teachers', label: '老师' },
        ]"
      /><Select
        v-model:value="universityId"
        aria-label="概览大学"
        :options="[
          { value: '', label: '全部大学' },
          ...store.universities.map((u) => ({ value: u.id, label: u.name })),
        ]"
      /><Input
        v-model:value="query"
        placeholder="搜索学校、研究方向、研究室或老师"
        aria-label="搜索老师和研究室"
        allow-clear
      />
      <div class="overview-view-switch" role="group" aria-label="显示方式">
        <Button
          :type="view === 'cards' ? 'primary' : 'default'"
          :aria-pressed="view === 'cards'"
          @click="view = 'cards'"
        >
          卡片
</Button><Button
          :type="view === 'rows' ? 'primary' : 'default'"
          :aria-pressed="view === 'rows'"
          @click="view = 'rows'"
        >
          横栏
        </Button>
      </div>
    </div>
    <p class="overview-caption">
      共 {{ total }} {{ entity === 'labs' ? '个研究室' : '位老师'
      }}<span v-if="selected.length">
        · 已选 {{ selected.length }} 个研究室
        <Button type="link" size="small" @click="selected = []">清空</Button></span>
      · 导出按研究室整理，包含关联老师。
    </p>
    <div v-if="view === 'cards'" class="overview-card-grid">
      <article v-for="e in paged" :key="e.id" class="overview-card">
        <header>
          <Checkbox
            :checked="selected.includes(e.target.lab.id)"
            :aria-label="`选择研究室：${e.target.lab.name}`"
            @change="toggle(e.target.lab.id)"
          /><span class="overview-stage">{{ stage(e) }}</span>
        </header>
        <h2>
          <RouterLink :to="path(e)">{{ e.title }}</RouterLink>
        </h2>
        <p v-if="e.professor" class="overview-teacher-lab">
          {{ e.target.lab.name }} · {{ e.professor.title }}
        </p>
        <p class="overview-affiliation">
          {{ e.target.university.name }} / {{ e.target.school.name }} /
          {{ e.target.major.name }}
        </p>
        <section>
          <h3>研究方向</h3>
          <p class="overview-research" :title="e.research">
            {{ e.research || '待确认' }}
          </p>
        </section>
        <dl>
          <div>
            <dt>外国人学生</dt>
            <dd>
              {{ foreignStudentLabel(e.target.lab.foreignStudentStatus) }}
              <a
                v-if="e.target.lab.foreignStudentSource"
                :href="e.target.lab.foreignStudentSource"
                target="_blank"
                rel="noopener noreferrer"
                >来源 ↗</a>
            </dd>
          </div>
          <div>
            <dt>
              语言要求<span
                v-if="
                  !e.target.lab.languageRequirements &&
                  e.target.major.languageRequirements
                "
              >
                · 专攻</span>
            </dt>
            <dd>{{ labLanguageRequirements(e.target) || '待确认' }}</dd>
          </div>
        </dl>
        <footer>
          <Button type="text" @click="edit(e.target.lab.id)">编辑概况</Button><Button
            :type="e.target.lab.wantApply ? 'primary' : 'default'"
            @click="store.toggleWantApply(e.target.lab.id)"
          >
            {{ e.target.lab.wantApply ? '已加入心仪' : '加入心仪' }}
          </Button>
        </footer>
      </article>
    </div>
    <div v-else class="overview-row-scroll">
      <table class="overview-row-table">
        <thead>
          <tr>
            <th>选择</th>
            <th>{{ entity === 'labs' ? '研究室' : '老师' }}</th>
            <th>学校与专攻</th>
            <th>研究方向</th>
            <th>外国人学生</th>
            <th>语言要求</th>
            <th>阶段</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in paged" :key="e.id">
            <td>
              <Checkbox
                :checked="selected.includes(e.target.lab.id)"
                :aria-label="`选择研究室：${e.target.lab.name}`"
                @change="toggle(e.target.lab.id)"
              />
            </td>
            <td>
              <RouterLink :to="path(e)">{{ e.title }}</RouterLink><small v-if="e.professor">{{ e.target.lab.name }}</small>
            </td>
            <td>
              {{ e.target.university.name
              }}<small>{{ e.target.school.name }} / {{ e.target.major.name }}</small>
            </td>
            <td>{{ e.research || '待确认' }}</td>
            <td>
              {{ foreignStudentLabel(e.target.lab.foreignStudentStatus) }}
            </td>
            <td>{{ labLanguageRequirements(e.target) || '待确认' }}</td>
            <td>{{ stage(e) }}</td>
            <td>
              <Button type="text" @click="edit(e.target.lab.id)">编辑</Button><Button
                type="text"
                @click="store.toggleWantApply(e.target.lab.id)"
              >
                {{ e.target.lab.wantApply ? '已心仪' : '加入心仪' }}
              </Button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <section v-if="!visible.length" class="search-empty">
      <h2>暂无匹配的{{ entity === 'labs' ? '研究室' : '老师' }}</h2>
      <RouterLink to="/japan-grad/universities">
        从大学档案添加研究室与老师 →
      </RouterLink>
    </section>
    <ListPagination
      v-model:page="page"
      v-model:page-size="pageSize"
      :total="total"
    />
    <EntityEditor
      v-model:open="editorOpen"
      kind="lab"
      :entity-id="editingId"
      :parent-id="store.labs.find((l) => l.id === editingId)?.majorId"
    />
    <ProfileExportDialog
      v-model:open="exportOpen"
      scope="shortlist"
      :targets="targets"
      :initial-ids="initialIds"
    />
  </section>
</template>
<style scoped>
.overview-actions,
.overview-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.overview-actions > a {
  font-size: 11px;
  color: var(--jg-accent-text);
}

.overview-toolbar {
  margin: 17px 0;
}

.overview-toolbar > .ant-select {
  min-width: 128px;
}

.overview-toolbar > .ant-input-affix-wrapper {
  flex: 1;
  min-width: 187px;
}

.overview-view-switch {
  display: flex;
  gap: 5px;
}

.overview-caption {
  margin: 12px 0;
  font-size: 11px;
  color: var(--jg-muted);
}

.overview-card-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 15px;
  align-items: start;
}

.overview-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 19px;
  background: var(--jg-surface);
  border: 1px solid var(--jg-line);
  border-radius: 14px;
}

.overview-card header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 15px;
}

.overview-stage {
  padding: 3px 7px;
  font-size: 11px;
  color: var(--jg-accent-text);
  background: var(--jg-accent-soft);
  border-radius: 5px;
}

.overview-card h2 {
  margin: 0 0 8px;
  font-size: 17px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.overview-card h2 a {
  color: var(--jg-text);
}

.overview-teacher-lab,
.overview-affiliation {
  font-size: 11px;
  line-height: 1.8;
  color: var(--jg-muted);
}

.overview-card section {
  margin: 10px 0;
}

.overview-card h3,
.overview-card dt {
  font-size: 11px;
  font-weight: 400;
  color: var(--jg-muted);
}

.overview-language {
  display: -webkit-box;
  overflow: hidden;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

.overview-research {
  display: -webkit-box;
  margin: 6px 0;
  overflow: hidden;
  -webkit-line-clamp: 3;
  font-size: 11px;
  line-height: 1.8;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  -webkit-box-orient: vertical;
}

.overview-card dl {
  display: grid;
  gap: 12px;
}

.overview-card dd {
  margin: 4px 0 0;
  font-size: 11px;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.overview-card dd a {
  font-size: 11px;
}

.overview-card footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 14px;
  margin-top: 14px;
  border-top: 1px solid var(--jg-line);
}

.overview-row-scroll {
  overflow: auto;
}

.overview-row-table {
  width: 100%;
  min-width: 918px;
  font-size: 11px;
  table-layout: fixed;
  border-collapse: collapse;
}

.overview-row-table th,
.overview-row-table td {
  padding: 14px 10px;
  line-height: 1.8;
  vertical-align: top;
  text-align: left;
  overflow-wrap: anywhere;
  border-bottom: 1px solid var(--jg-line);
}

.overview-row-table th {
  font-weight: 500;
  background: var(--jg-subtle);
}

.overview-row-table th:first-child {
  width: 48px;
}

.overview-row-table th:nth-child(2) {
  width: 18%;
}

.overview-row-table th:nth-child(3) {
  width: 18%;
}

.overview-row-table th:nth-child(4) {
  width: 20%;
}

.overview-row-table th:last-child {
  width: 94px;
}

.overview-row-table small {
  display: block;
  color: var(--jg-muted);
}

.overview-row-table a {
  color: var(--jg-accent-text);
}

@media (max-width: 1200px) {
  .overview-card-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 680px) {
  .overview-card-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .overview-toolbar > .ant-select {
    flex: 1;
  }

  .overview-actions {
    gap: 8px;
  }
}
</style>
