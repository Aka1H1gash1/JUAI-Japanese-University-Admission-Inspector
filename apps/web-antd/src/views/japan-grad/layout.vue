<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import {
  useEventListener,
  useIntervalFn,
  usePreferredDark,
  usePreferredReducedMotion,
  useStorage,
} from '@vueuse/core';
import {
  theme as antdTheme,
  App,
  Button,
  ConfigProvider,
  Drawer,
  Modal,
} from 'ant-design-vue';

import BrandMark from './components/brand-mark.vue';
import ExplorerIcon from './components/explorer-icon.vue';
import WorkspaceNavigation from './components/workspace-navigation.vue';
import { useExplorerStore } from './explorer';

import './style.css';
import './visual.css';

const store = useExplorerStore();
void store.load();
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
function goToParent() {
  if (parentNavigation.value) void router.push(parentNavigation.value.path);
}
const navOpen = ref(false);
const workspaceOpen = ref(false);
const pathCopied = ref(false);
const copyError = ref('');
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
const theme = computed(() => ({
  inherit: false,
  algorithm: isDark.value
    ? antdTheme.darkAlgorithm
    : antdTheme.defaultAlgorithm,
  token: {
    colorPrimary: isDark.value ? '#5368cc' : '#4355b9',
    colorInfo: isDark.value ? '#5368cc' : '#4355b9',
    colorBgContainer: isDark.value ? '#1e2536' : '#fdfdff',
    colorBgElevated: isDark.value ? '#283147' : '#fdfdff',
    colorText: isDark.value ? '#edf1fb' : '#222b45',
    colorTextLightSolid: '#fdfdff',
    colorTextSecondary: isDark.value ? '#a9b7cf' : '#4d5972',
    colorTextPlaceholder: isDark.value ? '#a5b2cb' : '#68748b',
    colorBorder: isDark.value ? '#6d7e9e' : '#8996b0',
    colorBorderSecondary: isDark.value ? '#35425b' : '#dce2ef',
    colorFillAlter: isDark.value ? '#283147' : '#e9edf6',
    colorError: isDark.value ? '#ffaaa0' : '#b73832',
    borderRadius: 8,
    controlHeight: 36,
    fontSize: 14,
    motion: preferredMotion.value !== 'reduce',
    fontFamily:
      '"Avenir Next", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
  },
}));
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
  return '已连接本地工作区';
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
    return '网址解析结果';
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
async function copyWorkspace() {
  copyError.value = '';
  try {
    if (store.workspacePath) {
      await navigator.clipboard.writeText(store.workspacePath);
      pathCopied.value = true;
    }
  } catch {
    copyError.value = '复制未完成，可以在上方选择并复制文件夹路径。';
  }
}
watch(workspaceOpen, () => {
  pathCopied.value = false;
  copyError.value = '';
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
        <aside class="workspace-sidebar">
          <WorkspaceNavigation />
        </aside>
        <div class="workspace-content">
          <header class="explorer-topbar">
            <div class="topbar-inner">
              <button
                class="workspace-menu-button"
                aria-label="打开工作区导航"
                @click="navOpen = true"
              >
                <ExplorerIcon name="menu" />
              </button>
              <RouterLink
                to="/japan-grad/overview"
                class="explorer-brand mobile-brand"
                aria-label="JapanGrad 申请总览首页"
              >
                <span class="brand-mark"><BrandMark /></span><strong>JapanGrad</strong>
              </RouterLink>
              <Button
                class="icon-button workspace-back-button"
                :disabled="!parentNavigation"
                :title="
                  parentNavigation
                    ? `返回${parentNavigation.label}`
                    : '当前已是大学清单'
                "
                :aria-label="
                  parentNavigation
                    ? `返回上一级：${parentNavigation.label}`
                    : '当前已是大学清单，无上一级'
                "
                @click="goToParent"
              >
                <ExplorerIcon name="back" />返回上一级
              </Button>
              <span class="workspace-context-label">{{ contextLabel }}</span>
              <span class="local-state" role="status"><i
                  :class="{
                    error: store.storageError,
                    pending: store.loading || store.saving,
                  }"
                ></i><span>{{ saveLabel }}</span></span>
            </div>
          </header>
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
          <div class="workspace-body">
            <div class="workspace-document">
              <main id="japangrad-main" class="explorer-main" tabindex="-1">
                <p v-if="store.migrationNotice" class="workspace-notice">
                  {{ store.migrationNotice }}
                </p>
                <RouterView v-if="store.loaded" />
                <section
                  v-else-if="store.loading"
                  class="workspace-skeleton"
                  aria-busy="true"
                  aria-label="正在打开本地工作区"
                >
                  <span class="skeleton-title"></span><span class="skeleton-description"></span><span class="skeleton-toolbar"></span>
                  <div>
                    <span
                      v-for="index in 4"
                      :key="index"
                      class="skeleton-card"
                    ></span>
                  </div>
                </section>
                <section v-else class="collection-empty">
                  <span class="empty-symbol"><ExplorerIcon name="drive" /></span>
                  <h2>等待本地服务连接</h2>
                  <p>请通过 JapanGrad 启动入口打开工作台。</p>
                </section>
              </main>
              <footer class="explorer-footer">
                <span>大学 → 研究科 → 专攻 → 研究室 → 老师</span><button class="text-button" @click="workspaceOpen = true">
                  <ExplorerIcon name="drive" />本地工作区
                </button>
              </footer>
            </div>
          </div>
        </div>
        <Drawer
          v-model:open="navOpen"
          title="工作区导航"
          placement="left"
          :width="280"
          class="workspace-nav-drawer"
        >
          <WorkspaceNavigation
            :show-brand="false"
            @navigate="navOpen = false"
          />
        </Drawer>
        <Modal
          v-model:open="workspaceOpen"
          title="本地工作区"
          :footer="null"
          :width="580"
        >
          <div class="workspace-info">
            <p>大学记录、上传文件、论文和邮件保存在此文件夹。</p>
            <code>{{ store.workspacePath || '正在连接…' }}</code><Button
              class="icon-button"
              :disabled="!store.workspacePath"
              @click="copyWorkspace"
            >
              <ExplorerIcon name="copy" />{{
                pathCopied ? '已复制' : '复制文件夹路径'
              }}
            </Button>
            <p v-if="copyError" class="form-error" role="alert">
              {{ copyError }}
            </p>
          </div>
        </Modal>
      </div>
    </App>
  </ConfigProvider>
</template>
