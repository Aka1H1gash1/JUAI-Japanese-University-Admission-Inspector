<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { App, Button, Checkbox, Input, Modal, Select } from 'ant-design-vue';
import { useExplorerStore } from '../explorer';
import { jsonOptions, localApi } from '../local-api';
import { vAccessibleSelect } from '../select-accessibility';
interface Connection {
  id: string;
  name: string;
  majorIds: string[];
  createdAt: string;
  revokedAt: string;
}
interface Config {
  command: string;
  args: string[];
  env: Record<string, string>;
}
const open = defineModel<boolean>('open', { default: false });
const store = useExplorerStore(),
  { message } = App.useApp();
const name = ref('我的 Agent'),
  ids = ref<string[]>([]),
  rows = ref<Connection[]>([]),
  config = ref<Config>(),
  kind = ref('json'),
  busy = ref(false),
  feedback = ref('');
const majors = computed(() =>
  store.majors.map((m) => {
    const s = store.schools.find((s) => s.id === m.schoolId);
    return {
      value: m.id,
      label: `${store.universities.find((u) => u.id === s?.universityId)?.name ?? ''} / ${m.name}`,
    };
  }),
);
const text = computed(() =>
  !config.value
    ? ''
    : kind.value === 'json'
      ? JSON.stringify({ mcpServers: { juai: config.value } }, null, 2)
      : `[mcp_servers.juai]\ncommand = ${JSON.stringify(config.value.command)}\nargs = ${JSON.stringify(config.value.args)}\n\n[mcp_servers.juai.env]\n${Object.entries(
          config.value.env,
        )
          .map(([key, value]) => `${key} = ${JSON.stringify(value)}`)
          .join('\n')}\n`,
);
async function load() {
  try {
    rows.value = await localApi<Connection[]>('/analysis/connections');
  } catch (e) {
    feedback.value = e instanceof Error ? e.message : '连接读取失败。';
  }
}
watch(open, (value) => {
  config.value = undefined;
  feedback.value = '';
  if (value) {
    ids.value = [];
    name.value = '我的 Agent';
    void load();
  }
});
async function create() {
  busy.value = true;
  feedback.value = '';
  try {
    const result = await localApi<{ connection: Connection; config: Config }>(
      '/analysis/connections',
      jsonOptions('POST', { name: name.value, majorIds: ids.value }),
    );
    config.value = result.config;
    await load();
    message.success('已创建连接，请保存下方配置。');
  } catch (e) {
    feedback.value = e instanceof Error ? e.message : '创建失败。';
  } finally {
    busy.value = false;
  }
}
async function revoke(id: string) {
  busy.value = true;
  feedback.value = '';
  try {
    await localApi(`/analysis/connections/${id}`, jsonOptions('DELETE', {}));
    config.value = undefined;
    await load();
    message.success('连接已撤销');
  } catch (e) {
    feedback.value = e instanceof Error ? e.message : '撤销失败。';
  } finally {
    busy.value = false;
  }
}
async function copy() {
  try {
    await navigator.clipboard.writeText(text.value);
    message.success('配置已复制');
  } catch {
    feedback.value = '复制未完成，请在下方选中配置后手动复制。';
  }
}
</script>
<template>
  <Modal
    v-model:open="open"
    title="Agent 工作区接入"
    :width="860"
    :footer="null"
    :mask-closable="!busy"
    :closable="!busy"
    :keyboard="!busy"
  >
    <div class="agent-connection-body">
      <p class="form-context">
        让支持本地 MCP 的 Agent
        读取所选专攻的大学、研究室、报考资料和募集要项，并提交分析草稿。每次正式采纳在
        JUAI 中完成。
      </p>
      <div class="field">
        <label for="agent-name">连接名称</label
        ><Input
          id="agent-name"
          v-model:value="name"
          :maxlength="100"
          :disabled="busy"
        />
      </div>
      <div class="field agent-major-scope">
        <label>授权专攻</label
        ><Checkbox.Group
          v-model:value="ids"
          :options="majors"
          :disabled="busy"
        />
        <p v-if="!majors.length">请先建立大学与专攻。</p>
      </div>
      <Button
        type="primary"
        :loading="busy"
        :disabled="!ids.length || !name.trim()"
        @click="create"
        >创建连接配置</Button
      >
      <section v-if="config" class="agent-generated">
        <header>
          <h3>保存连接配置</h3>
          <Select
            v-accessible-select
            v-model:value="kind"
            :options="[
              { value: 'json', label: '通用 MCP JSON' },
              { value: 'toml', label: 'Codex config.toml' },
            ]"
            aria-label="连接配置格式"
          /><Button @click="copy">复制配置</Button>
        </header>
        <p>
          令牌仅在本次窗口显示，保存到 Agent
          的本地配置中。关闭后如遗失，请撤销并重新创建。JUAI
          服务需保持运行；模型处理资料的方式由所使用的 Agent 决定。
        </p>
        <Input.TextArea
          :value="text"
          readonly
          :rows="12"
          aria-label="Agent MCP 连接配置"
        />
      </section>
      <section class="agent-existing">
        <h3>已有连接</h3>
        <div v-for="row in rows" :key="row.id" class="agent-existing-row">
          <div>
            <strong>{{ row.name }}</strong
            ><small>{{
              row.majorIds
                .map(
                  (id) =>
                    majors.find((m) => m.value === id)?.label || '已删除专攻',
                )
                .join('、')
            }}</small
            ><small>{{
              row.revokedAt ? '已撤销' : '可读取授权资料并提交草稿'
            }}</small>
          </div>
          <Button
            danger
            :disabled="busy || !!row.revokedAt"
            @click="revoke(row.id)"
            >撤销连接</Button
          >
        </div>
        <p v-if="!rows.length">尚未创建 Agent 连接。</p>
      </section>
      <p v-if="feedback" class="form-error" role="alert">{{ feedback }}</p>
    </div>
    <div class="form-footer">
      <span>本地 STDIO 接入 · 权限由本机服务校验</span
      ><Button :disabled="busy" @click="open = false">关闭</Button>
    </div>
  </Modal>
</template>
<style scoped>
.agent-connection-body {
  max-height: 68vh;
  overflow: auto;
  padding-right: 8px;
}
.agent-connection-body > .field {
  margin: 16px 0;
}
.agent-major-scope .ant-checkbox-group {
  display: grid;
  gap: 10px;
  max-height: 220px;
  overflow: auto;
}
.agent-major-scope :deep(.ant-checkbox-wrapper) {
  margin: 0;
}
.agent-generated,
.agent-existing {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--jg-line);
}
.agent-generated header {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
}
.agent-generated h3 {
  margin: 0;
  flex: 1;
}
.agent-generated .ant-select {
  width: 200px;
}
.agent-generated p,
.agent-existing p {
  color: var(--jg-muted);
  font-size: 13px;
}
.agent-generated textarea {
  font-family: ui-monospace, monospace;
  font-size: 12px;
}
.agent-existing-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 0;
  border-bottom: 1px solid var(--jg-line);
}
.agent-existing-row small {
  display: block;
  color: var(--jg-muted);
  margin-top: 4px;
  overflow-wrap: anywhere;
}
</style>
