<script setup lang="ts">
import type {
  AiConnection,
  AiFeature,
  AiManagement,
  AiModel,
  AiNativeState,
  AiProvider,
} from './ai-management-types';

import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import {
  App,
  Button,
  Checkbox,
  Input,
  InputNumber,
  Modal,
  Select,
  Switch,
} from 'ant-design-vue';

import AgentConnections from './components/agent-connections.vue';
import ExplorerIcon from './components/explorer-icon.vue';
import { useExplorerStore } from './explorer';
import { jsonOptions, localApi } from './local-api';
import { vAccessibleSelect } from './select-accessibility';

interface ExternalAgent {
  id: string;
  name: string;
  majorIds: string[];
  revokedAt: string;
  lastUsedAt?: string;
  informationAccess?: string;
}
const route = useRoute();
const store = useExplorerStore();
const { message, modal } = App.useApp();
const data = ref<AiManagement>();
const external = ref<ExternalAgent[]>([]);
const tab = ref('features');
const features = ref<AiFeature[]>([]);
const permissions = ref({
  majorIds: [] as string[],
  writableKinds: [] as string[],
});
const busy = ref('');
const loading = ref(false);
const errorMessage = ref('');
const editorOpen = ref(false);
const externalOpen = ref(false);
const apiKey = ref('');
const editorError = ref('');
const editorId = ref('');
const loginUrl = ref('');
const form = ref(blankForm('deepseek'));
const activeAgents = computed(() => external.value.filter((a) => !a.revokedAt));
const connections = computed(() => data.value?.connections || []);
const selectedConnection = (id: string) =>
  connections.value.find((c) => c.id === id);
const typeNames = {
  codex: '本机 Codex',
  deepseek: 'DeepSeek',
  compatible: 'OpenAI 兼容 API',
  openai: 'OpenAI API',
};
function notifyConfigChange() {
  window.dispatchEvent(new Event('juai-ai-config-changed'));
}
const connectionOptions = computed(() => [
  { value: '', label: '暂不分配 / 解除绑定' },
  ...connections.value.map((c) => ({
    value: c.id,
    label: `${c.name}${c.enabled ? '' : ' · 已停用'}`,
  })),
]);
const majors = computed(() =>
  store.majors.map((m) => {
    const school = store.schools.find((s) => s.id === m.schoolId);
    const uni = store.universities.find((u) => u.id === school?.universityId);
    return { value: m.id, label: `${uni?.name || ''} / ${m.name}` };
  }),
);
const kindOptions = [
  { value: 'major', label: '专攻与考试资料' },
  { value: 'lab', label: '研究室与材料清单' },
  { value: 'professor', label: '老师基本资料' },
  { value: 'school', label: '研究科资料' },
  { value: 'university', label: '大学与预算' },
];
let generation = 0;
function blankForm(kind: AiConnection['kind']) {
  const provider: AiProvider =
    kind === 'codex'
      ? {
          protocol: 'codex',
          baseUrl: 'local-codex',
          model: '',
          codexPath: '',
          stream: true,
        }
      : {
          protocol: kind === 'openai' ? 'responses' : 'chat_completions',
          baseUrl: (() => {
            if (kind === 'deepseek') {
              return 'https://api.deepseek.com';
            }
            if (kind === 'openai') {
              return 'https://api.openai.com/v1';
            }
            return '';
          })(),
          model: kind === 'deepseek' ? 'deepseek-flash' : '',
          stream: true,
          thinking: 'disabled',
          reasoningEffort: 'high',
          jsonMode: (() => {
            if (kind === 'deepseek') {
              return 'json';
            }
            if (kind === 'openai') {
              return 'schema';
            }
            return 'prompt';
          })(),
          maxOutputTokens: 8192,
        };
  return {
    name: (() => {
      if (kind === 'deepseek') {
        return '我的 DeepSeek';
      }
      if (kind === 'codex') {
        return '本机 Codex';
      }
      return '';
    })(),
    kind,
    provider,
    enabled: true,
    supportsImages: kind === 'deepseek',
    supportsTools: true,
    notes: '',
  };
}
function models(connection?: AiConnection): AiModel[] {
  if (!connection) return [];
  if (connection.discovery?.models.length) return connection.discovery.models;
  if (connection.kind === 'deepseek')
    return [
      { id: 'deepseek-flash', name: 'DeepSeek Flash' },
      { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' },
    ];
  if (connection.kind === 'codex') return data.value?.native.models || [];
  return [];
}
const editorModels = computed(() =>
  models(
    (() => {
      if (editorId.value) {
        return selectedConnection(editorId.value);
      }
      if (form.value.kind === 'deepseek') {
        return { kind: 'deepseek' } as AiConnection;
      }
      return undefined;
    })(),
  ),
);
function connectionState(c: AiConnection) {
  if (c.enabled) {
    if (c.kind === 'codex') {
      if (data.value?.native.ready && c.discovery) {
        return '已检测本机';
      }
      return '待检测';
    }
    if (c.provider.local) {
      return '本地接口';
    }
    if (c.keyConfigured) {
      return '密钥已就绪';
    }
    return '需要填写密钥';
  }
  return '已停用';
}
async function load(preserveDrafts = false) {
  const version = ++generation;
  loading.value = true;
  errorMessage.value = '';
  try {
    const [result, agents] = await Promise.all([
      localApi<AiManagement>('/ai/management'),
      localApi<ExternalAgent[]>('/analysis/connections'),
    ]);
    if (version !== generation) return;
    data.value = result;
    if (!preserveDrafts || features.value.length === 0)
      features.value = structuredClone(result.features);
    if (!preserveDrafts)
      permissions.value = structuredClone(result.permissions);
    external.value = agents;
  } catch (error) {
    if (version === generation)
      errorMessage.value =
        error instanceof Error ? error.message : 'AI 配置读取失败。';
  } finally {
    if (version === generation) loading.value = false;
  }
}
void load();
watch(
  () => route.query.tab,
  (value) => {
    if (['agents', 'connections', 'features'].includes(String(value)))
      tab.value = String(value);
  },
  { immediate: true },
);
watch(externalOpen, (open) => {
  if (!open) void load();
});
onBeforeUnmount(() => {
  generation++;
  apiKey.value = '';
});
function edit(connection?: AiConnection) {
  editorId.value = connection?.id || '';
  editorError.value = '';
  apiKey.value = '';
  form.value = connection
    ? {
        name: connection.name,
        kind: connection.kind,
        provider: { ...connection.provider },
        enabled: connection.enabled,
        supportsImages: connection.supportsImages,
        supportsTools: connection.supportsTools,
        notes: connection.notes,
      }
    : blankForm('deepseek');
  editorOpen.value = true;
}
function chooseKind(kind: unknown) {
  if (
    kind !== 'codex' &&
    kind !== 'deepseek' &&
    kind !== 'compatible' &&
    kind !== 'openai'
  )
    return;
  const previous = form.value;
  form.value = {
    ...blankForm(kind),
    name:
      previous.name && !['我的 DeepSeek', '本机 Codex'].includes(previous.name)
        ? previous.name
        : blankForm(kind).name,
    notes: previous.notes,
  };
  apiKey.value = '';
}
async function saveConnection() {
  busy.value = 'save';
  editorError.value = '';
  try {
    await localApi(
      `/ai/connections${editorId.value ? `/${editorId.value}` : ''}`,
      jsonOptions(editorId.value ? 'PUT' : 'POST', {
        ...form.value,
        ...(apiKey.value.trim() ? { apiKey: apiKey.value.trim() } : {}),
      }),
    );
    apiKey.value = '';
    editorOpen.value = false;
    tab.value = 'connections';
    await load(true);
    message.success('AI 连接已保存，可在功能分配中选择。');
    notifyConfigChange();
  } catch (error) {
    editorError.value =
      error instanceof Error ? error.message : '连接保存失败。';
  } finally {
    busy.value = '';
  }
}
async function discover(connection: AiConnection) {
  busy.value = `models-${connection.id}`;
  errorMessage.value = '';
  try {
    const result = await localApi<{
      native?: AiNativeState;
      models: AiModel[];
      message?: string;
    }>(`/ai/connections/${connection.id}/models`, jsonOptions('POST', {}));
    if (result.native && data.value) data.value.native = result.native;
    if (result.native?.needsLogin) {
      message.info('请先登录本机 Codex，再重新检测。');
      tab.value = 'agents';
    } else message.success(result.message || '已读取模型目录，未发起推理。');
    await load(true);
    notifyConfigChange();
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : '连接检测失败；支持手动填写模型 ID。';
  } finally {
    busy.value = '';
  }
}
async function login(connection: AiConnection) {
  busy.value = `login-${connection.id}`;
  errorMessage.value = '';
  try {
    const result = await localApi<{ authUrl: string }>(
      `/ai/connections/${connection.id}/login`,
      jsonOptions('POST', {}),
    );
    loginUrl.value = result.authUrl;
    window.open(result.authUrl, '_blank', 'noopener,noreferrer');
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '无法打开登录。';
  } finally {
    busy.value = '';
  }
}
async function clearKey(connection: AiConnection) {
  busy.value = `key-${connection.id}`;
  errorMessage.value = '';
  try {
    await localApi(
      `/ai/connections/${connection.id}/key`,
      jsonOptions('DELETE', {}),
    );
    await load(true);
    message.success('已清除此连接的密钥。');
    notifyConfigChange();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '清除失败。';
  } finally {
    busy.value = '';
  }
}
function remove(connection: AiConnection) {
  modal.confirm({
    title: `删除“${connection.name}”？`,
    content: '历史对话保留，但无法再通过这个连接发送新请求。',
    okText: '删除连接',
    cancelText: '取消',
    okButtonProps: { danger: true },
    async onOk() {
      busy.value = `delete-${connection.id}`;
      try {
        await localApi(
          `/ai/connections/${connection.id}`,
          jsonOptions('DELETE', {}),
        );
        await load(true);
        notifyConfigChange();
      } catch (error) {
        message.error(error instanceof Error ? error.message : '删除失败。');
        throw error;
      } finally {
        busy.value = '';
      }
    },
  });
}
async function saveFeature(feature: AiFeature) {
  busy.value = `feature-${feature.id}`;
  errorMessage.value = '';
  try {
    await localApi(`/ai/features/${feature.id}`, jsonOptions('PUT', feature));
    await load(true);
    message.success('功能分配已保存，新对话与新提取任务将使用此配置。');
    notifyConfigChange();
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '功能分配保存失败。';
  } finally {
    busy.value = '';
  }
}
function chooseFeatureConnection(feature: AiFeature) {
  feature.model = '';
  feature.thinking = 'inherit';
}
async function savePermissions() {
  busy.value = 'permissions';
  errorMessage.value = '';
  try {
    await localApi('/ai/permissions', jsonOptions('PUT', permissions.value));
    await load(true);
    message.success('助手资料权限已更新。');
    notifyConfigChange();
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '权限保存失败。';
  } finally {
    busy.value = '';
  }
}
async function revokeAgent(agent: ExternalAgent) {
  busy.value = `agent-${agent.id}`;
  errorMessage.value = '';
  try {
    await localApi(
      `/analysis/connections/${agent.id}`,
      jsonOptions('DELETE', {}),
    );
    await load(true);
    message.success('Agent 授权已撤销。');
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '撤销失败。';
  } finally {
    busy.value = '';
  }
}
</script>

<template>
  <section class="ai-management">
    <header class="ai-page-heading">
      <div>
        <p class="eyebrow">AI WORKSPACE / 连接中心</p>
        <h1>高级设置<span>。</span></h1>
        <p>管理你的模型与 Agent，为每项工作选择合适的连接。</p>
      </div>
      <div class="detail-actions">
        <Button :disabled="!!busy" :loading="loading" @click="load()">
          刷新状态
</Button><Button type="primary" :disabled="!!busy" @click="edit()">
          <ExplorerIcon name="plus" />新增连接
        </Button>
      </div>
    </header>
    <div class="ai-overview-strip">
      <span><strong>{{ connections.filter((c) => c.enabled).length }}</strong>
        个启用连接</span><span><strong>{{
          features.filter((f) => f.enabled && f.connectionId).length
        }}</strong>
        项功能已分配</span><span><strong>{{ activeAgents.length }}</strong> 个外部 Agent 授权</span><small>密钥仅在本次服务内存中保存</small>
    </div>
    <nav class="ai-tabs" aria-label="AI 管理分区">
      <button
        v-for="item in [
          { id: 'features', label: '功能分配', icon: 'grid' },
          { id: 'connections', label: '模型连接', icon: 'globe' },
          { id: 'agents', label: 'Agent 与权限', icon: 'user' },
        ]"
        :key="item.id"
        :class="{ active: tab === item.id }"
        :aria-current="tab === item.id ? 'page' : undefined"
        @click="tab = item.id"
      >
        <ExplorerIcon :name="item.icon" />{{ item.label }}
      </button>
    </nav>
    <p v-if="errorMessage" class="form-error" role="alert">
      {{ errorMessage }}
    </p>
    <p v-if="loading && !data" class="ai-loading">正在读取 AI 配置…</p>
    <template v-if="data">
      <section v-if="tab === 'features'" class="ai-feature-section">
        <div class="ai-section-heading">
          <div>
            <h2>每项功能，独立选择</h2>
            <p>一个连接可供多个功能使用，也可以给同一服务选择不同模型。</p>
          </div>
          <span>新对话 / 新提取任务生效</span>
        </div>
        <div v-if="!connections.length" class="ai-empty">
          <ExplorerIcon name="globe" />
          <h3>先添加一个 AI 连接</h3>
          <p>可使用 DeepSeek、自带 API，或沿用本机 Codex 登录。</p>
          <Button type="primary" @click="edit()">添加第一个连接</Button>
        </div>
        <article
          v-for="(feature, index) in features"
          :key="feature.id"
          class="ai-feature-card"
          :class="{ disabled: !feature.enabled }"
        >
          <div class="ai-feature-description">
            <span class="ai-index">0{{ index + 1 }}</span>
            <div>
              <h3>{{ feature.name }}</h3>
              <p>{{ feature.description }}</p>
              <small v-if="feature.tools">需要支持工具调用的模型</small><small v-else>扫描页可先本机 OCR，或使用图片模型</small>
            </div>
            <Switch
              v-model:checked="feature.enabled"
              :disabled="!!busy"
              :aria-label="`启用${feature.name}`"
            />
          </div>
          <div class="ai-feature-form">
            <label>使用连接<Select
                v-accessible-select
                v-model:value="feature.connectionId"
                :options="connectionOptions"
                placeholder="选择 API 或本机 Agent"
                :disabled="!!busy"
                @change="chooseFeatureConnection(feature)"
/></label><label>使用模型<input
                v-model="feature.model"
                :list="`models-${feature.id}`"
                :placeholder="
                  selectedConnection(feature.connectionId)?.provider.model ||
                  (selectedConnection(feature.connectionId)?.kind === 'codex'
                    ? '留空使用本机默认模型'
                    : '使用连接默认模型')
                "
                maxlength="160"
                :disabled="!!busy"
              /><datalist :id="`models-${feature.id}`">
                <option
                  v-for="model in models(
                    selectedConnection(feature.connectionId),
                  )"
                  :key="model.id"
                  :value="model.id"
                >
                  {{ model.name }}
                </option>
              </datalist></label><label
              v-if="
                selectedConnection(feature.connectionId)?.provider.adapter ===
                  'deepseek' ||
                selectedConnection(feature.connectionId)?.kind === 'deepseek'
              "
              >思考模式<Select
                v-accessible-select
                v-model:value="feature.thinking"
                :disabled="!!busy"
                :options="[
                  { value: 'inherit', label: '沿用连接设置' },
                  { value: 'disabled', label: '关闭思考' },
                  { value: 'enabled', label: '开启思考' },
                ]"
/></label><Button
              type="primary"
              ghost
              :loading="busy === `feature-${feature.id}`"
              :disabled="!!busy && busy !== `feature-${feature.id}`"
              @click="saveFeature(feature)"
            >
              保存分配
            </Button>
          </div>
          <p
            v-if="
              selectedConnection(feature.connectionId) &&
              !selectedConnection(feature.connectionId)?.keyConfigured &&
              !selectedConnection(feature.connectionId)?.provider.local
            "
            class="ai-inline-warning"
          >
            此连接需要填写 API 密钥。<button
              @click="edit(selectedConnection(feature.connectionId))"
            >
              填写密钥
            </button>
          </p>
        </article>
        <aside class="ai-feature-note">
          <ExplorerIcon name="info" />
          <p>
            历史对话保留原来的连接与模型；更换配置后点击“新对话”使用新模型。停止某项功能后，该功能将停止接收新的
            AI 请求。
          </p>
        </aside>
      </section>
      <section v-else-if="tab === 'connections'">
        <div class="ai-section-heading">
          <div>
            <h2>我的模型连接</h2>
            <p>API 密钥按连接隔离，同一服务也能保存多个账户。</p>
          </div>
        </div>
        <div v-if="!connections.length" class="ai-empty">
          <h3>还没有连接</h3>
          <Button @click="edit()">新增连接</Button>
        </div>
        <div class="ai-connections-grid">
          <article
            v-for="connection in connections"
            :key="connection.id"
            class="ai-connection-card"
          >
            <header>
              <span class="ai-provider-mark" :data-kind="connection.kind">{{
                connection.kind === 'deepseek'
                  ? 'D'
                  : connection.kind === 'codex'
                    ? 'C'
                    : 'API'
              }}</span>
              <div>
                <h3>{{ connection.name }}</h3>
                <small>{{ typeNames[connection.kind] }}</small>
              </div>
              <span
                class="ai-state"
                :class="{
                  ready:
                    connection.enabled &&
                    (connection.keyConfigured || connection.provider.local),
                }"
                >{{ connectionState(connection) }}</span>
            </header>
            <p class="ai-model-name">
              {{ connection.provider.model || '本机默认模型' }}
            </p>
            <p class="ai-api-address" :title="connection.provider.baseUrl">
              {{
                connection.kind === 'codex'
                  ? connection.provider.codexPath || '自动检测本机 Codex 程序'
                  : connection.provider.baseUrl
              }}
            </p>
            <div class="ai-capabilities">
              <span v-if="connection.supportsTools">工具调用</span><span
                v-if="connection.supportsImages || connection.kind === 'codex'"
                >{{
                  connection.kind === 'codex'
                    ? '图像能力以模型目录为准'
                    : '可配置图片输入'
                }}</span><span v-if="connection.provider.adapter === 'deepseek'">DeepSeek 适配</span><span>{{ connection.features.length }} 项功能使用</span>
            </div>
            <p v-if="connection.notes" class="ai-connection-note">
              {{ connection.notes }}
            </p>
            <footer>
              <Button
                size="small"
                :loading="busy === `models-${connection.id}`"
                :disabled="!!busy"
                @click="discover(connection)"
              >
                {{
                  connection.kind === 'codex' ? '连接 / 检测' : '读取模型列表'
                }}
</Button><Button
                size="small"
                :disabled="!!busy"
                @click="edit(connection)"
              >
                编辑
</Button><Button
                v-if="connection.keyConfigured"
                size="small"
                type="text"
                :disabled="!!busy"
                @click="clearKey(connection)"
              >
                清除密钥
</Button><Button
                size="small"
                type="text"
                danger
                :disabled="!!busy"
                @click="remove(connection)"
              >
                删除
              </Button>
            </footer>
            <small v-if="connection.discovery" class="ai-last-check">目录读取于
              {{ new Date(connection.discovery.at).toLocaleString() }} ·
              {{ connection.discovery.models.length }} 个模型</small>
          </article>
        </div>
        <p class="ai-help">
          读取模型列表只访问服务商的模型目录，不会发送聊天或文档内容；目录访问成功不等于推理调用已验证。不提供模型目录的服务可手动填写模型
          ID。
        </p>
      </section>
      <section v-else class="ai-agent-section">
        <div class="ai-section-heading">
          <div>
            <h2>本机 Agent 与资料权限</h2>
            <p>
              本机 Codex 用于网页对话；MCP 授权用于让外部 Agent 操作选定资料。
            </p>
          </div>
        </div>
        <article class="ai-native-panel">
          <div>
            <span class="ai-eyebrow">LOCAL AGENT</span>
            <h3>本机 Codex</h3>
            <p>
              {{
                data.native.ready
                  ? '本机连接已就绪，沿用当前登录账户。'
                  : data.native.needsLogin
                    ? '检测到本机程序，请先完成登录。'
                    : '添加一个本机 Codex 连接，检测账户与可用模型。'
              }}
            </p>
          </div>
          <div class="ai-agent-actions">
            <template
              v-for="connection in connections.filter(
                (c) => c.kind === 'codex',
              )"
              :key="connection.id"
            >
              <span>{{ connection.name }}</span><Button :disabled="!!busy" @click="discover(connection)">
                检测模型
</Button><Button :disabled="!!busy" @click="login(connection)">
                登录 Codex
              </Button>
</template><Button
              v-if="!connections.some((c) => c.kind === 'codex')"
              @click="
                edit();
                chooseKind('codex');
              "
            >
              添加本机连接
</Button><a
              v-if="loginUrl"
              :href="loginUrl"
              target="_blank"
              rel="noopener noreferrer"
              >继续登录 ↗</a>
          </div>
        </article>
        <article class="ai-policy-panel">
          <header>
            <div>
              <h3>网页工作区助手的资料权限</h3>
              <p>阅读问答始终只读当前文档；所有结构化资料修改仍需确认。</p>
            </div>
            <Button
              :loading="busy === 'permissions'"
              :disabled="!!busy && busy !== 'permissions'"
              @click="savePermissions"
            >
              保存权限
            </Button>
          </header>
          <fieldset>
            <legend>允许读取的专攻</legend>
            <Checkbox.Group
              v-model:value="permissions.majorIds"
              :options="majors"
              :disabled="!!busy"
            /><small v-if="!majors.length">先在大学清单建立专攻，再开放对应资料。</small>
          </fieldset>
          <fieldset>
            <legend>允许提出修改的类型（全部取消即只读）</legend>
            <Checkbox.Group
              v-model:value="permissions.writableKinds"
              :options="kindOptions"
              :disabled="!!busy"
            />
          </fieldset>
          <small>包含所选专攻所属大学、研究室及老师基本资料。邮件与考学经历不通过网页工作区助手开放。</small>
        </article>
        <article class="ai-external-panel">
          <header>
            <div>
              <h3>外部 Agent 授权 · {{ activeAgents.length }}</h3>
              <p>管理 MCP 配置、资料范围和授权撤销。</p>
            </div>
            <Button :disabled="!!busy" @click="externalOpen = true">
              新增 / 管理 Agent 授权
            </Button>
          </header>
          <p v-if="!activeAgents.length" class="ai-help">
            还没有外部 Agent 授权。需要从自己的 Agent 编辑 JUAI
            资料时，可在这里创建配置。
          </p>
          <div
            v-for="agent in activeAgents"
            :key="agent.id"
            class="ai-external-row"
          >
            <div>
              <strong>{{ agent.name }}</strong><small>{{ agent.majorIds.length }} 个专攻 ·
                {{
                  agent.informationAccess === 'write'
                    ? '按范围读写'
                    : agent.informationAccess === 'read'
                      ? '只读资料'
                      : '仅分析草稿'
                }}{{
                  agent.lastUsedAt
                    ? ` · 最近使用 ${new Date(agent.lastUsedAt).toLocaleString()}`
                    : ''
                }}</small>
            </div>
            <Button
              size="small"
              danger
              :disabled="!!busy"
              @click="revokeAgent(agent)"
            >
              撤销授权
            </Button>
          </div>
        </article>
      </section>
    </template>
    <AgentConnections v-model:open="externalOpen" />
    <Modal
      v-model:open="editorOpen"
      :title="editorId ? '编辑 AI 连接' : '新增 AI 连接'"
      :footer="null"
      :width="660"
      :mask-closable="!busy"
      :closable="!busy"
      :keyboard="!busy"
      @after-close="apiKey = ''"
    >
      <form class="ai-editor" @submit.prevent="saveConnection">
        <div class="ai-editor-two">
          <label>连接名称<Input
              v-model:value="form.name"
              :maxlength="80"
              placeholder="如：资料提取专用 DeepSeek"
              required
              :disabled="!!busy"
/></label><label>连接类型<Select
              v-accessible-select
              v-model:value="form.kind"
              :disabled="!!busy"
              :options="
                Object.entries(typeNames).map(([value, label]) => ({
                  value,
                  label,
                }))
              "
              @change="chooseKind"
          /></label>
        </div>
        <template v-if="form.kind !== 'codex'">
          <label>API 基础地址<Input
              v-model:value="form.provider.baseUrl"
              :maxlength="2048"
              placeholder="https://服务商地址/v1"
              required
              :disabled="!!busy"
          /></label>
          <div class="ai-editor-two">
            <label>接口协议<Select
                v-accessible-select
                v-model:value="form.provider.protocol"
                :disabled="!!busy || form.kind === 'deepseek'"
                :options="[
                  { value: 'chat_completions', label: 'Chat Completions' },
                  { value: 'responses', label: 'Responses' },
                ]"
/></label><label>API 密钥<Input.Password
                v-model:value="apiKey"
                autocomplete="off"
                :maxlength="4096"
                :disabled="!!busy"
                :placeholder="
                  editorId && selectedConnection(editorId)?.keyConfigured
                    ? '已配置；留空保留'
                    : '本地服务可不填'
                "
            /></label>
          </div>
</template><label>默认模型<input
            v-model="form.provider.model"
            list="ai-editor-models"
            :required="form.kind !== 'codex'"
            maxlength="160"
            :disabled="!!busy"
            :placeholder="
              form.kind === 'codex'
                ? '留空使用本机默认模型'
                : '填写模型 ID，或从目录选择'
            "
          /><datalist id="ai-editor-models">
            <option
              v-for="model in editorModels"
              :key="model.id"
              :value="model.id"
            >
              {{ model.name }}
            </option>
          </datalist></label><template v-if="form.kind === 'codex'">
          <label>程序绝对路径（可选）<Input
              v-model:value="form.provider.codexPath"
              :maxlength="2048"
              placeholder="留空自动检测 codex"
              :disabled="!!busy"
          /></label>
          <p>
            沿用本机登录与账户额度。保存后点“连接 / 检测”读取模型列表，Luna
            在账户可用时出现。
          </p>
</template><template v-else>
          <div v-if="form.kind === 'deepseek'" class="ai-deepseek-options">
            <label>默认思考模式<Select
                v-accessible-select
                v-model:value="form.provider.thinking"
                :disabled="!!busy"
                :options="[
                  { value: 'disabled', label: '关闭' },
                  { value: 'enabled', label: '开启' },
                ]"
/></label><label v-if="form.provider.thinking === 'enabled'">思考强度<Select
                v-accessible-select
                v-model:value="form.provider.reasoningEffort"
                :disabled="!!busy"
                :options="[
                  { value: 'low', label: 'Low' },
                  { value: 'high', label: 'High' },
                  { value: 'max', label: 'Max' },
                ]"
            /></label>
          </div>
          <div class="ai-editor-two">
            <label>单次输出上限（tokens）<InputNumber
                v-model:value="form.provider.maxOutputTokens"
                :min="256"
                :max="32768"
                :precision="0"
                :disabled="!!busy"
/></label><label>提取结果格式<Select
                v-accessible-select
                v-model:value="form.provider.jsonMode"
                :disabled="!!busy || form.kind === 'deepseek'"
                :options="[
                  { value: 'prompt', label: 'JSON 提示 + 服务端校验' },
                  { value: 'json', label: 'JSON Object + 服务端校验' },
                  { value: 'schema', label: 'JSON Schema 结构化输出' },
                ]"
            /></label>
          </div>
          <div class="ai-editor-checkboxes">
            <Checkbox v-model:checked="form.provider.stream" :disabled="!!busy">
              流式显示回答
</Checkbox><Checkbox v-model:checked="form.supportsTools" :disabled="!!busy">
              支持工具调用
</Checkbox><Checkbox v-model:checked="form.supportsImages" :disabled="!!busy">
              支持图片输入
            </Checkbox>
          </div>
          <p v-if="form.kind === 'deepseek'">
            DeepSeek 已适配思考模式、工具调用上下文和 JSON Object
            提取。预设使用当前官方模型名，可读取目录或手动填写其他可用模型。具体图片能力以模型目录为准。
          </p>
          <p v-else>
            模型能力请按服务商文档设置；不确定是否支持 JSON Schema 时，选择 JSON
            提示模式。
          </p>
          <p>
            密钥仅保存在本次本地服务内存，重启后需重新填写；更换地址或接口会清除原密钥。思考模式同样消耗输出额度。
          </p>
</template><label>备注<Input.TextArea
            v-model:value="form.notes"
            :rows="2"
            :maxlength="600"
            placeholder="用途或服务商说明（不要填写密钥）"
            :disabled="!!busy"
/></label><Checkbox v-model:checked="form.enabled" :disabled="!!busy">
          启用此连接
        </Checkbox>
        <p v-if="editorError" class="form-error" role="alert">
          {{ editorError }}
        </p>
        <footer>
          <Button :disabled="!!busy" @click="editorOpen = false">取消</Button><Button type="primary" html-type="submit" :loading="busy === 'save'">
            保存连接
          </Button>
        </footer>
      </form>
    </Modal>
  </section>
</template>

<style scoped src="./ai-management.css"></style>
