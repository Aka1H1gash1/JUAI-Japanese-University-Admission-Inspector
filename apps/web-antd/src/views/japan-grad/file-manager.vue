<script setup lang="ts">
import type { StoredDocument } from './documents';
import type { StorageQuota } from './foundation-types';

import { computed, ref, watch } from 'vue';

import { App, Button, Input, Modal, Progress, Select } from 'ant-design-vue';

import DocumentArchive from './components/document-archive.vue';
import ListPagination from './components/list-pagination.vue';
import PersonalFileUpload from './components/personal-file-upload.vue';
import { documentReaderPath, fileSize, fileUrl, kindLabels } from './documents';
import { useExplorerStore } from './explorer';
import { jsonOptions, localApi } from './local-api';
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
const storage = ref<StorageQuota>();
const personalUpload = ref(false);
const { modal, message } = App.useApp();
async function removeFile(file: StoredDocument) {
  const refs = await localApi<Array<{ label: string }>>(
    `/documents/${file.id}/references`,
  );
  if (refs.length > 0) {
    message.error(`文件仍被引用：${refs.map((r) => r.label).join('、')}`);
    return;
  }
  modal.confirm({
    title: `删除「${file.title}」？`,
    content: '文件将移入可恢复区。',
    okText: '删除',
    cancelText: '取消',
    okButtonProps: { danger: true },
    async onOk() {
      await localApi(`/documents/${file.id}`, jsonOptions('DELETE', {}));
      await load();
    },
  });
}
const loadError = ref('');
const upload = ref(false);
async function load() {
  try {
    const [index, quota] = await Promise.all([
      localApi<StoredDocument[]>('/documents/index'),
      localApi<StorageQuota>('/storage'),
    ]);
    files.value = index;
    storage.value = quota;
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
    <section v-if="storage" class="storage-summary" aria-label="存储空间">
      <div>
        <strong>存储空间</strong><span>{{ fileSize(storage.used) }} 已使用 · 总配额
          {{ storage.quota === null ? '不限制' : fileSize(storage.quota)
          }}<template v-if="storage.remaining !== null">
            · 剩余 {{ fileSize(storage.remaining) }}</template></span>
      </div>
      <Progress
        v-if="storage.quota !== null"
        :percent="
          Math.min(100, Math.round((storage.used / storage.quota) * 100))
        "
        :show-info="false"
      /><Button @click="personalUpload = true">上传个人文件</Button>
    </section>
    <Modal v-model:open="personalUpload" title="上传个人文件" :footer="null">
      <PersonalFileUpload
        @uploaded="
          personalUpload = false;
          load();
        "
      />
    </Modal>
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
            <th>上传时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in paged" :key="row.file.id">
            <td>{{ row.university?.name || '—' }}</td>
            <td>{{ row.school?.name || '—' }}</td>
            <td>{{ row.major?.name || '—' }}</td>
            <td>{{ row.file.year }}</td>
            <td>
              {{
                row.file.ownerType === 'workspace'
                  ? '个人文件'
                  : kindLabels[row.file.kind]
              }}
            </td>
            <td>
              <RouterLink :to="documentReaderPath(row.file.id)">
                {{ row.file.title }}
</RouterLink><small>{{ row.file.filename }}</small>
            </td>
            <td>{{ fileSize(row.file.size) }}</td>
            <td>{{ row.file.createdAt?.slice(0, 10) }}</td>
            <td>
              <a :href="fileUrl(row.file.id)" download>下载</a>
              <Button type="text" danger @click="removeFile(row.file)">
                删除
              </Button>
            </td>
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
  gap: 10px;
  margin: 17px 0;
}

.file-filters > * {
  flex: 1;
  min-width: 128px;
}

.file-table-scroll {
  overflow-x: auto;
}

.file-table {
  width: 100%;
  min-width: 722px;
  font-size: 11px;
  border-collapse: collapse;
}

.file-table th,
.file-table td {
  padding: 12px 10px;
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
  margin-top: 4px;
  color: var(--jg-muted);
}

.file-manager:deep(h1) {
  font-size: 20px;
}
</style>

<style scoped>
.storage-summary {
  display: grid;
  gap: 12px;
  padding: 20px;
  margin-bottom: 24px;
  background: var(--jg-surface);
  border: 1px solid var(--jg-line);
  border-radius: 10px;
}

.storage-summary > div {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  justify-content: space-between;
  font-size: 12px;
}

.storage-summary .ant-btn {
  justify-self: start;
}
</style>
