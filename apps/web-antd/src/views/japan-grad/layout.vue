<script setup lang="ts">
import {
  computed,
  h,
  onBeforeUnmount,
  onMounted,
  onUnmounted,
  ref,
  watch,
} from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';

import {
  useEventListener,
  useIntervalFn,
  usePreferredDark,
  usePreferredReducedMotion,
  useStorage,
} from '@vueuse/core';
import { App, ConfigProvider, Drawer } from 'ant-design-vue';

import { useCollectionJobsStore } from './collection-jobs';
import BrandMark from './components/brand-mark.vue';
import ExplorerIcon from './components/explorer-icon.vue';
import JgLoader from './components/jg-loader.vue';
import QuickJump from './components/quick-jump.vue';
import WorkspaceNavigation from './components/workspace-navigation.vue';
import { useExplorerStore } from './explorer';
import { antdThemeConfig, cssVariables, DARK, LIGHT } from './palette';

// Order matters: page styles, the older refresh layer, then shell and the paper theme.
import './style.css';
import './visual.css';
import './shell.css';
import './paper.css';
import './directory.css';
import './affiliation-cards.css';
import './quick-jump.css';
import './density.css';

const jobs = useCollectionJobsStore();
const { message } = App.useApp();
onMounted(() => jobs.start());
onBeforeUnmount(() => jobs.stop());
watch(
  () => jobs.completed,
  () => {
    message.success({
      content: () =>
        h(
          RouterLink,
          { to: '/japan-grad/collection' },
          () => '解析任务已完成，点此查看结果',
        ),
      duration: 6,
    });
  },
);
watch(
  () => jobs.ended,
  () => {
    message.info({
      content: () =>
        h(
          RouterLink,
          { to: '/japan-grad/collection' },
          () => '解析任务已结束，点此查看状态',
        ),
      duration: 6,
    });
  },
);

const store = useExplorerStore();
void store.load();
const jumpOpen = ref(false);
const jumpKey = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K';
// Lazy page chunks: show the loader only when a navigation takes noticeably long.
const routeLoading = ref(false);
let routeTimer: ReturnType<typeof setTimeout> | undefined;
const layoutRouter = useRouter();
const endRouteLoading = () => {
  clearTimeout(routeTimer);
  routeLoading.value = false;
};
const stopBefore = layoutRouter.beforeEach((to, from) => {
  if (to.path !== from.path) {
    clearTimeout(routeTimer);
    routeTimer = setTimeout(() => (routeLoading.value = true), 180);
  }
});
const stopAfter = layoutRouter.afterEach(endRouteLoading);
const stopError = layoutRouter.onError(endRouteLoading);
onUnmounted(() => {
  endRouteLoading();
  stopBefore();
  stopAfter();
  stopError();
});
let refreshingWorkspace = false;
async function refreshWorkspace() {
  if (
    !store.loaded ||
    store.saving ||
    refreshingWorkspace ||
    document.visibilityState === 'hidden'
  )
    return;
  // Keep an open edit dialog stable; its save uses the original workspace revision.
  if (
    [...document.querySelectorAll('.ant-modal-wrap')].some(
      (el) => el.getClientRects().length > 0,
    )
  )
    return;
  refreshingWorkspace = true;
  try {
    await store.refresh();
  } catch {
    /* Existing workspace remains visible; saving still reports connection failures. */
  } finally {
    refreshingWorkspace = false;
  }
}
useIntervalFn(() => void refreshWorkspace(), 15_000);
useEventListener(window, 'focus', () => void refreshWorkspace());

const route = useRoute();
const router = useRouter();
const parentNavigation = computed(() => {
  if (
    ['/japan-grad/ai', '/japan-grad/collection'].includes(route.path) &&
    typeof route.query.returnTo === 'string' &&
    route.query.returnTo.startsWith('/japan-grad/') &&
    !route.query.returnTo.startsWith('/japan-grad/ai') &&
    !route.query.returnTo.startsWith('/japan-grad/collection')
  )
    return { path: route.query.returnTo, label: '之前的页面' };
  if (route.path.replace(/\/$/, '') === '/japan-grad/overview')
    return undefined;
  if (route.params.programId)
    return { path: '/japan-grad/special-programs', label: '特殊入学项目' };
  if (
    [
      '/japan-grad/ai',
      '/japan-grad/collection',
      '/japan-grad/journey',
      '/japan-grad/settings',
      '/japan-grad/special-programs',
      '/japan-grad/universities',
      '/japan-grad/universities/',
    ].includes(route.path)
  )
    return { path: '/japan-grad/overview', label: '申请总览' };
  if (route.params.analysisMajorId) {
    const major = store.majors.find(
      (m) => m.id === route.params.analysisMajorId,
    );
    const school = store.schools.find((s) => s.id === major?.schoolId);
    return major && school
      ? {
          path: `/japan-grad/universities/${school.universityId}/schools/${school.id}/majors/${major.id}`,
          label: '专攻资料',
        }
      : { path: '/japan-grad/universities', label: '大学清单' };
  }
  const { universityId, schoolId, majorId, labId, professorId } = route.params;
  const universityPath = `/japan-grad/universities/${universityId}`;
  const schoolPath = `${universityPath}/schools/${schoolId}`;
  const majorPath = `${schoolPath}/majors/${majorId}`;
  if (professorId) {
    const parentLabId =
      labId || store.professors.find((item) => item.id === professorId)?.labId;
    return parentLabId
      ? { path: `${majorPath}/labs/${parentLabId}`, label: '研究室' }
      : { path: majorPath, label: '专攻' };
  }
  if (labId) return { path: majorPath, label: '专攻' };
  if (majorId) return { path: schoolPath, label: '研究科' };
  if (schoolId) return { path: universityPath, label: '大学详情' };
  if (universityId)
    return { path: '/japan-grad/universities', label: '大学清单' };
  return undefined;
});
// Top-level pages are reachable from the masthead, and entity pages render their
// own breadcrumb, so the back row only appears on the remaining nested pages.
const showCrumbs = computed(() => {
  if (!parentNavigation.value) return false;
  if (parentNavigation.value.label === '之前的页面') return true;
  if (route.params.analysisMajorId || route.params.programId) return true;
  return false;
});
function goToParent() {
  if (parentNavigation.value) void router.push(parentNavigation.value.path);
}
const navOpen = ref(false);
const preferredDark = usePreferredDark();
const preferredMotion = usePreferredReducedMotion();
const appearance = useStorage<'dark' | 'light' | 'system'>(
  'japangrad-appearance',
  'system',
);
const isDark = computed(
  () =>
    appearance.value === 'dark' ||
    (appearance.value === 'system' && preferredDark.value),
);
const previousTheme = document.documentElement.dataset.japangradTheme;
watch(
  isDark,
  (value) => {
    document.documentElement.dataset.japangradTheme = value ? 'dark' : 'light';
  },
  { immediate: true },
);
onUnmounted(() => {
  if (previousTheme === null)
    delete document.documentElement.dataset.japangradTheme;
  else document.documentElement.dataset.japangradTheme = previousTheme;
});
watch(
  () => route.path,
  () => {
    navOpen.value = false;
  },
);
const palette = computed(() => (isDark.value ? DARK : LIGHT));
const theme = computed(() =>
  antdThemeConfig(
    palette.value,
    isDark.value,
    preferredMotion.value !== 'reduce',
  ),
);
// Variables live on <html> so teleported overlays (modals, drawers) share them.
const appliedVariables = new Set<string>();
watch(
  palette,
  (value) => {
    const style = document.documentElement.style;
    for (const [name, color] of Object.entries(cssVariables(value))) {
      style.setProperty(name, color);
      appliedVariables.add(name);
    }
  },
  { immediate: true },
);
onUnmounted(() => {
  for (const name of appliedVariables)
    document.documentElement.style.removeProperty(name);
});
const saveLabel = computed(() => {
  if (store.storageError) {
    return '本地服务异常';
  }
  if (store.loading) {
    return '连接本地工作区…';
  }
  if (store.saving) {
    return '正在保存…';
  }
  return '';
});
const contextLabel = computed(() => {
  if (route.path === '/japan-grad/settings') {
    return '设置';
  }
  if (route.path.startsWith('/japan-grad/special-programs')) {
    return '特殊入学项目';
  }
  if (route.path === '/japan-grad/overview') {
    return '申请总览';
  }
  if (route.path === '/japan-grad/ai') {
    return 'AI 管理';
  }
  if (route.path === '/japan-grad/collection') {
    return '网址解析';
  }
  if (route.params.analysisMajorId) {
    return '募集要项分析';
  }
  if (route.path === '/japan-grad/journey') {
    return '修考之路';
  }
  if (route.params.professorId) {
    return '老师资料';
  }
  if (route.params.labId) {
    return '研究室资料';
  }
  if (route.params.majorId) {
    return '专攻资料';
  }
  if (route.params.schoolId) {
    return '研究科';
  }
  if (route.params.universityId) {
    return '大学详情';
  }
  return '大学清单';
});
</script>

<template>
  <ConfigProvider :theme="theme">
    <App>
      <div
        class="university-explorer"
        :class="{ 'is-document-reader': !!route.params.documentId }"
        :data-theme="isDark ? 'dark' : 'light'"
      >
        <a class="skip-to-content" href="#japangrad-main">跳转到主要内容</a>
        <header class="jg-masthead explorer-topbar">
          <div class="jg-masthead-inner">
            <button
              class="jg-menu-button"
              aria-label="打开工作区导航"
              @click="navOpen = true"
            >
              <ExplorerIcon name="menu" />
            </button>
            <RouterLink
              to="/japan-grad/overview"
              class="jg-brand"
              aria-label="JUAI 申请总览首页"
            >
              <BrandMark /><strong><span>择校笔记</span></strong>
            </RouterLink>
            <WorkspaceNavigation class="jg-masthead-nav" />
            <button
              v-if="store.loaded"
              type="button"
              class="jg-jump"
              aria-label="快速跳转到研究室、老师或专攻"
              @click="jumpOpen = true"
            >
              <ExplorerIcon name="search" /><span>快速跳转</span><kbd>{{ jumpKey }}</kbd>
            </button>
            <span
              v-if="saveLabel"
              class="jg-save-state"
              :class="{
                'is-error': store.storageError,
                'is-pending': store.loading || store.saving,
              }"
              role="status"
              :title="saveLabel"
              ><i></i><span>{{ saveLabel }}</span></span>
          </div>
        </header>
        <div class="jg-page">
          <div v-if="store.storageError" class="storage-alert" role="alert">
            {{ store.storageError
            }}<button
              v-if="!store.loaded"
              class="text-button"
              @click="store.load()"
            >
              重试连接
            </button>
          </div>
          <div class="jg-sheet workspace-document">
            <nav
              v-if="showCrumbs && parentNavigation"
              class="jg-crumbs"
              aria-label="返回上一级"
            >
              <button type="button" class="jg-back" @click="goToParent">
                <ExplorerIcon name="back" /><span>返回{{ parentNavigation.label }}</span>
              </button>
              <span aria-hidden="true">·</span>
              <span class="jg-crumbs-here">{{ contextLabel }}</span>
            </nav>
            <main
              id="japangrad-main"
              class="jg-main explorer-main"
              tabindex="-1"
            >
              <p v-if="store.migrationNotice" class="workspace-notice">
                {{ store.migrationNotice }}
              </p>
              <RouterView v-if="store.loaded" />
              <JgLoader v-else-if="store.loading" text="正在打开工作区" />
              <section v-else class="collection-empty">
                <span class="empty-symbol"><ExplorerIcon name="drive" /></span>
                <h2>等待本地服务连接</h2>
                <p>请双击 JUAI 打开工作台。</p>
              </section>
              <JgLoader
                v-if="store.loaded && routeLoading"
                layout="overlay"
                text="正在打开页面"
              />
            </main>
          </div>
        </div>
        <Drawer
          v-model:open="navOpen"
          title="工作区导航"
          placement="left"
          :width="280"
          class="jg-nav-drawer"
        >
          <WorkspaceNavigation variant="drawer" @navigate="navOpen = false" />
        </Drawer>
      </div>
    </App>
    <QuickJump v-model:open="jumpOpen" />
  </ConfigProvider>
</template>
