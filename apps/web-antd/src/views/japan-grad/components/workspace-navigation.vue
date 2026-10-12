<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useExplorerStore } from '../explorer';
import BrandMark from './brand-mark.vue';
import ExplorerIcon from './explorer-icon.vue';
import UniversityLogo from './university-logo.vue';

withDefaults(defineProps<{ showBrand?: boolean }>(), { showBrand: true });
const emit = defineEmits<{ navigate: []; workspace: [] }>();
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
const shortcuts = computed(() => {
  const recent = store.universities.toReversed();
  if (
    currentUniversity.value &&
    !recent.slice(0, 5).some((item) => item.id === currentUniversity.value?.id)
  )
    return [
      currentUniversity.value,
      ...recent.filter((item) => item.id !== currentUniversity.value?.id),
    ].slice(0, 5);
  return recent.slice(0, 5);
});
</script>

<template>
  <div class="workspace-navigation">
    <RouterLink
      v-if="showBrand"
      to="/japan-grad"
      class="explorer-brand"
      aria-label="JapanGrad 择校笔记，大学清单首页"
      @click="emit('navigate')"
      ><span class="brand-mark"><BrandMark /></span
      ><strong>JapanGrad<span>择校笔记</span></strong></RouterLink
    >
    <nav class="workspace-primary-nav" aria-label="工作区导航">
      <RouterLink
        to="/japan-grad"
        class="workspace-nav-link"
        :class="{ 'is-active': route.path === '/japan-grad' }"
        @click="emit('navigate')"
        ><ExplorerIcon name="grid" /><span>大学清单</span
        ><small>{{ store.universities.length }}</small></RouterLink
      >
      <RouterLink
        to="/japan-grad/journey"
        class="workspace-nav-link"
        :class="{
          'is-active':
            route.path === '/japan-grad/journey' || !!route.params.cycleId,
        }"
        @click="emit('navigate')"
        ><ExplorerIcon name="book" /><span>修考之路</span
        ><small>{{
          store.labs.filter((item) => item.wantApply).length
        }}</small></RouterLink
      >
    </nav>
    <section
      v-if="shortcuts.length"
      class="workspace-shortcuts"
      aria-label="大学快捷导航"
    >
      <h2>我的大学</h2>
      <RouterLink
        v-for="item in shortcuts"
        :key="item.id"
        :to="`/japan-grad/universities/${item.id}`"
        class="workspace-university-link"
        :class="{ 'is-active': currentUniversity?.id === item.id }"
        @click="emit('navigate')"
        ><UniversityLogo :logo-id="item.logoId" :name="item.name" /><span>{{
          item.name
        }}</span></RouterLink
      >
    </section>
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
        ><ExplorerIcon name="book" /><span>{{
          currentSchool.name
        }}</span></RouterLink
      ><RouterLink
        v-if="currentMajor"
        :to="`/japan-grad/universities/${currentUniversity.id}/schools/${currentSchool.id}/majors/${currentMajor.id}`"
        class="workspace-context-link"
        @click="emit('navigate')"
        ><ExplorerIcon name="folder" /><span>{{
          currentMajor.name
        }}</span></RouterLink
      >
      <RouterLink
        v-if="currentLab && currentMajor"
        :to="`/japan-grad/universities/${currentUniversity.id}/schools/${currentSchool.id}/majors/${currentMajor.id}/labs/${currentLab.id}`"
        class="workspace-context-link"
        @click="emit('navigate')"
        ><ExplorerIcon name="book" /><span>{{
          currentLab.name
        }}</span></RouterLink
      >
    </section>
    <div class="workspace-nav-bottom">
      <dl class="workspace-counts">
        <div>
          <dt>研究科</dt>
          <dd>{{ store.schools.length }}</dd>
        </div>
        <div>
          <dt>专攻</dt>
          <dd>{{ store.majors.length }}</dd>
        </div>
        <div>
          <dt>想考研究室</dt>
          <dd>{{ store.labs.filter((item) => item.wantApply).length }}</dd>
        </div>
      </dl>
      <button class="workspace-location" @click="emit('workspace')">
        <ExplorerIcon name="drive" /><span
          >本地工作区<small>查看资料保存位置</small></span
        ><ExplorerIcon name="chevron" />
      </button>
    </div>
  </div>
</template>
