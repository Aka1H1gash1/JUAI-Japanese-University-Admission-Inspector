<script setup lang="ts">
import { vAccessibleSelect } from '../select-accessibility';
import { computed, ref, watch } from 'vue';
import { App, Button, Input, Modal, Select, Spin } from 'ant-design-vue';

import { jsonOptions, localApi } from '../local-api';
import ExplorerIcon from './explorer-icon.vue';

interface MailRecord {
  id: string;
  professorId: string;
  direction: 'received' | 'sent';
  subject: string;
  body: string;
  address: string;
  date: string;
  notes: string;
  nextAction: string;
  followUpDate: string;
  createdAt: string;
}
const props = defineProps<{ professorId: string; email: string }>();
const { message, modal } = App.useApp();
const records = ref<MailRecord[]>([]);
const loading = ref(false);
const feedback = ref('');
const query = ref('');
const direction = ref<string | undefined>();
const editorOpen = ref(false);
const busy = ref(false);
const editError = ref('');
const expanded = ref<string[]>([]);
const localNow = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
};
const blank = (): MailRecord => ({
  id: '',
  professorId: props.professorId,
  direction: 'sent',
  subject: '',
  body: '',
  address: props.email,
  date: localNow(),
  notes: '',
  nextAction: '',
  followUpDate: '',
  createdAt: '',
});
const form = ref<MailRecord>(blank());
let generation = 0;
const visible = computed(() =>
  records.value
    .filter(
      (item) =>
        (!direction.value || item.direction === direction.value) &&
        [item.subject, item.body, item.address, item.notes, item.nextAction]
          .join(' ')
          .toLowerCase()
          .includes(query.value.trim().toLowerCase()),
    )
    .toSorted(
      (a, b) =>
        b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
    ),
);

async function load() {
  const current = ++generation;
  loading.value = true;
  feedback.value = '';
  records.value = [];
  try {
    const data = await localApi<MailRecord[]>(
      `/messages?professorId=${encodeURIComponent(props.professorId)}`,
    );
    if (current === generation) records.value = data;
  } catch (error) {
    if (current === generation)
      feedback.value =
        error instanceof Error ? error.message : '邮件记录读取失败。';
  } finally {
    if (current === generation) loading.value = false;
  }
}
watch(
  () => props.professorId,
  () => {
    query.value = '';
    direction.value = undefined;
    expanded.value = [];
    editorOpen.value = false;
    void load();
  },
  { immediate: true },
);
function edit(item?: MailRecord) {
  form.value = item ? { ...item } : blank();
  editError.value = '';
  editorOpen.value = true;
}
async function save() {
  if (busy.value) return;
  if (
    !form.value.subject.trim() ||
    !form.value.body.trim() ||
    !form.value.date
  ) {
    editError.value = '请填写主题、邮件正文和日期。';
    return;
  }
  busy.value = true;
  editError.value = '';
  const input = { ...form.value };
  try {
    const item = await localApi<MailRecord>(
      input.id ? `/messages/${input.id}` : '/messages',
      jsonOptions(input.id ? 'PUT' : 'POST', input),
    );
    if (item.professorId === props.professorId) {
      const index = records.value.findIndex((record) => record.id === item.id);
      if (index === -1) records.value.push(item);
      else records.value[index] = item;
      if (!expanded.value.includes(item.id)) expanded.value.push(item.id);
    }
    editorOpen.value = false;
    message.success('邮件记录已保存到本地。');
  } catch (error) {
    editError.value = error instanceof Error ? error.message : '邮件保存失败。';
  } finally {
    busy.value = false;
  }
}
function remove(item: MailRecord) {
  modal.confirm({
    title: '删除这条邮件记录？',
    content: `将从本地工作区删除「${item.subject}」的复制内容。`,
    okText: '确认删除',
    cancelText: '取消',
    okButtonProps: { danger: true },
    async onOk() {
      try {
        await localApi(`/messages/${item.id}`, { method: 'DELETE' });
        records.value = records.value.filter((record) => record.id !== item.id);
      } catch (error) {
        feedback.value =
          error instanceof Error ? error.message : '邮件删除失败。';
        throw error;
      }
    },
  });
}
function toggle(id: string) {
  expanded.value = expanded.value.includes(id)
    ? expanded.value.filter((item) => item !== id)
    : [...expanded.value, id];
}
</script>

<template>
  <section class="professor-mail" aria-label="邮件往来记录">
    <header class="archive-heading">
      <div>
        <h2>
          邮件往来<span>{{ records.length }}</span>
        </h2>
        <p>粘贴已发送或收到的邮件，留存沟通记录与下一步行动。</p>
      </div>
      <Button type="primary" :disabled="loading" @click="edit()"
        >记录邮件</Button
      >
    </header>
    <p class="mail-local-note">
      当前由你手动复制粘贴，记录保存在本地工作区。邮箱连接留待后续版本。
    </p>
    <p v-if="feedback" role="alert" class="form-error">
      {{ feedback }}
      <button class="text-button" @click="load()">重新加载</button>
    </p>
    <div v-if="records.length" class="archive-toolbar">
      <Input
        v-model:value="query"
        aria-label="搜索邮件"
        placeholder="搜索主题、正文或下一步行动"
        allow-clear
      /><Select
        v-accessible-select
        v-model:value="direction"
        aria-label="邮件方向筛选"
        placeholder="全部往来"
        allow-clear
        :options="[
          { label: '已发送', value: 'sent' },
          { label: '已收到', value: 'received' },
        ]"
      />
    </div>
    <Spin :spinning="loading">
      <div v-if="visible.length" class="mail-timeline">
        <article
          v-for="item in visible"
          :key="item.id"
          class="mail-card"
          :data-direction="item.direction"
        >
          <div class="mail-meta">
            <span class="mail-direction">{{
              item.direction === 'sent' ? '已发送 ↗' : '已收到 ↙'
            }}</span
            ><time>{{ item.date.replace('T', ' ') }}</time>
          </div>
          <button
            class="mail-subject"
            :aria-expanded="expanded.includes(item.id)"
            @click="toggle(item.id)"
          >
            {{ item.subject
            }}<span>{{
              expanded.includes(item.id) ? '收起 −' : '展开 +'
            }}</span>
          </button>
          <p v-if="item.address" class="mail-address">
            {{ item.direction === 'sent' ? '收件人' : '发件人' }}：{{
              item.address
            }}
          </p>
          <div v-if="expanded.includes(item.id)" class="mail-expanded">
            <pre class="mail-body">{{ item.body }}</pre>
            <p v-if="item.notes" class="archive-notes">
              备注：{{ item.notes }}
            </p>
          </div>
          <div
            v-if="item.nextAction || item.followUpDate"
            class="mail-followup"
          >
            <strong>下一步</strong><span>{{ item.nextAction || '待补充' }}</span
            ><time v-if="item.followUpDate"
              >跟进日期 {{ item.followUpDate }}</time
            >
          </div>
          <div class="archive-card-actions">
            <Button size="small" @click="edit(item)">编辑邮件</Button
            ><Button
              size="small"
              type="text"
              danger
              :aria-label="`删除邮件：${item.subject}`"
              @click="remove(item)"
              >删除</Button
            >
          </div>
        </article>
      </div>
      <div v-else-if="!loading" class="archive-empty">
        <ExplorerIcon name="book" />
        <h3>
          {{ records.length ? '没有找到相关邮件' : '留下第一封沟通记录' }}
        </h3>
        <p>
          {{
            records.length
              ? '试试其他关键词或收发方向。'
              : '复制邮件正文，记录日期、收发方向和后续行动。'
          }}
        </p>
      </div>
    </Spin>
    <Modal
      v-model:open="editorOpen"
      :title="form.id ? '编辑邮件记录' : '记录邮件往来'"
      :width="720"
      :footer="null"
      :mask-closable="!busy"
      :closable="!busy"
      :keyboard="!busy"
    >
      <form class="explorer-form mail-editor" @submit.prevent="save">
        <div class="form-fields">
          <div class="field">
            <label for="mail-direction">收发方向</label
            ><Select
              v-accessible-select
              id="mail-direction"
              v-model:value="form.direction"
              :options="[
                { label: '已发送', value: 'sent' },
                { label: '已收到', value: 'received' },
              ]"
            />
          </div>
          <div class="field">
            <label for="mail-date">邮件日期 *</label
            ><input
              id="mail-date"
              v-model="form.date"
              type="datetime-local"
              required
            />
          </div>
          <div class="field full">
            <label for="mail-address">{{
              form.direction === 'sent' ? '收件人邮箱' : '发件人邮箱'
            }}</label
            ><Input
              id="mail-address"
              v-model:value="form.address"
              :maxlength="300"
            />
          </div>
          <div class="field full">
            <label for="mail-subject">主题 *</label
            ><Input
              id="mail-subject"
              v-model:value="form.subject"
              :maxlength="240"
            />
          </div>
          <div class="field full">
            <label for="mail-body">邮件正文 *</label
            ><Input.TextArea
              id="mail-body"
              v-model:value="form.body"
              :rows="9"
              :maxlength="100000"
              placeholder="把邮件原文复制粘贴到这里…"
            />
          </div>
          <div class="field full">
            <label for="mail-next-action">下一步行动</label
            ><Input.TextArea
              id="mail-next-action"
              v-model:value="form.nextAction"
              :rows="2"
              :maxlength="2000"
              placeholder="如：补发研究计划书、确认面试安排"
            />
          </div>
          <div class="field">
            <label for="mail-followup">跟进日期</label
            ><input
              id="mail-followup"
              v-model="form.followUpDate"
              type="date"
            />
          </div>
          <div class="field full">
            <label for="mail-notes">个人备注</label
            ><Input.TextArea
              id="mail-notes"
              v-model:value="form.notes"
              :rows="2"
              :maxlength="8000"
            />
          </div>
        </div>
        <p v-if="editError" role="alert" class="form-error">{{ editError }}</p>
        <div class="form-footer">
          <Button :disabled="busy" @click="editorOpen = false">取消</Button
          ><Button type="primary" html-type="submit" :loading="busy"
            >保存邮件记录</Button
          >
        </div>
      </form>
    </Modal>
  </section>
</template>
