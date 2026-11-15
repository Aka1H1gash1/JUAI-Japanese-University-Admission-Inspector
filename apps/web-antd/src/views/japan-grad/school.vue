<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { App, Button, Input } from 'ant-design-vue';

import EntityCreateFlow from './components/entity-create-flow.vue';
import EntityEditor from './components/entity-editor.vue';
import ExperiencePosts from './components/experience-posts.vue';
import ListPagination from './components/list-pagination.vue';
import ContentSection from './design-system/content-section.vue';
import ContextTrail from './design-system/context-trail.vue';
import EmptyState from './design-system/empty-state.vue';
import EntityLinks from './design-system/entity-links.vue';
import PageHeading from './design-system/page-heading.vue';
import { useExplorerStore, websiteUrl } from './explorer';
import { usePagination } from './use-pagination';
const route = useRoute();
const router = useRouter();
const store = useExplorerStore();
const { message, modal } = App.useApp();
const university = computed(() =>
  store.universities.find((u) => u.id === route.params.universityId),
);
const school = computed(() =>
  store.schools.find(
    (s) =>
      s.id === route.params.schoolId && s.universityId === university.value?.id,
  ),
);
const majorEditorOpen = ref(false);
const query = ref('');
const schoolEditorOpen = ref(false);
const visibleMajors = computed(() =>
  store
    .majorsFor(school.value?.id || '')
    .filter((m) =>
      [m.name, m.japaneseName, m.research, m.notes]
        .join(' ')
        .toLowerCase()
        .includes(query.value.trim().toLowerCase()),
    )
    .toReversed(),
);
watch(
  () => route.params.schoolId,
  () => (query.value = ''),
);
function deleteSchool() {
  if (!school.value) return;
  const id = school.value.id;
  const universityId = school.value.universityId;
  modal.confirm({
    title: `删除「${school.value.name}」？`,
    content: `该研究科中的 ${store.majorsFor(id).length} 个专攻、${store.schoolLabs(id).length} 个研究室和 ${store.schoolProfessors(id).length} 位老师的记录、文件索引和邮件也会一起删除；原文件保留在工作区。删除后无法在界面撤销，可先到「设置 → 本地工作区」备份。`,
    okText: '确认删除',
    cancelText: '取消',
    okButtonProps: { danger: true },
    async onOk() {
      await store.removeEntity('school', id);
      message.success('研究科已删除');
      return router.replace(`/japan-grad/universities/${universityId}`);
    },
  });
}

const { page, pageSize, total, paged } = usePagination(visibleMajors, [
  query,
  () => school.value?.id,
]);
const majorLinks = computed(() =>
  paged.value.map((m) => ({
    id: m.id,
    title: m.name,
    subtitle: m.research || m.japaneseName,
    to: `/japan-grad/universities/${university.value?.id}/schools/${school.value?.id}/majors/${m.id}`,
    meta: `${store.labsFor(m.id).length} 个研究室`,
  })),
);
</script>
<template>
  <section v-if="school && university" class="juai-design juai-stack">
    <PageHeading
      :title="school.name"
      :description="
        school.japaneseName !== school.name ? school.japaneseName : undefined
      "
    >
      <template #context>
        <ContextTrail
          :items="[
            { label: '大学清单', to: '/japan-grad/universities' },
            {
              label: university.name,
              to: `/japan-grad/universities/${university.id}`,
            },
          ]"
        />
</template><template #meta>
        <a
          v-if="websiteUrl(school.website)"
          :href="websiteUrl(school.website)"
          target="_blank"
          rel="noopener noreferrer"
          >研究科官网 ↗</a>
</template><template #actions>
        <Button @click="schoolEditorOpen = true">编辑研究科</Button><Button type="text" danger @click="deleteSchool"> 删除 </Button>
      </template>
    </PageHeading>
    <ContentSection title="研究领域">
      <p class="juai-research-topic">
        {{ school.research || '研究领域尚未记录' }}
      </p>
      <p v-if="school.notes" class="juai-prose">
        {{ school.notes }}
      </p>
    </ContentSection>
    <ContentSection :title="`专攻 · ${store.majorsFor(school.id).length}`">
      <template #actions>
        <Button type="primary" @click="majorEditorOpen = true">
          新增专攻
        </Button>
      </template>
      <div v-if="store.majorsFor(school.id).length" class="juai-entity-toolbar">
        <Input
          v-model:value="query"
          allow-clear
          placeholder="搜索专攻或研究方向"
          aria-label="搜索专攻"
        />
      </div>
      <EntityLinks v-if="majorLinks.length" :items="majorLinks" /><EmptyState
        v-else
        :title="query ? '没有符合条件的专攻' : '尚未添加专攻'"
      /><ListPagination
        v-model:page="page"
        v-model:page-size="pageSize"
        :total="total"
      />
    </ContentSection>
    <details class="juai-history">
      <summary>查看研究科考学经验</summary>
      <ExperiencePosts :key="school.id" :school-id="school.id" />
    </details>
    <EntityEditor
      v-model:open="schoolEditorOpen"
      kind="school"
      :entity-id="school.id"
      :parent-id="university.id"
      :parent-name="university.name"
    /><EntityCreateFlow
      v-model:open="majorEditorOpen"
      kind="major"
      :parent-id="school.id"
      :parent-name="`${university.name} / ${school.name}`"
    />
  </section>
  <section v-else class="search-empty">
    <h1>这个研究科已不存在</h1>
    <RouterLink to="/japan-grad/universities">返回大学清单 →</RouterLink>
  </section>
</template>
