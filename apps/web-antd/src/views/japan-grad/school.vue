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
const university = computed(() =>
  store.universities.find((item) => item.id === route.params.universityId),
);
const school = computed(() =>
  store.schools.find(
    (item) =>
      item.id === route.params.schoolId &&
      item.universityId === university.value?.id,
  ),
);
const query = ref('');
const schoolEditorOpen = ref(false);
const majorEditorOpen = ref(false);
const visibleMajors = computed(() => {
  const keyword = query.value.trim().toLowerCase();
  return store
    .majorsFor(school.value?.id ?? '')
    .filter((item) =>
      [item.name, item.japaneseName, item.research, item.notes].some((value) =>
        value.toLowerCase().includes(keyword),
      ),
    )
    .toReversed();
});
watch(
  () => route.params.schoolId,
  () => {
    query.value = '';
  },
);

function deleteSchool() {
  if (!school.value) return;
  const id = school.value.id;
  const universityId = school.value.universityId;
  modal.confirm({
    title: `删除「${school.value.name}」？`,
    content: `该研究科中的 ${store.majorsFor(id).length} 个专攻和 ${store.schoolProfessors(id).length} 位老师也会一起删除。`,
    okText: '确认删除',
    cancelText: '取消',
    okButtonProps: { danger: true },
    onOk() {
      store.removeEntity('school', id);
      message.success('研究科已删除');
      return router.replace(`/japan-grad/universities/${universityId}`);
    },
  });
}
</script>

<template>
  <section v-if="school && university" class="explorer-page">
    <nav class="explorer-breadcrumb" aria-label="当前位置">
      <RouterLink to="/japan-grad">大学清单</RouterLink><ExplorerIcon name="chevron" /><RouterLink
        :to="`/japan-grad/universities/${university.id}`"
      >
        {{ university.name }}
</RouterLink><ExplorerIcon name="chevron" /><span>{{ school.name }}</span>
    </nav>
    <header class="page-heading detail-heading">
      <div>
        <p class="page-eyebrow">GRADUATE SCHOOL / 研究科</p>
        <h1>{{ school.name }}</h1>
        <p class="page-description">
          {{
            [university.name, school.japaneseName].filter(Boolean).join(' · ')
          }}
        </p>
      </div>
      <div class="detail-actions">
        <Button class="icon-button" @click="schoolEditorOpen = true">
          <ExplorerIcon name="edit" />编辑研究科
</Button><Button
          class="icon-button"
          aria-label="删除研究科"
          @click="deleteSchool"
        >
          <ExplorerIcon name="trash" />
        </Button>
      </div>
    </header>
    <section class="entity-overview" aria-label="研究科资料">
      <div class="overview-meta">
        <span><ExplorerIcon name="book" />{{
            school.research || '研究领域尚未填写'
          }}</span><a
          v-if="websiteUrl(school.website)"
          :href="websiteUrl(school.website)"
          target="_blank"
          rel="noopener noreferrer"
          ><ExplorerIcon name="globe" />访问研究科官网<ExplorerIcon name="link" /></a>
      </div>
      <p v-if="school.notes" class="overview-notes">{{ school.notes }}</p>
    </section>
    <header class="collection-heading">
      <div>
        <h2>
          专攻<span>{{ store.majorsFor(school.id).length }}</span>
        </h2>
        <p>专攻隶属于研究科，进入专攻后整理其中的老师。</p>
      </div>
      <Button
        type="primary"
        class="icon-button"
        @click="majorEditorOpen = true"
      >
        <ExplorerIcon name="plus" />新增专攻
      </Button>
    </header>
    <template v-if="store.majorsFor(school.id).length">
      <Input
        v-model:value="query"
        allow-clear
        class="explorer-search section-search"
        placeholder="搜索专攻或研究方向"
        aria-label="搜索专攻"
      >
        <template #prefix><ExplorerIcon name="search" /></template>
      </Input>
      <div v-if="visibleMajors.length" class="school-grid">
        <RouterLink
          v-for="major in visibleMajors"
          :key="major.id"
          :to="`/japan-grad/universities/${university.id}/schools/${school.id}/majors/${major.id}`"
          class="school-card major-card"
        >
          <div class="school-card-top">
            <span class="entity-symbol"><ExplorerIcon name="book" /></span><ExplorerIcon name="arrow" />
          </div>
          <h3>{{ major.name }}</h3>
          <p v-if="major.japaneseName" class="secondary-name">
            {{ major.japaneseName }}
          </p>
          <p class="school-research">
            {{ major.research || '研究方向待补充' }}
          </p>
          <p v-if="major.notes" class="card-notes">{{ major.notes }}</p>
          <div class="school-card-bottom">
            <span>{{ store.professorsFor(major.id).length }} 位老师</span><span
              v-if="store.professorsFor(major.id).some((item) => item.favorite)"
              class="favorite-count"
              ><ExplorerIcon name="heart" />{{
                store.professorsFor(major.id).filter((item) => item.favorite)
                  .length
              }}
              位心仪</span><span class="open-label">查看老师 →</span>
          </div>
        </RouterLink>
      </div>
      <div v-else class="search-empty">
        <h2>没有找到相关专攻</h2>
        <Button @click="query = ''">清除搜索</Button>
      </div>
    </template>
    <section v-else class="collection-empty">
      <span class="empty-symbol"><ExplorerIcon name="book" /></span>
      <h3>添加第一个专攻</h3>
      <p>先填写专攻名称，再记录其中感兴趣的老师。</p>
      <Button class="icon-button" @click="majorEditorOpen = true">
        <ExplorerIcon name="plus" />添加专攻
      </Button>
    </section>
    <EntityEditor
      v-model:open="schoolEditorOpen"
      kind="school"
      :entity-id="school.id"
      :parent-id="university.id"
      :parent-name="university.name"
    />
    <EntityEditor
      v-model:open="majorEditorOpen"
      kind="major"
      :parent-id="school.id"
      :parent-name="`${university.name} / ${school.name}`"
    />
  </section>
  <section v-else class="search-empty">
    <h1>这个研究科已不存在</h1>
    <p>返回大学清单重新选择。</p>
    <RouterLink to="/japan-grad" class="back-link">返回大学清单 →</RouterLink>
  </section>
</template>
