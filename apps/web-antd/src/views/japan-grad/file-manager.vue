<script setup lang="ts">
import type { StoredDocument } from './documents';
import type { StorageQuota } from './foundation-types';

import { computed, ref, watch } from 'vue';

import { App, Button, Input, Modal, Progress, Select } from 'ant-design-vue';

import DocumentArchive from './components/document-archive.vue';
import ExplorerIcon from './components/explorer-icon.vue';
import JgLoader from './components/jg-loader.vue';
import ListPagination from './components/list-pagination.vue';
import PersonalFileUpload from './components/personal-file-upload.vue';
import EmptyState from './design-system/empty-state.vue';
import PageHeading from './design-system/page-heading.vue';
import { documentReaderPath, fileSize, fileUrl, kindLabels } from './documents';
import { useExplorerStore } from './explorer';
import { jsonOptions, localApi } from './local-api';
import { vAccessibleSelect } from './select-accessibility';
import { usePagination } from './use-pagination';
const props = defineProps<{ university?: string; guidelinesOnly?: boolean }>();
const store = useExplorerStore();
const universityId = ref(props.university);
const schoolId = ref<string>();
const majorId = ref<string>();
const year = ref<number>();
const kind = ref<string>(props.guidelinesOnly ? 'guidelines' : '');
const query = ref('');
const scope = ref('all');
const advancedFilters = ref(false);
const loading = ref(false);
const percent = computed(() =>
  storage.value?.quota === 0
    ? 100
    : Math.min(
        100,
        Math.round(
          ((storage.value?.used || 0) / (storage.value?.quota || 1)) * 100,
        ),
      ),
);

const files = ref<StoredDocument[]>([]);
const storage = ref<StorageQuota>();
const personalUpload = ref(false);
const uploadBusy = ref(false);
const { modal, message } = App.useApp();
async function removeFile(file: StoredDocument) {
  try {
    const refs = await localApi<Array<{ label: string }>>(
      `/documents/${file.id}/references`,
    );
    if (refs.length > 0) {
      modal.info({
        title: '文件仍在使用',
        content: `请先解除以下引用：${refs.map((r) => r.label).join('、')}`,
        okText: '知道了',
      });
      return;
    }
    modal.confirm({
      title: `删除「${file.title}」？`,
      content: '文件将移入可恢复区。',
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      async onOk() {
        try {
          await localApi(`/documents/${file.id}`, jsonOptions('DELETE', {}));
          message.success('文件已移入可恢复区。');
          await load();
        } catch (error) {
          message.error(error instanceof Error ? error.message : '删除失败');
          throw error;
        }
      },
    });
  } catch (error) {
    message.error(
      error instanceof Error ? error.message : '引用检查失败，请重试',
    );
  }
}
const loadError = ref('');
const upload = ref(false);
async function load() {
  loading.value = true;
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
  } finally {
    loading.value = false;
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
        (scope.value !== 'personal' || r.file.ownerType === 'workspace') &&
        (scope.value !== 'linked' || r.file.ownerType !== 'workspace') &&
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
function clearFilters() {
  query.value = '';
  scope.value = 'all';
  universityId.value = props.university;
  schoolId.value = undefined;
  majorId.value = undefined;
  year.value = undefined;
  kind.value = props.guidelinesOnly ? 'guidelines' : '';
}
const { page, pageSize, total, paged } = usePagination(rows, [
  query,
  scope,
  universityId,
  schoolId,
  majorId,
  year,
  kind,
]);
</script>
<template>
  <section class="file-manager juai-design">
    <PageHeading
      :title="guidelinesOnly ? '募集要项总览' : '文件管理'"
      description="统一保存和查找你的申请资料，文件可在申请目标中关联使用。"
    >
      <template #actions>
        <Button :loading="loading" @click="load">刷新</Button>
        <Button
          v-if="!guidelinesOnly"
          type="primary"
          @click="personalUpload = true"
        >
          <ExplorerIcon name="plus" />上传文件
        </Button>
      </template>
    </PageHeading>
    <section v-if="storage" class="storage-summary" aria-label="存储空间">
      <div class="storage-caption">
        <strong>存储空间</strong><span>{{
          storage.quota === null
            ? '不限制总配额'
            : `共 ${fileSize(storage.quota)}`
        }}</span>
      </div>
      <div class="storage-meter">
        <Progress
          v-if="storage.quota !== null"
          :percent="percent"
          :show-info="false"
          :status="percent >= 100 ? 'exception' : 'normal'"
          :aria-label="`存储空间已使用 ${percent}%`"
        />
        <p>
          <strong>{{ fileSize(storage.used) }}</strong> 已使用<span
            v-if="storage.remaining !== null"
          >
            · 剩余 {{ fileSize(storage.remaining) }}</span>
        </p>
      </div>
    </section>
    <p v-if="loadError" class="form-error" role="alert">
      {{ loadError }} <Button size="small" @click="load">重试</Button>
    </p>
    <div class="file-toolbar">
      <div
        v-if="!guidelinesOnly"
        class="file-scopes"
        role="group"
        aria-label="文件范围"
      >
        <button
          v-for="item in [
            { value: 'all', label: '全部文件' },
            { value: 'personal', label: '个人文件' },
            { value: 'linked', label: '院校资料' },
          ]"
          :key="item.value"
          :aria-pressed="scope === item.value"
          :class="{ active: scope === item.value }"
          @click="scope = item.value"
        >
          {{ item.label }}
        </button>
      </div>
      <Input
        v-model:value="query"
        aria-label="搜索文件"
        placeholder="搜索名称或所属专攻"
        allow-clear
      >
        <template #prefix><ExplorerIcon name="search" /></template>
      </Input>
      <Button
        :aria-expanded="advancedFilters"
        @click="advancedFilters = !advancedFilters"
      >
        筛选与归档
      </Button>
    </div>
    <section
      v-if="advancedFilters"
      class="file-filter-panel"
      aria-label="文件筛选"
    >
      <div class="file-filters">
        <Select
          v-if="!university"
          v-accessible-select
          v-model:value="universityId"
          allow-clear
          aria-label="筛选大学"
          placeholder="全部大学"
          :options="
            store.universities.map((u) => ({ value: u.id, label: u.name }))
          "
        />
        <Select
          v-accessible-select
          v-model:value="schoolId"
          allow-clear
          aria-label="筛选研究科"
          placeholder="全部研究科"
          :options="schools.map((s) => ({ value: s.id, label: s.name }))"
        />
        <Select
          v-accessible-select
          v-model:value="majorId"
          allow-clear
          aria-label="筛选专攻"
          placeholder="全部专攻"
          :options="majors.map((m) => ({ value: m.id, label: m.name }))"
        />
        <Select
          v-accessible-select
          v-model:value="year"
          allow-clear
          aria-label="筛选年份"
          placeholder="全部年份"
          :options="years"
        />
        <Select
          v-if="!guidelinesOnly"
          v-accessible-select
          v-model:value="kind"
          aria-label="筛选文件类型"
          :options="[
            { value: '', label: '全部类型' },
            ...Object.entries(kindLabels).map(([value, label]) => ({
              value,
              label,
            })),
          ]"
        />
      </div>
      <div class="file-filter-actions">
        <Button @click="clearFilters">重置筛选</Button><Button
          v-if="!guidelinesOnly"
          :disabled="!majorId"
          @click="upload = true"
        >
          向所选专攻归档
</Button><span>个人文件上传无需关联专攻。</span>
      </div>
    </section>
    <details v-if="guidelinesOnly" class="file-exam-history">
      <summary>查看原有考试记录</summary>
      <div v-for="major in majors" :key="major.id">
        <article
          v-for="exam in major.examHistory.filter(
            (e) => !year || Number(e.year) === year,
          )"
          :key="exam.id"
        >
          <RouterLink
            :to="`/japan-grad/universities/${store.schools.find((s) => s.id === major.schoolId)?.universityId}/schools/${major.schoolId}/majors/${major.id}`"
          >
            {{ major.name }} · {{ exam.year }} {{ exam.session }}
          </RouterLink>
          <p>{{ exam.subjects || '科目未确认' }}</p>
          <small>{{
            [exam.writtenDate, exam.interviewDate]
              .filter(Boolean)
              .join(' / ') || '日期未确认'
          }}</small>
        </article>
      </div>
    </details>
    <div class="file-list-caption">
      <h2>
        文件 <span>{{ total }}</span>
      </h2>
      <span>按记录年份排序</span>
    </div>
    <JgLoader v-if="loading && !files.length" text="正在读取文件" />
    <div v-else-if="rows.length" class="file-list">
      <article v-for="row in paged" :key="row.file.id" class="file-entry">
        <div class="file-kind" aria-hidden="true">
          {{ row.file.filename.split('.').at(-1)?.toUpperCase() || 'FILE' }}
        </div>
        <div class="file-identity">
          <RouterLink :to="documentReaderPath(row.file.id)">
            {{ row.file.title }}
          </RouterLink>
          <p>
            {{
              row.file.ownerType === 'workspace'
                ? '个人文件'
                : [row.university?.name, row.school?.name, row.major?.name]
                    .filter(Boolean)
                    .join(' / ') || '所属信息待确认'
            }}
          </p>
          <small>{{ row.file.filename }} · {{ kindLabels[row.file.kind] }}</small>
        </div>
        <div class="file-meta">
          <span>{{ fileSize(row.file.size) }}</span><time v-if="row.file.createdAt" :datetime="row.file.createdAt">{{
            row.file.createdAt.slice(0, 10)
          }}</time><span v-else>时间未记录</span>
        </div>
        <div class="file-actions">
          <a
            :href="fileUrl(row.file.id)"
            download
            :aria-label="`下载${row.file.title}`"
            >下载</a><Button
            type="text"
            danger
            :aria-label="`删除${row.file.title}`"
            @click="removeFile(row.file)"
          >
            删除
          </Button>
        </div>
      </article>
    </div>
    <EmptyState
      v-else-if="!loadError"
      :title="files.length ? '没有符合筛选条件的文件' : '还没有保存文件'"
      description="个人文件可直接上传；院校资料也会在这里统一显示。"
    >
      <Button v-if="files.length" @click="clearFilters">重置筛选</Button><Button v-else-if="!guidelinesOnly" @click="personalUpload = true">
        上传第一份文件
      </Button>
    </EmptyState>
    <ListPagination
      v-model:page="page"
      v-model:page-size="pageSize"
      :total="total"
    />
    <Modal
      v-model:open="personalUpload"
      title="上传个人文件"
      :footer="null"
      :closable="!uploadBusy"
      :mask-closable="!uploadBusy"
      :keyboard="!uploadBusy"
      destroy-on-close
    >
      <PersonalFileUpload
        @busy="uploadBusy = $event"
        @uploaded="
          personalUpload = false;
          load();
        "
      />
    </Modal>
    <Modal
      v-model:open="upload"
      title="专攻文件归档"
      :width="900"
      :footer="null"
      destroy-on-close
    >
      <DocumentArchive
        v-if="majorId"
        :key="majorId"
        owner-type="major"
        :owner-id="majorId"
        @changed="load"
      />
    </Modal>
  </section>
</template>
<style scoped>
.storage-summary {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  gap: 32px;
  padding: 20px 24px;
  margin: 16px 0 28px;
  background: var(--jg-subtle);
  border-radius: var(--juai-radius);
}

.storage-caption {
  display: grid;
  gap: 4px;
  align-content: center;
}

.storage-caption span,
.storage-meter p,
.file-meta,
.file-list-caption > span {
  font-size: 12px;
  color: var(--jg-muted);
}

.storage-meter p {
  margin: 4px 0 0;
}

.storage-meter strong {
  font-size: 16px;
  font-variant-numeric: tabular-nums;
  color: var(--jg-text);
}

.file-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.file-toolbar > .ant-input-affix-wrapper {
  flex: 1;
  min-width: 180px;
}

.file-scopes {
  display: flex;
  gap: 4px;
  margin-right: auto;
}

.file-scopes button {
  padding: 7px 12px;
  color: var(--jg-secondary);
  border-radius: 6px;
}

.file-scopes .active {
  font-weight: 600;
  color: var(--jg-accent-text);
  background: var(--jg-subtle);
}

.file-filter-panel {
  padding: 16px;
  margin-top: 16px;
  background: var(--jg-surface);
  border: 1px solid var(--jg-line);
  border-radius: var(--juai-radius);
}

.file-filters {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
}

.file-filter-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin-top: 12px;
}

.file-filter-actions span {
  font-size: 12px;
  color: var(--jg-muted);
}

.file-list-caption {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin: 28px 0 8px;
}

.file-list-caption h2 {
  font-size: 16px;
  font-weight: 600;
}

.file-list-caption h2 span {
  margin-left: 8px;
  font-size: 12px;
  color: var(--jg-muted);
}

.file-entry {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 110px auto;
  gap: 16px;
  align-items: center;
  padding: 18px 0;
  border-bottom: 1px solid var(--jg-line);
}

.file-kind {
  display: grid;
  place-items: center;
  min-height: 44px;
  font-size: 10px;
  font-weight: 600;
  color: var(--jg-accent-text);
  background: var(--jg-subtle);
  border-radius: 6px;
}

.file-identity {
  min-width: 0;
}

.file-identity > a {
  font-size: 14px;
  font-weight: 600;
}

.file-identity p {
  margin: 4px 0;
  font-size: 12px;
  color: var(--jg-secondary);
}

.file-identity small {
  font-size: 11px;
  color: var(--jg-muted);
}

.file-meta {
  display: grid;
  gap: 4px;
  font-variant-numeric: tabular-nums;
}

.file-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 12px;
}

.file-exam-history {
  margin-top: 24px;
  font-size: 12px;
}

.file-exam-history summary {
  cursor: pointer;
}

.file-exam-history article {
  padding: 16px 0;
}

@media (max-width: 720px) {
  .storage-summary {
    grid-template-columns: 1fr;
    gap: 12px;
    padding: 16px;
  }

  .file-toolbar > .ant-input-affix-wrapper {
    flex-basis: 100%;
    order: 2;
  }

  .file-entry {
    grid-template-columns: 36px minmax(0, 1fr);
    gap: 8px 12px;
  }

  .file-meta {
    display: flex;
    flex-wrap: wrap;
    grid-column: 2;
    gap: 12px;
  }

  .file-actions {
    grid-column: 2;
  }

  .file-scopes button {
    min-height: 40px;
    padding: 6px 8px;
  }
}
</style>
