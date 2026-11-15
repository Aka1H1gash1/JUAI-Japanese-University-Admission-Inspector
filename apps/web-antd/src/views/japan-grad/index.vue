<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import { App, Button, Checkbox, Input, Select } from 'ant-design-vue';

import EntityCreateFlow from './components/entity-create-flow.vue';
import ExplorerIcon from './components/explorer-icon.vue';
import ListPagination from './components/list-pagination.vue';
import ProfileExportDialog from './components/profile-export-dialog.vue';
import UniversityComparison from './components/university-comparison.vue';
import UniversityLogo from './components/university-logo.vue';
import { useExplorerStore } from './explorer';
import {
  compactUniversityLocation,
  geographySearchTerms,
} from './japan-geography';
import { vAccessibleSelect } from './select-accessibility';
import { universityDisplayGeography } from './university-catalog';
import { usePagination } from './use-pagination';

const store = useExplorerStore();
const { message } = App.useApp();
const query = ref('');
const order = ref('recent');
const editorOpen = ref(false);
const reportOpen = ref(false);
const comparisonOpen = ref(false);
const selectedIds = ref<string[]>([]);
const selectedUniversities = computed(() =>
  store.universities.filter((item) => selectedIds.value.includes(item.id)),
);
const visibleUniversities = computed(() => {
  const keyword = query.value.trim().toLowerCase();
  const results = store.universities.filter((item) =>
    [
      item.name,
      item.japaneseName,
      item.location,
      item.region,
      ...geographySearchTerms(item),
      item.qsRank,
      item.japanRank || '',
      item.category,
      item.notes,
      ...store
        .schoolsFor(item.id)
        .flatMap((school) => [school.name, school.research]),
      ...store
        .universityMajors(item.id)
        .flatMap((major) => [major.name, major.research]),
      ...store
        .universityLabs(item.id)
        .flatMap((lab) => [lab.name, lab.research]),
      ...store
        .universityProfessors(item.id)
        .flatMap((professor) => [professor.name, professor.research]),
    ].some((value) => value.toLowerCase().includes(keyword)),
  );
  return order.value === 'name'
    ? results.toSorted((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    : results.toReversed();
});
watch(
  () => store.universities.map((item) => item.id),
  (ids) => {
    selectedIds.value = selectedIds.value.filter((id) => ids.includes(id));
  },
);

function toggleCompare(id: string) {
  if (selectedIds.value.includes(id))
    selectedIds.value = selectedIds.value.filter((item) => item !== id);
  else if (selectedIds.value.length < 4) selectedIds.value.push(id);
  else message.info('一次最多对比 4 所大学，请先取消一个已选目标。');
}
const { page, pageSize, total, paged } = usePagination(visibleUniversities, [
  query,
  order,
]);
</script>

<template>
  <section class="juai-design juai-stack university-collection-page">
    <header class="juai-entity-toolbar">
      <div>
        <h1 class="workspace-title" style="font-size: 28px">大学清单</h1>
      </div>
      <div class="detail-actions">
        <Button
          :disabled="!store.universities.length"
          @click="reportOpen = true"
        >
          导出大学信息
        </Button>
        <Button
          type="primary"
          size="large"
          class="icon-button"
          @click="editorOpen = true"
        >
          <ExplorerIcon name="plus" />新增大学
        </Button>
      </div>
    </header>

    <template v-if="store.universities.length">
      <div class="list-toolbar">
        <Input
          v-model:value="query"
          allow-clear
          class="explorer-search"
          placeholder="搜索大学、所在地、研究方向或老师"
          aria-label="搜索大学"
        >
          <template #prefix><ExplorerIcon name="search" /></template>
        </Input>
        <Select
          v-accessible-select
          v-model:value="order"
          aria-label="大学排序"
          class="sort-select"
          :options="[
            { label: '最近添加', value: 'recent' },
            { label: '按名称排列', value: 'name' },
          ]"
        />
        <Button
          :disabled="selectedIds.length < 2"
          class="icon-button"
          @click="comparisonOpen = true"
        >
          <ExplorerIcon name="compare" />对比所选{{
            selectedIds.length ? ` (${selectedIds.length})` : ''
          }}
        </Button>
      </div>

      <div v-if="visibleUniversities.length" class="juai-university-grid">
        <article
          v-for="university in paged"
          :key="university.id"
          class="juai-university-entry"
          :class="{ 'is-selected': selectedIds.includes(university.id) }"
        >
          <RouterLink
            :to="`/japan-grad/universities/${university.id}`"
            :aria-label="`查看${university.name}详情`"
          />
          <div class="juai-university-identity">
            <UniversityLogo
              :catalog-id="university.catalogId"
              :logo-id="university.logoId"
              :name="university.name"
            />
            <div>
              <h2>{{ university.name }}</h2>
              <p
                v-if="
                  university.japaneseName &&
                  university.japaneseName !== university.name
                "
              >
                {{ university.japaneseName }}
              </p>
            </div>
          </div>
          <div class="juai-tags">
            <span>{{ university.category || '类型未确认' }}</span><span>{{
              compactUniversityLocation(
                universityDisplayGeography(university),
              ) || '所在地未确认'
            }}</span>
          </div>
          <div class="juai-university-footer">
            <span>{{ store.schoolsFor(university.id).length }} 个研究科</span><span>{{ store.universityMajors(university.id).length }} 个专攻</span><span>查看大学 →</span>
          </div>
          <Checkbox
            :checked="selectedIds.includes(university.id)"
            :aria-label="`加入对比：${university.name}`"
            @change="toggleCompare(university.id)"
          />
        </article>
      </div>
      <div v-else class="search-empty">
        <ExplorerIcon name="search" />
        <h2>没有找到相关大学</h2>
        <p>试试其他名称、所在地或研究方向。</p>
        <Button @click="query = ''">清除搜索</Button>
      </div>
      <ListPagination
        v-model:page="page"
        v-model:page-size="pageSize"
        :total="total"
      />
      <div v-if="selectedIds.length" class="comparison-tray">
        <div class="tray-label">
          <ExplorerIcon name="compare" /><span>待对比</span>
        </div>
        <div class="tray-targets">
          <button
            v-for="item in selectedUniversities"
            :key="item.id"
            :aria-label="`取消对比：${item.name}`"
            @click="toggleCompare(item.id)"
          >
            {{ item.name }}<ExplorerIcon name="close" />
          </button>
        </div>
        <button class="text-button" @click="selectedIds = []">清空</button><Button
          type="primary"
          :disabled="selectedIds.length < 2"
          @click="comparisonOpen = true"
        >
          开始对比
        </Button>
      </div>
    </template>

    <section v-else class="welcome-empty">
      <span class="empty-symbol"><ExplorerIcon name="building" /></span>
      <h2>从一所大学开始</h2>
      <p>
        添加你感兴趣的大学，再为它整理研究科、专攻与研究室。<br />你的择校清单，由你自己建立。
      </p>
      <div class="empty-journey">
        <span><ExplorerIcon name="building" />大学</span><ExplorerIcon name="chevron" /><span><ExplorerIcon name="book" />研究科</span><ExplorerIcon name="chevron" /><span><ExplorerIcon name="book" />专攻</span><ExplorerIcon name="chevron" /><span><ExplorerIcon name="folder" />研究室</span><ExplorerIcon name="chevron" /><span><ExplorerIcon name="user" />老师</span>
      </div>
    </section>
    <ProfileExportDialog
      v-model:open="reportOpen"
      scope="university"
      :universities="store.universities"
      :initial-ids="
        selectedIds.length ? selectedIds : visibleUniversities.map((u) => u.id)
      "
    />
    <EntityCreateFlow v-model:open="editorOpen" kind="university" />
    <UniversityComparison v-model:open="comparisonOpen" :ids="selectedIds" />
  </section>
</template>
