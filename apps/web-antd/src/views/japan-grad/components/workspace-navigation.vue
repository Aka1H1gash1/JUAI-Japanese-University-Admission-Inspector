<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

import { useCollectionJobsStore } from '../collection-jobs';
import { useExplorerStore } from '../explorer';
import ExplorerIcon from './explorer-icon.vue';

/**
 * bar：桌面顶栏里的一行文字导航。
 * drawer：窄屏抽屉里的竖排导航。
 */
withDefaults(defineProps<{ variant?: 'bar' | 'drawer' }>(), {
  variant: 'bar',
});
const emit = defineEmits<{ navigate: [] }>();
const store = useExplorerStore();
const jobs = useCollectionJobsStore();
const route = useRoute();

const primary = computed(() => [
  {
    to: '/japan-grad/overview',
    label: '申请总览',
    icon: 'home',
    active: route.path === '/japan-grad/overview',
  },
  {
    to: '/japan-grad/universities',
    label: '大学清单',
    icon: 'grid',
    count: store.universities.length,
    active: route.path.startsWith('/japan-grad/universities'),
  },
  {
    to: '/japan-grad/journey',
    label: '修考之路',
    icon: 'book',
    count: store.labs.filter((item) => item.wantApply).length,
    active: route.path === '/japan-grad/journey',
  },
  {
    to: '/japan-grad/special-programs',
    label: '特殊入学项目',
    icon: 'folder',
    active: route.path.startsWith('/japan-grad/special-programs'),
  },
]);
const secondary = computed(() => [
  {
    to: '/japan-grad/collection',
    label: '网址解析',
    icon: 'search',
    count: jobs.running || undefined,
    active: route.path.startsWith('/japan-grad/collection'),
  },
  {
    to: '/japan-grad/ai',
    label: 'AI 管理',
    icon: 'chat',
    active: route.path === '/japan-grad/ai',
  },
  {
    to: '/japan-grad/settings',
    label: '设置',
    icon: 'system',
    active: route.path === '/japan-grad/settings',
  },
]);
</script>

<template>
  <div class="jg-nav" :class="`is-${variant}`">
    <nav class="jg-nav-group" aria-label="工作区导航">
      <RouterLink
        v-for="item in primary"
        :key="item.to"
        :to="item.to"
        class="jg-nav-link"
        :class="{ 'is-active': item.active }"
        :aria-current="item.active ? 'page' : undefined"
        @click="emit('navigate')"
      >
        <ExplorerIcon v-if="variant === 'drawer'" :name="item.icon" /><span>{{
          item.label
        }}</span><small v-if="item.count">{{ item.count }}</small>
      </RouterLink>
    </nav>
    <nav class="jg-nav-group is-secondary" aria-label="管理">
      <h2 v-if="variant === 'drawer'" class="jg-nav-heading">管理</h2>
      <RouterLink
        v-for="item in secondary"
        :key="item.to"
        :to="item.to"
        class="jg-nav-link"
        :class="{ 'is-active': item.active }"
        :aria-current="item.active ? 'page' : undefined"
        @click="emit('navigate')"
      >
        <ExplorerIcon v-if="variant === 'drawer'" :name="item.icon" /><span>{{
          item.label
        }}</span><small v-if="item.count">{{ item.count }}</small>
      </RouterLink>
    </nav>
  </div>
</template>
