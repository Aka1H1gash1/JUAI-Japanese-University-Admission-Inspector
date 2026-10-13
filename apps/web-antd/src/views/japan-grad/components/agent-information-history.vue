<script setup lang="ts">
import { ref, watch } from 'vue';
import { App, Button, Modal } from 'ant-design-vue';
import { jsonOptions, localApi } from '../local-api';
import { useExplorerStore } from '../explorer';
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
const rows = ref<Change[]>([]),
  total = ref(0),
  offset = ref(0),
  busy = ref(false),
  error = ref(''),
  detail = ref<Detail>(),
  detailOpen = ref(false);
async function load(next = offset.value) {
  busy.value = true;
  error.value = '';
  try {
    const result = await localApi<{ total: number; records: Change[] }>(
      `/information/history?offset=${next}`,
    );
    rows.value = result.records;
    total.value = result.total;
    offset.value = next;
  } catch (e) {
    error.value = e instanceof Error ? e.message : '修改记录读取失败。';
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
  error.value = '';
  try {
    detail.value = await localApi<Detail>(`/information/history/${row.id}`);
    detailOpen.value = true;
  } catch (e) {
    error.value = e instanceof Error ? e.message : '修改详情读取失败。';
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
      } catch (e) {
        message.error(e instanceof Error ? e.message : '撤销失败。');
        throw e;
      }
    },
  });
}
const format = (value: unknown) =>
  value === undefined
    ? '原来没有此字段'
    : typeof value === 'string'
      ? value || '（空）'
      : JSON.stringify(value, null, 2);
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
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <div v-for="row in rows" :key="row.id" class="information-change">
      <div>
        <strong>{{ row.summary }}</strong
        ><span>{{ row.connectionName }} / {{ row.name }}</span
        ><code>{{ row.path }}</code
        ><small
          >{{ new Date(row.createdAt).toLocaleString('zh-CN') }} · 修订
          {{ row.revision }}{{ row.undoneAt ? ' · 已撤销' : '' }}</small
        >
      </div>
      <div class="information-change-actions">
        <Button :disabled="busy" @click="inspect(row)">查看对照</Button
        ><Button
          v-if="row.action !== 'undo'"
          :disabled="busy || !row.canUndo"
          @click="undo(row)"
          >撤销</Button
        >
      </div>
    </div>
    <p v-if="!rows.length && !busy && !error">暂无 Agent 信息修改记录。</p>
    <footer v-if="total > 50">
      <Button
        :disabled="busy || offset === 0"
        @click="load(Math.max(0, offset - 50))"
        >上一页</Button
      ><span
        >{{ offset + 1 }}-{{ Math.min(offset + 50, total) }} / {{ total }}</span
      ><Button
        :disabled="busy || offset + 50 >= total"
        @click="load(offset + 50)"
        >下一页</Button
      >
    </footer>
    <Modal
      v-model:open="detailOpen"
      title="信息修改前后对照"
      :width="1000"
      :footer="null"
    >
      <template v-if="detail"
        ><p class="form-context">{{ detail.summary }} / {{ detail.path }}</p>
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
          }}</span
          ><Button
            v-if="detail.action !== 'undo'"
            :disabled="!detail.canUndo"
            @click="undo(detail)"
            >撤销本次修改</Button
          ><Button @click="detailOpen = false">关闭</Button>
        </div></template
      >
    </Modal>
  </section>
</template>
<style scoped>
.information-history {
  padding-top: 20px;
  margin-top: 24px;
  border-top: 1px solid var(--jg-line);
}
.information-history > header,
.information-history > footer,
.information-change {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: start;
}
.information-history h3 {
  margin: 0;
}
.information-history p {
  color: var(--jg-secondary);
  font-size: 13px;
}
.information-change {
  padding: 16px 0;
  border-bottom: 1px solid var(--jg-line);
}
.information-change > div:first-child {
  min-width: 0;
  display: grid;
  gap: 5px;
}
.information-change span,
.information-change code,
.information-change small {
  color: var(--jg-muted);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.information-change-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.information-history > footer {
  margin-top: 16px;
  align-items: center;
}
.information-diff-scroll {
  overflow-x: auto;
  margin: 16px 0;
}
.information-diff {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  min-width: 600px;
}
.information-diff th,
.information-diff td {
  padding: 14px;
  border-bottom: 1px solid var(--jg-line);
  text-align: left;
  vertical-align: top;
}
.information-diff th {
  color: var(--jg-secondary);
  background: var(--jg-subtle);
}
.information-diff th:first-child {
  width: 180px;
}
.information-diff pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  margin: 0;
  max-height: 360px;
  overflow-y: auto;
  font: 13px/1.7 var(--jg-font);
  color: var(--jg-text);
}
@media (max-width: 600px) {
  .information-history > header,
  .information-change {
    flex-wrap: wrap;
  }
}
</style>
