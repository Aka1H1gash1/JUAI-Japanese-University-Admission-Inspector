<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { App, Button, Input } from 'ant-design-vue';

import EntityEditor from './components/entity-editor.vue';
import ExplorerIcon from './components/explorer-icon.vue';
import { useExplorerStore, websiteUrl } from './explorer';

const store = useExplorerStore();
const { message, modal } = App.useApp();
const route = useRoute();
const router = useRouter();
const universityId = computed(() => String(route.params.universityId ?? ''));
const university = computed(() =>
  store.universities.find((item) => item.id === universityId.value),
);
const query = ref('');
const universityEditorOpen = ref(false);
const schoolEditorOpen = ref(false);
const visibleSchools = computed(() => {
  const keyword = query.value.trim().toLowerCase();
  return store
    .schoolsFor(universityId.value)
    .filter((item) =>
      [item.name, item.japaneseName, item.research, item.notes].some((value) =>
        value.toLowerCase().includes(keyword),
      ),
    )
    .toReversed();
});
watch(universityId, () => {
  query.value = '';
});

function deleteUniversity() {
  if (!university.value) return;
  const id = university.value.id;
  const name = university.value.name;
  modal.confirm({
    title: `删除「${name}」？`,
    content: `该大学下的 ${store.schoolsFor(id).length} 个研究科、${store.universityMajors(id).length} 个专攻和 ${store.universityProfessors(id).length} 位老师也会一起删除。`,
    okText: '确认删除',
    cancelText: '取消',
    okButtonProps: { danger: true },
    onOk() {
      store.removeEntity('university', id);
      message.success('大学已删除');
      return router.replace('/japan-grad');
    },
  });
}
</script>

<template>
  <section v-if="university" class="explorer-page">
    <nav class="explorer-breadcrumb" aria-label="当前位置">
      <RouterLink to="/japan-grad">大学清单</RouterLink><ExplorerIcon name="chevron" /><span>{{ university.name }}</span>
    </nav>
    <header class="page-heading detail-heading">
      <div>
        <p class="page-eyebrow">UNIVERSITY / 大学</p>
        <h1>{{ university.name }}</h1>
        <p v-if="university.japaneseName" class="page-description">
          {{ university.japaneseName }}
        </p>
      </div>
      <div class="detail-actions">
        <Button class="icon-button" @click="universityEditorOpen = true">
          <ExplorerIcon name="edit" />编辑大学
</Button><Button
          class="icon-button"
          aria-label="删除大学"
          @click="deleteUniversity"
        >
          <ExplorerIcon name="trash" />
        </Button>
      </div>
    </header>
    <section class="entity-overview" aria-label="大学资料">
      <div class="overview-meta">
        <span><ExplorerIcon name="pin" />{{
            university.location || '所在地尚未填写'
          }}</span><span v-if="university.category" class="category-label">{{
          university.category
        }}</span><a
          v-if="websiteUrl(university.website)"
          :href="websiteUrl(university.website)"
          target="_blank"
          rel="noopener noreferrer"
          ><ExplorerIcon name="globe" />访问大学官网<ExplorerIcon name="link" /></a>
      </div>
      <p v-if="university.notes" class="overview-notes">
        {{ university.notes }}
      </p>
    </section>

    <header class="collection-heading">
      <div>
        <h2>
          研究科<span>{{ store.schoolsFor(university.id).length }}</span>
        </h2>
        <p>整理这所大学中你感兴趣的研究科，再查看下属专攻和老师。</p>
      </div>
      <Button
        type="primary"
        class="icon-button"
        @click="schoolEditorOpen = true"
      >
        <ExplorerIcon name="plus" />新增研究科
      </Button>
    </header>
    <template v-if="store.schoolsFor(university.id).length">
      <Input
        v-model:value="query"
        allow-clear
        class="explorer-search section-search"
        placeholder="搜索研究科或研究领域"
        aria-label="搜索研究科"
      >
        <template #prefix><ExplorerIcon name="search" /></template>
      </Input>
      <div v-if="visibleSchools.length" class="school-grid">
        <RouterLink
          v-for="school in visibleSchools"
          :key="school.id"
          :to="`/japan-grad/universities/${university.id}/schools/${school.id}`"
          class="school-card"
        >
          <div class="school-card-top">
            <span class="entity-symbol"><ExplorerIcon name="book" /></span><ExplorerIcon name="arrow" />
          </div>
          <h3>{{ school.name }}</h3>
          <p v-if="school.japaneseName" class="secondary-name">
            {{ school.japaneseName }}
          </p>
          <p class="school-research">
            {{ school.research || '研究领域待补充' }}
          </p>
          <p v-if="school.notes" class="card-notes">{{ school.notes }}</p>
          <div class="school-card-bottom">
            <span>{{ store.majorsFor(school.id).length }} 个专攻</span>
            <span>{{ store.schoolProfessors(school.id).length }} 位老师</span><span
              v-if="
                store.schoolProfessors(school.id).some((item) => item.favorite)
              "
              class="favorite-count"
              ><ExplorerIcon name="heart" />{{
                store
                  .schoolProfessors(school.id)
                  .filter((item) => item.favorite).length
              }}
              位心仪</span><span class="open-label">查看专攻 →</span>
          </div>
        </RouterLink>
      </div>
      <div v-else class="search-empty">
        <h2>没有找到相关研究科</h2>
        <Button @click="query = ''">清除搜索</Button>
      </div>
    </template>
    <section v-else class="collection-empty">
      <span class="empty-symbol"><ExplorerIcon name="book" /></span>
      <h3>添加第一个研究科</h3>
      <p>先填写名称，就可以开始整理下属专攻。</p>
      <Button class="icon-button" @click="schoolEditorOpen = true">
        <ExplorerIcon name="plus" />添加研究科
      </Button>
    </section>
    <EntityEditor
      v-model:open="universityEditorOpen"
      kind="university"
      :entity-id="university.id"
    />
    <EntityEditor
      v-model:open="schoolEditorOpen"
      kind="school"
      :parent-id="university.id"
      :parent-name="university.name"
    />
  </section>
  <section v-else class="search-empty">
    <h1>这所大学已不存在</h1>
    <p>返回清单查看其他大学。</p>
    <RouterLink to="/japan-grad" class="back-link">返回大学清单 →</RouterLink>
  </section>
</template>
