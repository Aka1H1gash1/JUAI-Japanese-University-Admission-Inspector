<script setup lang="ts">
import { computed, ref } from 'vue';
import { App, Button, Checkbox, Input, Modal } from 'ant-design-vue';
import { useCommunicationsStore } from '../communications';
import type { StoredDocument } from '../documents';
import { fileUrl, fileSize, supportedFileAccept } from '../documents';
import { localApi, jsonOptions } from '../local-api';
import { japanToday } from '../application-planning';
const props = defineProps<{ professorId: string; experienceId: string }>();
const communications = useCommunicationsStore(),
  { message, modal } = App.useApp();
const files = computed(() =>
  communications.consentFiles(props.professorId, props.experienceId),
);
const open = ref(false),
  busy = ref(false),
  error = ref(''),
  file = ref<File>(),
  title = ref(''),
  signed = ref(false),
  signedDate = ref(''),
  inputKey = ref(0),
  editing = ref<StoredDocument>();
function add() {
  editing.value = undefined;
  file.value = undefined;
  title.value = '';
  signed.value = false;
  signedDate.value = '';
  error.value = '';
  inputKey.value++;
  open.value = true;
}
function edit(doc: StoredDocument) {
  editing.value = doc;
  file.value = undefined;
  title.value = doc.title;
  signed.value = doc.signed === true;
  signedDate.value = doc.signedDate || '';
  error.value = '';
  open.value = true;
}
function choose(value?: File) {
  if (!value) return;
  if (
    value.size > 50 * 1024 * 1024 ||
    !/\.(pdf|docx?|md|txt)$/i.test(value.name)
  ) {
    error.value = '请选择 PDF、DOC、DOCX、MD、TXT，单文件最多 50 MB。';
    return;
  }
  file.value = value;
  if (!title.value) title.value = value.name.replace(/\.[^.]+$/, '');
  error.value = '';
}
function drop(e: DragEvent) {
  if (busy.value) return;
  if (e.dataTransfer?.files.length !== 1) {
    error.value = '每次只上传一个文件。';
    return;
  }
  choose(e.dataTransfer.files[0]);
}
async function save() {
  if (!title.value.trim() || (!editing.value && !file.value)) {
    error.value = '请填写标题并选择文件。';
    return;
  }
  busy.value = true;
  error.value = '';
  try {
    if (editing.value)
      await localApi(
        `/documents/${editing.value.id}`,
        jsonOptions('PATCH', {
          title: title.value.trim(),
          signed: signed.value,
          signedDate: signed.value ? signedDate.value : '',
        }),
      );
    else {
      const metadata = {
        ownerType: 'professor',
        ownerId: props.professorId,
        experienceId: props.experienceId,
        kind: 'consent',
        year: Number(japanToday().slice(0, 4)),
        title: title.value.trim(),
        filename: file.value!.name,
        signed: signed.value,
        signedDate: signed.value ? signedDate.value : '',
      };
      await localApi('/documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-JapanGrad-Metadata': encodeURIComponent(JSON.stringify(metadata)),
        },
        body: file.value,
      });
    }
    await communications.load([props.professorId]);
    open.value = false;
    message.success('内诺文件已保存');
  } catch (e) {
    error.value = e instanceof Error ? e.message : '文件保存失败。';
  } finally {
    busy.value = false;
  }
}
function remove(doc: StoredDocument) {
  modal.confirm({
    title: `移除「${doc.title}」？`,
    content: '原文件会移入工作区回收目录。',
    okText: '移除',
    cancelText: '取消',
    async onOk() {
      await localApi(`/documents/${doc.id}`, { method: 'DELETE' });
      await communications.load([props.professorId]);
    },
  });
}
</script>
<template>
  <section class="consent-files">
    <header>
      <strong>内诺文件</strong
      ><Button size="small" @click="add">新增文件</Button>
    </header>
    <div v-if="files.length" class="consent-file-list">
      <article v-for="doc in files" :key="doc.id">
        <div>
          <a :href="fileUrl(doc.id)" target="_blank" rel="noopener noreferrer"
            >{{ doc.title }} ↗</a
          ><small
            >{{ fileSize(doc.size) }} ·
            {{
              doc.signed
                ? `已标记签署${doc.signedDate ? ` · ${doc.signedDate}` : ''}`
                : '未标记签署'
            }}</small
          >
        </div>
        <Button size="small" @click="edit(doc)">编辑</Button
        ><Button size="small" danger type="text" @click="remove(doc)"
          >移除</Button
        >
      </article>
    </div>
    <p v-else>尚未上传内诺文件，可保存签署文件或待签署版本。</p>
    <Modal
      v-model:open="open"
      :title="editing ? '编辑内诺文件' : '新增内诺文件'"
      :footer="null"
      :width="620"
      :mask-closable="!busy"
      :closable="!busy"
      :keyboard="!busy"
      ><form class="explorer-form" @submit.prevent="save">
        <div
          v-if="!editing"
          class="consent-drop"
          @dragover.prevent
          @drop.prevent="drop"
        >
          <label for="consent-file">{{
            file
              ? `${file.name} · ${fileSize(file.size)}`
              : '拖拽一个文件到这里，或点击选择文件'
          }}</label
          ><input
            id="consent-file"
            :key="inputKey"
            type="file"
            :accept="supportedFileAccept"
            :disabled="busy"
            @change="choose(($event.target as HTMLInputElement).files?.[0])"
          />
        </div>
        <div class="field">
          <label for="consent-title">文件标题</label
          ><Input
            id="consent-title"
            v-model:value="title"
            :maxlength="240"
            :disabled="busy"
          />
        </div>
        <div class="field">
          <Checkbox v-model:checked="signed" :disabled="busy"
            >标记为已签署</Checkbox
          >
        </div>
        <div v-if="signed" class="field">
          <label for="consent-signed-date">签署日期（可选）</label
          ><Input
            id="consent-signed-date"
            v-model:value="signedDate"
            type="date"
            :disabled="busy"
          />
        </div>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <footer class="form-footer">
          <span>保存原文件并关联当前考学经历</span
          ><Button :disabled="busy" @click="open = false">取消</Button
          ><Button type="primary" html-type="submit" :loading="busy"
            >保存文件</Button
          >
        </footer>
      </form></Modal
    >
  </section>
</template>
<style scoped>
.consent-files > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.consent-files > p {
  color: var(--jg-muted);
  font-size: 13px;
}
.consent-file-list {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}
.consent-file-list article {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--jg-line);
  border-radius: 8px;
  background: var(--jg-surface);
}
.consent-file-list article > div {
  flex: 1;
  min-width: 0;
}
.consent-file-list a {
  color: var(--jg-accent-text);
  overflow-wrap: anywhere;
}
.consent-file-list small {
  display: block;
  margin-top: 4px;
  color: var(--jg-muted);
}
.consent-drop {
  position: relative;
  padding: 28px;
  margin: 16px 0;
  border: 1px dashed var(--jg-border);
  border-radius: 8px;
  text-align: center;
  background: var(--jg-subtle);
}
.consent-drop input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}
.consent-drop:focus-within {
  outline: 2px solid var(--jg-accent);
  outline-offset: 3px;
}
.explorer-form > .field {
  margin: 18px 0;
}
</style>
