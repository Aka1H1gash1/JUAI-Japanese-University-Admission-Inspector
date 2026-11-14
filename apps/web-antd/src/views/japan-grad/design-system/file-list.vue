<script setup lang="ts">
import type { StoredDocument } from '../documents';

import ExplorerIcon from '../components/explorer-icon.vue';
import {
  documentReaderPath,
  fileFormat,
  fileSize,
  fileUrl,
  requiresDownload,
} from '../documents';
import EmptyState from './empty-state.vue';
defineProps<{ files: StoredDocument[]; loading?: boolean; error?: string }>();
defineEmits<{ retry: [] }>();
</script>
<template>
  <p v-if="loading" role="status" class="juai-file-status">正在读取文件…</p>
  <div v-else-if="error" role="alert" class="juai-file-error">
    <p>{{ error }}</p>
    <button type="button" @click="$emit('retry')">重试</button>
  </div>
  <ul v-else-if="files.length" class="juai-file-list">
    <li v-for="file in files" :key="file.id">
      <span class="juai-file-format">{{ fileFormat(file.filename) }}</span>
      <div class="juai-file-name">
        <a v-if="requiresDownload(file)" :href="fileUrl(file.id)" download>{{
          file.title || file.filename
        }}</a><RouterLink v-else :to="documentReaderPath(file.id)">
          {{ file.title || file.filename }}
        </RouterLink>
        <p>
          {{ file.year }} · {{ fileSize(file.size)
          }}<span v-if="file.kind === 'answer'"> · 对应答案</span>
        </p>
      </div>
      <a
        :href="fileUrl(file.id)"
        :aria-label="`下载 ${file.title || file.filename}`"
        download
        ><ExplorerIcon name="export" /></a>
    </li>
  </ul>
  <EmptyState
    v-else
    title="尚未保存文件"
    description="上传后可在这里阅读或下载原件。"
  />
</template>
<style scoped>
.juai-file-list {
  display: grid;
  gap: 16px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.juai-file-list li {
  display: flex;
  gap: 12px;
  align-items: center;
  min-width: 0;
}

.juai-file-format {
  flex-shrink: 0;
  padding: 8px 6px;
  font-size: 9px;
  color: var(--jg-muted);
  background: var(--jg-subtle);
  border-radius: 4px;
}

.juai-file-name {
  flex: 1;
  min-width: 0;
}

.juai-file-name a {
  font-size: 12px;
  font-weight: 500;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.juai-file-name p {
  margin-top: 4px;
  font-size: 11px;
  color: var(--jg-muted);
}

.juai-file-list li > a {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 32px;
  height: 32px;
  color: var(--jg-accent-text);
}

.juai-file-status,
.juai-file-error {
  font-size: 12px;
  color: var(--jg-muted);
}

.juai-file-error {
  color: var(--jg-error);
}

.juai-file-error button {
  padding: 4px 0;
  text-decoration: underline;
  cursor: pointer;
}

@media (max-width: 720px) {
  .juai-file-list li > a {
    width: 40px;
    height: 40px;
  }
}
</style>
