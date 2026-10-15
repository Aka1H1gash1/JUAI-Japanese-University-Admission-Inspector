<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  usePreferredDark,
  usePreferredReducedMotion,
  useStorage,
  useEventListener,
  useIntervalFn,
} from '@vueuse/core';
import {
  theme as antdTheme,
  App,
  Button,
  ConfigProvider,
  Drawer,
  Dropdown,
  Menu,
  Modal,
} from 'ant-design-vue';
import BrandMark from './components/brand-mark.vue';
import ExplorerIcon from './components/explorer-icon.vue';
import WorkspaceNavigation from './components/workspace-navigation.vue';
import AssistantChat from './components/assistant-chat.vue';
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
useIntervalFn(() => void refreshWorkspace(), 15000);
useEventListener(window, 'focus', () => void refreshWorkspace());

const route = useRoute();
const router = useRouter();
const parentNavigation = computed(() => {
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
      : { path: '/japan-grad', label: '大学清单' };
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
  if (universityId || route.path.replace(/\/$/, '') !== '/japan-grad')
    return { path: '/japan-grad', label: '大学清单' };
  return undefined;
});
function goToParent() {
  if (parentNavigation.value) void router.push(parentNavigation.value.path);
}
const navOpen = ref(false);
const assistantOpen = ref(false);
const workspaceOpen = ref(false);
const pathCopied = ref(false);
const copyError = ref('');
const preferredDark = usePreferredDark();
const preferredMotion = usePreferredReducedMotion();
const appearance = useStorage<'system' | 'light' | 'dark'>(
  'japangrad-appearance',
  'system',
);
const isDark = computed(
  () =>
    appearance.value === 'dark' ||
    (appearance.value === 'system' && preferredDark.value),
);
const previousTheme = document.documentElement.getAttribute(
  'data-japangrad-theme',
);
watch(
  isDark,
  (value) => {
    document.documentElement.setAttribute(
      'data-japangrad-theme',
      value ? 'dark' : 'light',
    );
  },
  { immediate: true },
);
onUnmounted(() => {
  if (previousTheme === null)
    document.documentElement.removeAttribute('data-japangrad-theme');
  else
    document.documentElement.setAttribute(
      'data-japangrad-theme',
      previousTheme,
    );
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
      '\"Avenir Next\", \"PingFang SC\", \"Hiragino Sans GB\", \"Microsoft YaHei\", sans-serif',
  },
}));
const saveLabel = computed(() =>
  store.storageError
    ? '本地服务异常'
    : store.loading
      ? '连接本地工作区…'
      : store.saving
        ? '正在保存…'
        : '已连接本地工作区',
);
const contextLabel = computed(() =>
  route.params.analysisMajorId
    ? '募集要项分析'
    : route.path === '/japan-grad/journey'
      ? '修考之路'
      : route.params.professorId
        ? '老师资料'
        : route.params.labId
          ? '研究室资料'
          : route.params.majorId
            ? '专攻资料'
            : route.params.schoolId
              ? '研究科'
              : route.params.universityId
                ? '大学详情'
                : '大学清单',
);
const appearanceLabel = computed(
  () =>
    ({ system: '跟随系统', light: '浅色模式', dark: '深色模式' })[
      appearance.value
    ],
);
function chooseAppearance(key: string | number) {
  if (key === 'system' || key === 'light' || key === 'dark')
    appearance.value = key;
}
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
  <ConfigProvider :theme="theme"
    ><App
      ><div class="university-explorer" :data-theme="isDark ? 'dark' : 'light'">
        <a class="skip-to-content" href="#japangrad-main">跳转到主要内容</a>
        <aside class="workspace-sidebar">
          <WorkspaceNavigation @workspace="workspaceOpen = true" />
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
                to="/japan-grad"
                class="explorer-brand mobile-brand"
                aria-label="JapanGrad 大学清单首页"
                ><span class="brand-mark"><BrandMark /></span
                ><strong>JapanGrad</strong></RouterLink
              >
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
                ><ExplorerIcon name="back" />返回上一级</Button
              >
              <span class="workspace-context-label">{{ contextLabel }}</span>
              <span class="local-state" role="status"
                ><i
                  :class="{
                    error: store.storageError,
                    pending: store.loading || store.saving,
                  }"
                ></i
                ><span>{{ saveLabel }}</span></span
              >
              <Button
                class="icon-button assistant-launch-button"
                :disabled="!store.loaded"
                aria-label="打开 AI 资料助手"
                :aria-expanded="assistantOpen"
                aria-controls="juai-assistant-panel"
                @click="assistantOpen = !assistantOpen"
                ><ExplorerIcon name="book" /><span>AI 助手</span></Button
              >
              <Dropdown :trigger="['click']"
                ><Button
                  class="appearance-button"
                  :aria-label="`界面主题：${appearanceLabel}`"
                  ><ExplorerIcon
                    :name="
                      appearance === 'system'
                        ? 'system'
                        : isDark
                          ? 'moon'
                          : 'sun'
                    "
                  /><span>{{ appearanceLabel }}</span></Button
                ><template #overlay
                  ><Menu
                    :selected-keys="[appearance]"
                    @click="({ key }) => chooseAppearance(key)"
                    ><Menu.Item key="system">跟随系统</Menu.Item
                    ><Menu.Item key="light">浅色模式</Menu.Item
                    ><Menu.Item key="dark">深色模式</Menu.Item></Menu
                  ></template
                ></Dropdown
              >
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
          <div
            class="workspace-body"
            :class="{ 'has-assistant': assistantOpen }"
          >
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
                  <span class="skeleton-title"></span
                  ><span class="skeleton-description"></span
                  ><span class="skeleton-toolbar"></span>
                  <div>
                    <span
                      v-for="index in 4"
                      :key="index"
                      class="skeleton-card"
                    ></span>
                  </div>
                </section>
                <section v-else class="collection-empty">
                  <span class="empty-symbol"
                    ><ExplorerIcon name="drive"
                  /></span>
                  <h2>等待本地服务连接</h2>
                  <p>请通过 JapanGrad 启动入口打开工作台。</p>
                </section>
              </main>
              <footer class="explorer-footer">
                <span>大学 → 研究科 → 专攻 → 研究室 → 老师</span
                ><button class="text-button" @click="workspaceOpen = true">
                  <ExplorerIcon name="drive" />本地工作区
                </button>
              </footer>
            </div>
            <AssistantChat v-model:open="assistantOpen" />
          </div>
        </div>
        <Drawer
          v-model:open="navOpen"
          title="工作区导航"
          placement="left"
          :width="280"
          class="workspace-nav-drawer"
          ><WorkspaceNavigation
            :show-brand="false"
            @navigate="navOpen = false"
            @workspace="
              navOpen = false;
              workspaceOpen = true;
            "
        /></Drawer>
        <Modal
          v-model:open="workspaceOpen"
          title="本地工作区"
          :footer="null"
          :width="580"
          ><div class="workspace-info">
            <p>大学记录、上传文件、论文和邮件保存在此文件夹。</p>
            <code>{{ store.workspacePath || '正在连接…' }}</code
            ><Button
              class="icon-button"
              :disabled="!store.workspacePath"
              @click="copyWorkspace"
              ><ExplorerIcon name="copy" />{{
                pathCopied ? '已复制' : '复制文件夹路径'
              }}</Button
            >
            <p v-if="copyError" class="form-error" role="alert">
              {{ copyError }}
            </p>
          </div></Modal
        >
      </div></App
    ></ConfigProvider
  >
</template>
