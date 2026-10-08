<script setup lang="ts">
import { computed } from 'vue';

import { theme as antdTheme, App, ConfigProvider } from 'ant-design-vue';

import ExplorerIcon from './components/explorer-icon.vue';
import { useExplorerStore } from './explorer';

import './style.css';

const store = useExplorerStore();
const theme = {
  inherit: false,
  algorithm: antdTheme.defaultAlgorithm,
  token: {
    colorPrimary: '#b65335',
    colorBgContainer: '#ffffff',
    colorText: '#253b3c',
    colorTextPlaceholder: '#929c9b',
    colorBorder: '#dbe1df',
    borderRadius: 7,
    fontFamily: '"Avenir Next", "PingFang SC", "Hiragino Sans GB", sans-serif',
  },
};
const saveLabel = computed(() =>
  store.storageError ? '本地保存异常' : '此浏览器本地保存',
);
</script>

<template>
  <ConfigProvider :theme="theme">
    <App>
      <div class="university-explorer">
        <header class="explorer-topbar">
          <div class="topbar-inner">
            <RouterLink
              to="/japan-grad"
              class="explorer-brand"
              aria-label="JapanGrad 大学清单首页"
            >
              <span class="brand-mark"><ExplorerIcon name="book" /></span><strong>JapanGrad<span>择校笔记</span></strong>
            </RouterLink>
            <RouterLink to="/japan-grad" class="topbar-home">
              大学清单
            </RouterLink>
            <span class="local-state"><i :class="{ error: store.storageError }"></i>{{ saveLabel }}</span>
          </div>
        </header>
        <div v-if="store.storageError" class="storage-alert" role="alert">
          {{ store.storageError }}
        </div>
        <main class="explorer-main"><RouterView /></main>
        <footer class="explorer-footer">
          <span>JapanGrad</span><span>大学 → 研究科 → 专攻，找到适合自己的老师。</span>
        </footer>
      </div>
    </App>
  </ConfigProvider>
</template>
