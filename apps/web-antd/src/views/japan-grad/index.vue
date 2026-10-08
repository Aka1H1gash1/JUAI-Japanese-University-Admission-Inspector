<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import { App, Button, Checkbox, Input, Select } from 'ant-design-vue';

import EntityEditor from './components/entity-editor.vue';
import ExplorerIcon from './components/explorer-icon.vue';
import UniversityComparison from './components/university-comparison.vue';
import { useExplorerStore } from './explorer';

const store = useExplorerStore();
const { message } = App.useApp();
const query = ref('');
const order = ref('recent');
const editorOpen = ref(false);
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
      item.notes,
      ...store
        .schoolsFor(item.id)
        .flatMap((school) => [school.name, school.research]),
      ...store
        .universityMajors(item.id)
        .flatMap((major) => [major.name, major.research]),
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
</script>

<template>
  <section class="explorer-page">
    <header class="page-heading">
      <div>
        <p class="page-eyebrow">UNIVERSITY EXPLORER</p>
        <h1>我的大学清单<span class="heading-dot">。</span></h1>
        <p class="page-description">
          整理想了解的大学，逐步找到适合自己的研究科、专攻和老师。
        </p>
      </div>
      <Button
        type="primary"
        size="large"
        class="icon-button"
        @click="editorOpen = true"
      >
        <ExplorerIcon name="plus" />新增大学
      </Button>
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
      <div class="list-caption">
        <span>{{
          query
            ? `找到 ${visibleUniversities.length} 所大学`
            : `${store.universities.length} 所大学`
        }}</span><span>勾选 2–4 所大学，放在一起比较</span>
      </div>

      <div v-if="visibleUniversities.length" class="university-grid">
        <article
          v-for="university in visibleUniversities"
          :key="university.id"
          class="university-card"
          :class="{ 'is-selected': selectedIds.includes(university.id) }"
        >
          <div class="card-topline">
            <span class="entity-symbol"><ExplorerIcon name="building" /></span><Checkbox
              :checked="selectedIds.includes(university.id)"
              :aria-label="`加入对比：${university.name}`"
              @change="toggleCompare(university.id)"
            >
              对比
            </Checkbox>
          </div>
          <RouterLink
            :to="`/japan-grad/universities/${university.id}`"
            class="university-title-link"
          >
            <h2>{{ university.name }}</h2>
            <p>{{ university.japaneseName || '日文名称待补充' }}</p>
          </RouterLink>
          <div class="university-meta">
            <span><ExplorerIcon name="pin" />{{
                university.location || '所在地待补充'
              }}</span><span v-if="university.category" class="category-label">{{
              university.category
            }}</span>
          </div>
          <p class="card-notes">
            {{ university.notes || '留下你关注这所大学的理由。' }}
          </p>
          <div class="university-content-count">
            <span><strong>{{ store.schoolsFor(university.id).length }}</strong>研究科</span>
            <span><strong>{{
                store.universityMajors(university.id).length
              }}</strong>专攻</span><span><strong>{{
                store.universityProfessors(university.id).length
              }}</strong>老师</span><span
              v-if="
                store
                  .universityProfessors(university.id)
                  .some((item) => item.favorite)
              "
              class="favorite-count"
              ><ExplorerIcon name="heart" />{{
                store
                  .universityProfessors(university.id)
                  .filter((item) => item.favorite).length
              }}
              位心仪</span>
          </div>
          <RouterLink
            :to="`/japan-grad/universities/${university.id}`"
            class="card-open-link"
          >
            查看研究科<ExplorerIcon name="arrow" />
          </RouterLink>
        </article>
        <button class="add-university-tile" @click="editorOpen = true">
          <span class="add-tile-icon"><ExplorerIcon name="plus" /></span><strong>再添加一所大学</strong><span>把值得了解的选择放在一起</span>
        </button>
      </div>
      <div v-else class="search-empty">
        <ExplorerIcon name="search" />
        <h2>没有找到相关大学</h2>
        <p>试试其他名称、所在地或研究方向。</p>
        <Button @click="query = ''">清除搜索</Button>
      </div>
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
      <div class="empty-university-art" aria-hidden="true">
        <span class="art-roof"></span><span class="art-tower"><i></i><i></i><i></i></span><span class="art-building art-left"><i></i><i></i><i></i></span><span class="art-building art-right"><i></i><i></i><i></i></span><span class="art-ground"></span>
      </div>
      <p class="empty-eyebrow">YOUR NEXT CHAPTER</p>
      <h2>从一所大学开始</h2>
      <p>
        添加你感兴趣的大学，再为它整理研究科、专攻和老师。<br />你的择校清单，由你自己建立。
      </p>
      <Button
        type="primary"
        size="large"
        class="icon-button"
        @click="editorOpen = true"
      >
        <ExplorerIcon name="plus" />添加第一所大学
      </Button>
      <div class="empty-journey">
        <span><ExplorerIcon name="building" />大学</span><ExplorerIcon name="chevron" /><span><ExplorerIcon name="book" />研究科</span><ExplorerIcon name="chevron" /><span><ExplorerIcon name="book" />专攻</span><ExplorerIcon name="chevron" /><span><ExplorerIcon name="user" />心仪老师</span>
      </div>
    </section>
    <EntityEditor v-model:open="editorOpen" kind="university" />
    <UniversityComparison v-model:open="comparisonOpen" :ids="selectedIds" />
  </section>
</template>
