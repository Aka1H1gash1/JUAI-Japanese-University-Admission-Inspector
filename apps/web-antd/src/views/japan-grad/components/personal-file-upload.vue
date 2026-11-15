<script setup lang="ts">
import { ref } from 'vue';

import { Button, Input } from 'ant-design-vue';
const emit = defineEmits<{ uploaded: []; busy: [value: boolean] }>();
const busy = ref(false);
const errorMessage = ref('');
const selected = ref<File>();
const title = ref('');
async function upload() {
  if (!selected.value || busy.value) return;
  busy.value = true;
  emit('busy', true);
  errorMessage.value = '';
  try {
    const f = selected.value;
    const response = await fetch('/api/japangrad/documents', {
      method: 'POST',
      headers: {
        'X-JapanGrad-Client': '1',
        'X-JapanGrad-Metadata': encodeURIComponent(
          JSON.stringify({
            ownerType: 'workspace',
            ownerId: 'workspace',
            kind: 'other',
            year: new Date().getFullYear(),
            title: title.value.trim() || f.name,
            filename: f.name,
          }),
        ),
      },
      body: f,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '上传失败');
    title.value = '';
    selected.value = undefined;
    emit('uploaded');
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '上传失败';
  } finally {
    busy.value = false;
    emit('busy', false);
  }
}
</script>
<template>
  <form class="personal-upload" @submit.prevent="upload">
    <label>文件<input
        type="file"
        accept=".pdf,.doc,.docx,.md,.txt"
        :disabled="busy"
        @change="
          (e) => (selected = (e.target as HTMLInputElement).files?.[0])
        "
/></label><label>文件名称<Input
        v-model:value="title"
        :maxlength="240"
        :disabled="busy"
        placeholder="留空使用原文件名"
    /></label>
    <p v-if="errorMessage" class="form-error" role="alert">
      {{ errorMessage }}
    </p>
    <Button
      type="primary"
      html-type="submit"
      :disabled="!selected"
      :loading="busy"
    >
      上传文件
    </Button>
  </form>
</template>
<style scoped>
.personal-upload {
  display: grid;
  gap: 16px;
  padding-top: 16px;
}

.personal-upload label {
  display: grid;
  gap: 8px;
  font-size: 12px;
}
</style>
