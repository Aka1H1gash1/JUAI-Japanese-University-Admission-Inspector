<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { App, Button } from 'ant-design-vue';

import EntityEditor from './components/entity-editor.vue';
import ProfessorDetails from './components/professor-details.vue';
import ContextTrail from './design-system/context-trail.vue';
import PageHeading from './design-system/page-heading.vue';
import { professorInitials, useExplorerStore } from './explorer';
import { labContext, labPath } from './lab-targets';

const store = useExplorerStore();
const route = useRoute();
const router = useRouter();
const { message, modal } = App.useApp();
const editorOpen = ref(false);
const toggling = ref(false);
async function favorite() {
  if (!professor.value || toggling.value) return;
  toggling.value = true;
  try {
    await store.toggleFavorite(professor.value.id);
  } catch (error) {
    message.error(error instanceof Error ? error.message : '保存失败');
  } finally {
    toggling.value = false;
  }
}
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
const major = computed(() =>
  store.majors.find(
    (item) =>
      item.id === route.params.majorId && item.schoolId === school.value?.id,
  ),
);
const professor = computed(() =>
  store.professors.find(
    (item) =>
      item.id === route.params.professorId &&
      item.majorId === major.value?.id &&
      (!route.params.labId || item.labId === route.params.labId),
  ),
);
const lab = computed(() =>
  store.labs.find(
    (item) =>
      item.id === professor.value?.labId && item.majorId === major.value?.id,
  ),
);
const labUrl = computed(() => `${majorUrl.value}/labs/${lab.value?.id}`);
const majorUrl = computed(
  () =>
    `/japan-grad/universities/${route.params.universityId}/schools/${route.params.schoolId}/majors/${route.params.majorId}`,
);
function goToProfessor(id: string) {
  const person = store.professors.find((item) => item.id === id);
  const context = person?.labId ? labContext(store, person.labId) : undefined;
  if (context)
    void router.replace({
      path: `${labPath(context)}/professors/${id}`,
      query: route.query,
    });
}

watch(
  () =>
    store.professors.find((item) => item.id === route.params.professorId)
      ?.labId,
  (id, previous) => {
    if (id && previous && id !== previous)
      goToProfessor(String(route.params.professorId));
  },
);

function removeProfessor() {
  if (!professor.value) return;
  const { id, name } = professor.value;
  const returnUrl = labUrl.value;
  modal.confirm({
    title: `删除「${name}」？`,
    content:
      '老师资料、论文索引和邮件记录会一并删除，论文原文件保留在本地工作区。删除后无法在界面撤销，可先到「设置 → 本地工作区」备份。',
    okText: '确认删除',
    cancelText: '取消',
    okButtonProps: { danger: true },
    async onOk() {
      await store.removeEntity('professor', id);
      message.success('老师已删除');
      return router.replace(returnUrl);
    },
  });
}
</script>

<template>
  <section
    v-if="professor && lab && major && school && university"
    class="juai-design juai-stack professor-page"
  >
    <PageHeading
      :title="professor.name"
      :description="
        [
          professor.title,
          professor.japaneseName !== professor.name
            ? professor.japaneseName
            : '',
        ]
          .filter(Boolean)
          .join(' · ') || '职称未确认'
      "
    >
      <template #identity>
        <span class="juai-professor-avatar" aria-hidden="true">{{
          professorInitials(professor.name)
        }}</span>
      </template>
      <template #context>
        <ContextTrail
          :items="[
            { label: '大学清单', to: '/japan-grad/universities' },
            {
              label: university.name,
              to: `/japan-grad/universities/${university.id}`,
            },
            {
              label: school.name,
              to: `/japan-grad/universities/${university.id}/schools/${school.id}`,
            },
            { label: major.name, to: majorUrl },
            { label: lab.name, to: labUrl },
          ]"
        />
      </template>
      <template #actions>
        <Button
          :aria-pressed="professor.favorite"
          :loading="toggling"
          @click="favorite"
        >
          {{ professor.favorite ? '已标记心仪' : '标记心仪' }}
</Button><Button @click="editorOpen = true">编辑资料</Button><Button type="text" danger @click="removeProfessor"> 删除 </Button>
      </template>
    </PageHeading>
    <ProfessorDetails :key="professor.id" :professor-id="professor.id" />
    <EntityEditor
      v-model:open="editorOpen"
      kind="professor"
      :entity-id="professor.id"
      :parent-id="lab.id"
      :parent-name="`${university.name} / ${major.name} / ${lab.name}`"
      @saved="goToProfessor"
    />
  </section>
  <section v-else class="search-empty">
    <h1>这位老师已不存在</h1>
    <p>请返回所属专攻或大学清单重新选择。</p>
    <RouterLink
      :to="major ? majorUrl : '/japan-grad/universities'"
      class="back-link"
    >
      {{ major ? '返回专攻 →' : '返回大学清单 →' }}
    </RouterLink>
  </section>
</template>

<style scoped>
.juai-professor-avatar {
  display: grid;
  place-items: center;
  width: 60px;
  height: 60px;
  font-size: 22px;
  font-weight: 500;
  color: var(--jg-accent-text);
  background: var(--jg-subtle);
  border: 1px solid var(--jg-line);
  border-radius: 50%;
}
</style>
