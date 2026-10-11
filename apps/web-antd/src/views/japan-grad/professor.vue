<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { App, Button } from 'ant-design-vue';

import EntityEditor from './components/entity-editor.vue';
import ExplorerIcon from './components/explorer-icon.vue';
import ProfessorDetails from './components/professor-details.vue';
import { professorInitials, useExplorerStore } from './explorer';
import { labContext, labPath } from './lab-targets';

const store = useExplorerStore();
const route = useRoute();
const router = useRouter();
const { message, modal } = App.useApp();
const editorOpen = ref(false);
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
      '老师资料、论文索引和邮件记录会一并删除，论文原文件保留在本地工作区。',
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
    class="explorer-page professor-page"
  >
    <nav class="explorer-breadcrumb" aria-label="当前位置">
      <RouterLink to="/japan-grad">大学清单</RouterLink
      ><ExplorerIcon name="chevron" />
      <RouterLink :to="`/japan-grad/universities/${university.id}`">{{
        university.name
      }}</RouterLink
      ><ExplorerIcon name="chevron" />
      <RouterLink
        :to="`/japan-grad/universities/${university.id}/schools/${school.id}`"
        >{{ school.name }}</RouterLink
      ><ExplorerIcon name="chevron" />
      <RouterLink :to="majorUrl">{{ major.name }}</RouterLink
      ><ExplorerIcon name="chevron" /><RouterLink :to="labUrl">{{
        lab.name
      }}</RouterLink
      ><ExplorerIcon name="chevron" /><span>{{ professor.name }}</span>
    </nav>
    <header class="page-heading detail-heading professor-page-heading">
      <div>
        <div class="professor-page-identity">
          <span
            class="entity-symbol teacher-symbol professor-avatar"
            aria-hidden="true"
            >{{ professorInitials(professor.name) }}</span
          >
          <div>
            <h1>{{ professor.name }}</h1>
            <p class="page-description">
              {{
                [professor.japaneseName, professor.title, lab.name]
                  .filter(Boolean)
                  .join(' / ') || '职称与研究室待补充'
              }}
            </p>
          </div>
        </div>
      </div>
      <div class="detail-actions">
        <Button
          class="icon-button favorite-button"
          :class="{ 'is-favorite': professor.favorite }"
          :aria-pressed="professor.favorite"
          @click="store.toggleFavorite(professor.id)"
          ><ExplorerIcon name="heart" />{{
            professor.favorite ? '已标记为心仪老师' : '标记为心仪老师'
          }}</Button
        >
        <Button class="icon-button" @click="editorOpen = true"
          ><ExplorerIcon name="edit" />编辑资料</Button
        >
        <Button
          class="icon-button"
          aria-label="删除老师"
          @click="removeProfessor"
          ><ExplorerIcon name="trash"
        /></Button>
      </div>
    </header>
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
    <RouterLink :to="major ? majorUrl : '/japan-grad'" class="back-link">{{
      major ? '返回专攻 →' : '返回大学清单 →'
    }}</RouterLink>
  </section>
</template>
