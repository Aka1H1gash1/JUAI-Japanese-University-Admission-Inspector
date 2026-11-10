<script setup lang="ts">
import { ref, watch } from 'vue';

import { App, Button, Modal } from 'ant-design-vue';

import { useExplorerStore } from '../explorer';
import { jsonOptions, localApi } from '../local-api';
interface Change {
  id: string;
  connectionName: string;
  path: string;
  name: string;
  summary: string;
  changedFields: string[];
  createdAt: string;
  revision: number;
  undoneAt: string;
  action: string;
  canUndo: boolean;
}
interface Detail extends Change {
  before: { data: Record<string, unknown> };
  after: { data: Record<string, unknown> };
}
const props = defineProps<{ active: boolean }>();
const { message, modal } = App.useApp();
const store = useExplorerStore();
const busy = ref(false);
const detail = ref<Detail>();
const detailOpen = ref(false);
const errorMessage = ref('');
const offset = ref(0);
const rows = ref<Change[]>([]);
const total = ref(0);
async function load(next = offset.value) {
  busy.value = true;
  errorMessage.value = '';
  try {
    const result = await localApi<{ total: number; records: Change[] }>(
      `/information/history?offset=${next}`,
    );
    rows.value = result.records;
    total.value = result.total;
    offset.value = next;
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '修改记录读取失败。';
  } finally {
    busy.value = false;
  }
}
watch(
  () => props.active,
  (value) => {
    if (value) void load(0);
  },
  { immediate: true },
);
async function inspect(row: Change) {
  busy.value = true;
  errorMessage.value = '';
  try {
    detail.value = await localApi<Detail>(`/information/history/${row.id}`);
    detailOpen.value = true;
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '修改详情读取失败。';
  } finally {
    busy.value = false;
  }
}
function undo(row: Change) {
  modal.confirm({
    title: `撤销「${row.summary}」？`,
    content:
      '只恢复这次修改过的字段，其余资料保留。相关字段后来有新修改时，会拒绝撤销。',
    okText: '确认撤销',
    cancelText: '取消',
    async onOk() {
      try {
        await localApi(
          `/information/history/${row.id}/undo`,
          jsonOptions('POST', { confirm: true }),
        );
        detailOpen.value = false;
        await store.refresh();
        await load();
        message.success('已撤销本次信息修改');
      } catch (error) {
        message.error(error instanceof Error ? error.message : '撤销失败。');
        throw error;
      }
    },
  });
}
function format(value: unknown) {
  if (value === undefined) return '原来没有此字段';
  if (typeof value === 'string') return value || '（空）';
  return JSON.stringify(value, null, 2);
}
</script>
<template>
  <section class="information-history" aria-label="Agent 信息修改记录">
    <header>
      <div>
        <h3>信息修改记录</h3>
        <p>保存前后内容可对照；相关字段未被再次修改时可以撤销。</p>
      </div>
      <Button :loading="busy" @click="load()">刷新记录</Button>
    </header>
    <p v-if="errorMessage" class="form-error" role="alert">
      {{ errorMessage }}
    </p>
    <div v-for="row in rows" :key="row.id" class="information-change">
      <div>
        <strong>{{ row.summary }}</strong><span>{{ row.connectionName }} / {{ row.name }}</span><code>{{ row.path }}</code><small>{{ new Date(row.createdAt).toLocaleString('zh-CN') }} · 修订
          {{ row.revision }}{{ row.undoneAt ? ' · 已撤销' : '' }}</small>
      </div>
      <div class="information-change-actions">
        <Button :disabled="busy" @click="inspect(row)">查看对照</Button><Button
          v-if="row.action !== 'undo'"
          :disabled="busy || !row.canUndo"
          @click="undo(row)"
        >
          撤销
        </Button>
      </div>
    </div>
    <p v-if="!rows.length && !busy && !errorMessage">
      暂无 Agent 信息修改记录。
    </p>
    <footer v-if="total > 50">
      <Button
        :disabled="busy || offset === 0"
        @click="load(Math.max(0, offset - 50))"
      >
        上一页
</Button><span>{{ offset + 1 }}-{{ Math.min(offset + 50, total) }} / {{ total }}</span><Button
        :disabled="busy || offset + 50 >= total"
        @click="load(offset + 50)"
      >
        下一页
      </Button>
    </footer>
    <Modal
      v-model:open="detailOpen"
      title="信息修改前后对照"
      :width="1000"
      :footer="null"
    >
      <template v-if="detail">
        <p class="form-context">{{ detail.summary }} / {{ detail.path }}</p>
        <div class="information-diff-scroll">
          <table class="information-diff">
            <thead>
              <tr>
                <th scope="col">字段</th>
                <th scope="col">修改前</th>
                <th scope="col">修改后</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="key in detail.changedFields" :key="key">
                <th scope="row">{{ key }}</th>
                <td>
                  <pre>{{ format(detail.before.data[key]) }}</pre>
                </td>
                <td>
                  <pre>{{ format(detail.after.data[key]) }}</pre>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="form-footer">
          <span>{{
            detail.canUndo ? '可撤销此次修改' : '已撤销或相关字段已有新修改'
          }}</span><Button
            v-if="detail.action !== 'undo'"
            :disabled="!detail.canUndo"
            @click="undo(detail)"
          >
            撤销本次修改
</Button><Button @click="detailOpen = false">关闭</Button>
        </div>
      </template>
    </Modal>
  </section>
</template>
<style scoped>
.information-history {
  padding-top: 17px;
  margin-top: 20px;
  border-top: 1px solid var(--jg-line);
}

.information-history > header,
.information-history > footer,
.information-change {
  display: flex;
  gap: 14px;
  align-items: start;
  justify-content: space-between;
}

.information-history h3 {
  margin: 0;
}

.information-history p {
  font-size: 11px;
  color: var(--jg-secondary);
}

.information-change {
  padding: 14px 0;
  border-bottom: 1px solid var(--jg-line);
}

.information-change > div:first-child {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.information-change span,
.information-change code,
.information-change small {
  font-size: 11px;
  color: var(--jg-muted);
  overflow-wrap: anywhere;
}

.information-change-actions {
  display: flex;
  flex-shrink: 0;
  gap: 7px;
}

.information-history > footer {
  align-items: center;
  margin-top: 14px;
}

.information-diff-scroll {
  margin: 14px 0;
  overflow-x: auto;
}

.information-diff {
  width: 100%;
  min-width: 510px;
  table-layout: fixed;
  border-collapse: collapse;
}

.information-diff th,
.information-diff td {
  padding: 12px;
  vertical-align: top;
  text-align: left;
  border-bottom: 1px solid var(--jg-line);
}

.information-diff th {
  color: var(--jg-secondary);
  background: var(--jg-subtle);
}

.information-diff th:first-child {
  width: 153px;
}

.information-diff pre {
  max-height: 306px;
  margin: 0;
  overflow-y: auto;
  font: 13px/1.7 var(--jg-font);
  color: var(--jg-text);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

@media (max-width: 600px) {
  .information-history > header,
  .information-change {
    flex-wrap: wrap;
  }
}
</style>
