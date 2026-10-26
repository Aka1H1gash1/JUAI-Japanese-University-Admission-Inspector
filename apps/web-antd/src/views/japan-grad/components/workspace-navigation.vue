<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

import { useExplorerStore } from '../explorer';
import BrandMark from './brand-mark.vue';
import ExplorerIcon from './explorer-icon.vue';

withDefaults(defineProps<{ showBrand?: boolean }>(), { showBrand: true });
const emit = defineEmits<{ navigate: [] }>();
const store = useExplorerStore();
const route = useRoute();
const currentUniversity = computed(() =>
  store.universities.find((item) => item.id === route.params.universityId),
);
const currentSchool = computed(() =>
  store.schools.find(
    (item) =>
      item.id === route.params.schoolId &&
      item.universityId === currentUniversity.value?.id,
  ),
);
const currentMajor = computed(() =>
  store.majors.find(
    (item) =>
      item.id === route.params.majorId &&
      item.schoolId === currentSchool.value?.id,
  ),
);
const currentLab = computed(() =>
  store.labs.find(
    (item) =>
      item.majorId === currentMajor.value?.id &&
      (item.id === route.params.labId ||
        store.professors.some(
          (person) =>
            person.id === route.params.professorId && person.labId === item.id,
        )),
  ),
);
</script>

<template>
  <div class="workspace-navigation">
    <RouterLink
      v-if="showBrand"
      to="/japan-grad/overview"
      class="explorer-brand"
      aria-label="JapanGrad 申请总览首页"
      @click="emit('navigate')"
    >
      <span class="brand-mark"><BrandMark /></span><strong>JapanGrad<span>择校笔记</span></strong>
    </RouterLink>
    <nav class="workspace-primary-nav" aria-label="工作区导航">
      <RouterLink
        to="/japan-grad/overview"
        class="workspace-nav-link"
        :class="{ 'is-active': route.path === '/japan-grad/overview' }"
        @click="emit('navigate')"
      >
        <ExplorerIcon name="home" /><span>申请总览</span>
      </RouterLink>
      <RouterLink
        to="/japan-grad/universities"
        class="workspace-nav-link"
        :class="{ 'is-active': route.path === '/japan-grad/universities' }"
        @click="emit('navigate')"
      >
        <ExplorerIcon name="grid" /><span>大学清单</span><small>{{ store.universities.length }}</small>
      </RouterLink>
      <RouterLink
        to="/japan-grad/journey"
        class="workspace-nav-link"
        :class="{
          'is-active': route.path === '/japan-grad/journey',
        }"
        @click="emit('navigate')"
      >
        <ExplorerIcon name="book" /><span>修考之路</span><small>{{ store.labs.filter((item) => item.wantApply).length }}</small>
      </RouterLink>
    </nav>
    <nav class="workspace-primary-nav" aria-label="管理">
      <h2 class="workspace-management-label">管理</h2>
      <RouterLink
        to="/japan-grad/special-programs"
        class="workspace-nav-link"
        :class="{
          'is-active': route.path.startsWith('/japan-grad/special-programs'),
        }"
        @click="emit('navigate')"
      >
        <ExplorerIcon name="folder" /><span>特殊入学项目</span>
      </RouterLink>
      <RouterLink
        to="/japan-grad/ai"
        class="workspace-nav-link"
        :class="{ 'is-active': route.path === '/japan-grad/ai' }"
        @click="emit('navigate')"
      >
        <ExplorerIcon name="chat" /><span>AI 管理</span>
      </RouterLink>
      <RouterLink
        to="/japan-grad/settings"
        class="workspace-nav-link"
        :class="{ 'is-active': route.path === '/japan-grad/settings' }"
        @click="emit('navigate')"
      >
        <ExplorerIcon name="system" /><span>设置</span>
      </RouterLink>
    </nav>
    <section
      v-if="currentSchool && currentUniversity"
      class="workspace-context"
      aria-label="当前路径"
    >
      <h2>当前路径</h2>
      <RouterLink
        :to="`/japan-grad/universities/${currentUniversity.id}/schools/${currentSchool.id}`"
        class="workspace-context-link"
        @click="emit('navigate')"
      >
        <ExplorerIcon name="book" /><span>{{
          currentSchool.name
        }}</span>
</RouterLink><RouterLink
        v-if="currentMajor"
        :to="`/japan-grad/universities/${currentUniversity.id}/schools/${currentSchool.id}/majors/${currentMajor.id}`"
        class="workspace-context-link"
        @click="emit('navigate')"
      >
        <ExplorerIcon name="folder" /><span>{{ currentMajor.name }}</span>
      </RouterLink>
      <RouterLink
        v-if="currentLab && currentMajor"
        :to="`/japan-grad/universities/${currentUniversity.id}/schools/${currentSchool.id}/majors/${currentMajor.id}/labs/${currentLab.id}`"
        class="workspace-context-link"
        @click="emit('navigate')"
      >
        <ExplorerIcon name="book" /><span>{{ currentLab.name }}</span>
      </RouterLink>
    </section>
  </div>
</template>
<style scoped>
.workspace-management-label {
  margin: 8px 12px 6px;
  font-size: 10px;
  font-weight: 500;
  color: var(--jg-muted);
  letter-spacing: 0.12em;
}
</style>
