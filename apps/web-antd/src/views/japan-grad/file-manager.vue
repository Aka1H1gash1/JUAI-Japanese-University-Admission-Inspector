<script setup lang="ts">
import type { StoredDocument } from './documents';

import { computed, ref, watch } from 'vue';

import { Button, Input, Select } from 'ant-design-vue';

import DocumentArchive from './components/document-archive.vue';
import ListPagination from './components/list-pagination.vue';
import { documentReaderPath, fileSize, kindLabels } from './documents';
import { useExplorerStore } from './explorer';
import { localApi } from './local-api';
import { usePagination } from './use-pagination';
const props = defineProps<{ university?: string; guidelinesOnly?: boolean }>();
const store = useExplorerStore();
const universityId = ref(props.university);
const schoolId = ref<string>();
const majorId = ref<string>();
const year = ref<number>();
const kind = ref<string>(props.guidelinesOnly ? 'guidelines' : '');
const query = ref('');
const files = ref<StoredDocument[]>([]);
const loadError = ref('');
const upload = ref(false);
async function load() {
  try {
    files.value = await localApi<StoredDocument[]>('/documents/index');
    loadError.value = '';
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '文件读取失败';
  }
}
void load();
watch(
  () => props.university,
  (value) => {
    universityId.value = value;
  },
);
const schools = computed(() =>
  store.schools.filter(
    (s) => !universityId.value || s.universityId === universityId.value,
  ),
);
const majors = computed(() =>
  store.majors.filter(
    (m) =>
      schools.value.some((s) => s.id === m.schoolId) &&
      (!schoolId.value || m.schoolId === schoolId.value),
  ),
);
watch(universityId, () => {
  schoolId.value = undefined;
  majorId.value = undefined;
});
watch(schoolId, () => {
  majorId.value = undefined;
});
function context(file: StoredDocument) {
  const person = store.professors.find(
    (p) => file.ownerType === 'professor' && p.id === file.ownerId,
  );
  const major = store.majors.find(
    (m) => m.id === (person?.majorId || file.ownerId),
  );
  const school = store.schools.find((s) => s.id === major?.schoolId);
  const university = store.universities.find(
    (u) => u.id === school?.universityId,
  );
  return { major, school, university };
}
const rows = computed(() =>
  files.value
    .map((file) => ({ file, ...context(file) }))
    .filter(
      (r) =>
        (!universityId.value || r.university?.id === universityId.value) &&
        (!schoolId.value || r.school?.id === schoolId.value) &&
        (!majorId.value || r.major?.id === majorId.value) &&
        (!year.value || r.file.year === year.value) &&
        (!kind.value || r.file.kind === kind.value) &&
        `${r.file.title} ${r.file.filename} ${r.major?.name} ${r.school?.name}`
          .toLowerCase()
          .includes(query.value.toLowerCase()),
    )
    .toSorted((a, b) => b.file.year - a.file.year),
);
const years = computed(() =>
  [
    ...new Set([
      ...files.value.map((f) => f.year),
      ...store.majors.flatMap((m) => m.examHistory.map((e) => Number(e.year))),
    ]),
  ]
    .toSorted((a, b) => b - a)
    .map((value) => ({ value, label: `${value} 年` })),
);
const { page, pageSize, total, paged } = usePagination(rows, [
  query,
  universityId,
  schoolId,
  majorId,
  year,
  kind,
]);
</script>
<template>
  <section class="explorer-page file-manager">
    <header class="collection-heading">
      <h1>{{ guidelinesOnly ? '募集要项总览' : '文件管理' }}</h1>
      <div>
        <Button @click="load">刷新</Button>
        <Button
          v-if="!guidelinesOnly"
          :disabled="!majorId"
          @click="upload = !upload"
        >
          上传到所选专攻
        </Button>
      </div>
    </header>
    <div class="file-filters">
      <Select
        v-if="!university"
        v-model:value="universityId"
        allow-clear
        placeholder="全部大学"
        :options="
          store.universities.map((u) => ({ value: u.id, label: u.name }))
        "
      />
      <Select
        v-model:value="schoolId"
        allow-clear
        placeholder="全部研究科"
        :options="schools.map((s) => ({ value: s.id, label: s.name }))"
      />
      <Select
        v-model:value="majorId"
        allow-clear
        placeholder="全部专攻"
        :options="
          majors.map((m) => ({
            value: m.id,
            label: schoolId
              ? m.name
              : `${store.schools.find((s) => s.id === m.schoolId)?.name} / ${m.name}`,
          }))
        "
      />
      <Select
        v-model:value="year"
        allow-clear
        placeholder="全部年份"
        :options="years"
      />
      <Select
        v-if="!guidelinesOnly"
        v-model:value="kind"
        :options="[
          { value: '', label: '全部类型' },
          ...Object.entries(kindLabels).map(([value, label]) => ({
            value,
            label,
          })),
        ]"
      />
      <Input v-model:value="query" placeholder="搜索文件" allow-clear />
    </div>
    <p v-if="loadError" role="alert">{{ loadError }}</p>
    <div v-if="guidelinesOnly" class="file-table-scroll">
      <table class="file-table">
        <thead>
          <tr>
            <th>研究科</th>
            <th>专攻</th>
            <th>考试年份</th>
            <th>考试科目</th>
            <th>考试时间</th>
            <th>专攻档案</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="major in majors" :key="major.id">
            <tr
              v-for="exam in major.examHistory.filter(
                (e) => !year || Number(e.year) === year,
              )"
              :key="exam.id"
            >
              <td>
                {{ store.schools.find((s) => s.id === major.schoolId)?.name }}
              </td>
              <td>{{ major.name }}</td>
              <td>{{ exam.year }} {{ exam.session }}</td>
              <td>{{ exam.subjects || '待补充' }}</td>
              <td>
                {{
                  [exam.writtenDate, exam.interviewDate]
                    .filter(Boolean)
                    .join(' / ') || '待补充'
                }}
              </td>
              <td>
                <RouterLink
                  :to="`/japan-grad/universities/${universityId}/schools/${major.schoolId}/majors/${major.id}`"
                >
                  查看详情 →
                </RouterLink>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
    <DocumentArchive
      v-if="upload && majorId"
      :key="majorId"
      owner-type="major"
      :owner-id="majorId"
      @changed="load"
    />
    <div class="file-table-scroll">
      <table class="file-table">
        <thead>
          <tr>
            <th>大学</th>
            <th>研究科</th>
            <th>专攻</th>
            <th>年份</th>
            <th>类型</th>
            <th>文件</th>
            <th>大小</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in paged" :key="row.file.id">
            <td>{{ row.university?.name || '—' }}</td>
            <td>{{ row.school?.name || '—' }}</td>
            <td>{{ row.major?.name || '—' }}</td>
            <td>{{ row.file.year }}</td>
            <td>{{ kindLabels[row.file.kind] }}</td>
            <td>
              <RouterLink :to="documentReaderPath(row.file.id)">
                {{ row.file.title }}
</RouterLink><small>{{ row.file.filename }}</small>
            </td>
            <td>{{ fileSize(row.file.size) }}</td>
          </tr>
          <tr v-if="!rows.length">
            <td colspan="7">暂无匹配文件，请选择专攻上传。</td>
          </tr>
        </tbody>
      </table>
    </div>
    <ListPagination
      v-model:page="page"
      v-model:page-size="pageSize"
      :total="total"
    />
  </section>
</template>
<style scoped>
.file-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 20px 0;
}

.file-filters > * {
  flex: 1;
  min-width: 150px;
}

.file-table-scroll {
  overflow-x: auto;
}

.file-table {
  width: 100%;
  min-width: 850px;
  font-size: 13px;
  border-collapse: collapse;
}

.file-table th,
.file-table td {
  padding: 14px 12px;
  vertical-align: top;
  text-align: left;
  border-bottom: 1px solid var(--jg-line);
}

.file-table th {
  white-space: nowrap;
  background: var(--jg-subtle);
}

.file-table a {
  color: var(--jg-accent-text);
}

.file-table small {
  display: block;
  margin-top: 5px;
  color: var(--jg-muted);
}

.file-manager:deep(h1) {
  font-size: 24px;
}
</style>
