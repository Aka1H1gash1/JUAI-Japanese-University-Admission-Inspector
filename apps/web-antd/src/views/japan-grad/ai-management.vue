<script setup lang="ts">
import type {
  AiConnection,
  AiManagement,
  AiNativeState,
} from './ai-management-types';

import { computed, defineAsyncComponent, onBeforeUnmount, ref } from 'vue';
import { useRoute } from 'vue-router';

import { App, Button, Input, Select } from 'ant-design-vue';

import ExplorerIcon from './components/explorer-icon.vue';
import { jsonOptions, localApi } from './local-api';
import { requireValue } from './required-value';
import { vAccessibleSelect } from './select-accessibility';

const AdvancedSettings = defineAsyncComponent(
  () => import('./ai-management-advanced.vue'),
);
const route = useRoute();
const { message } = App.useApp();
const busy = ref('');
const data = ref<AiManagement>();
const errorMessage = ref('');
const loading = ref(false);
const advancedOpen = ref(route.query.advanced === '1');
const apiOptionsOpen = ref(false);
const localOptionsOpen = ref(false);
const loginRequired = ref(false);
const loginUrl = ref('');
const codexPath = ref('');
const localId = ref('');
const localModel = ref('');
const api = ref({
  connectionId: '',
  kind: 'deepseek' as 'compatible' | 'deepseek' | 'openai',
  baseUrl: 'https://api.deepseek.com',
  model: '',
  protocol: 'chat_completions' as 'chat_completions' | 'responses',
});
const apiKey = ref('');
let generation = 0;
const apiDirty = ref(false);
const localDirty = ref(false);
const connections = computed(() => data.value?.connections || []);
const shared = computed(() => {
  const features = data.value?.features || [];
  if (
    features.length === 0 ||
    features.some((f) => !f.enabled || !f.connectionId)
  )
    return undefined;
  return features.every(
    (f) =>
      f.connectionId === requireValue(features[0]).connectionId &&
      (f.model ||
        connections.value.find((c) => c.id === f.connectionId)?.provider
          .model) ===
        (requireValue(features[0]).model ||
          connections.value.find(
            (c) => c.id === requireValue(features[0]).connectionId,
          )?.provider.model),
  )
    ? connections.value.find(
        (c) => c.id === requireValue(features[0]).connectionId,
      )
    : undefined;
});
const configuredFeatures = computed(
  () =>
    data.value?.features.filter((f) => f.enabled && f.connectionId).length || 0,
);
const currentModel = computed(
  () =>
    data.value?.features.find(
      (f) => f.enabled && f.connectionId === shared.value?.id,
    )?.model ||
    shared.value?.provider.model ||
    '本机默认模型',
);
const apiConnection = computed(() =>
  connections.value.find((c) => c.id === api.value.connectionId),
);
const localConnection = computed(() =>
  connections.value.find((c) => c.id === localId.value),
);
const localModels = computed(() =>
  data.value?.native.ready && data.value.native.models.length > 0
    ? data.value.native.models
    : localConnection.value?.discovery?.models || [],
);
const apiModels = computed(() => apiConnection.value?.discovery?.models || []);
const ready = computed(
  () =>
    !!shared.value?.enabled &&
    (shared.value.kind === 'codex'
      ? data.value?.native.ready
      : shared.value.provider.local || shared.value.keyConfigured),
);
interface SetupResult {
  status: 'configured' | 'login_required';
  connection: AiConnection;
  native?: AiNativeState;
  model?: string;
  catalogueRead?: boolean;
}

function setApiConnection(connection?: AiConnection) {
  if (!connection || connection.kind === 'codex') return;
  api.value = {
    connectionId: connection.id,
    kind: connection.kind,
    baseUrl: connection.provider.baseUrl,
    model: connection.provider.model,
    protocol:
      connection.provider.protocol === 'responses'
        ? 'responses'
        : 'chat_completions',
  };
}
async function load(reset = false) {
  const version = ++generation;
  loading.value = true;
  try {
    const result = await localApi<AiManagement>('/ai/management');
    if (version !== generation) return;
    data.value = result;
    const defaultId = result.features.find(
      (f) => f.id === 'workspace_chat',
    )?.connectionId;
    if (reset || !localDirty.value) {
      const local =
        result.connections.find(
          (c) => c.id === defaultId && c.kind === 'codex',
        ) || result.connections.find((c) => c.kind === 'codex');
      localId.value = local?.id || '';
      codexPath.value = local?.provider.codexPath || '';
      localModel.value = local?.provider.model || '';
    }
    if (reset || !apiDirty.value) {
      const savedApi =
        result.connections.find(
          (c) => c.id === defaultId && c.kind !== 'codex',
        ) ||
        result.connections.find((c) => c.kind !== 'codex' && c.enabled) ||
        result.connections.find((c) => c.kind !== 'codex');
      if (savedApi) setApiConnection(savedApi);
    }
  } catch (error) {
    if (version === generation)
      errorMessage.value =
        error instanceof Error ? error.message : 'AI 配置读取失败。';
  } finally {
    if (version === generation) loading.value = false;
  }
}
void load();
function notify() {
  window.dispatchEvent(new Event('juai-ai-config-changed'));
}
function handleAdvancedChange() {
  if (!busy.value) void load();
}
window.addEventListener('juai-ai-config-changed', handleAdvancedChange);
onBeforeUnmount(() => {
  generation++;
  apiKey.value = '';
  window.removeEventListener('juai-ai-config-changed', handleAdvancedChange);
});
function chooseApiKind() {
  apiDirty.value = true;
  apiKey.value = '';
  const kind = api.value.kind;
  const saved =
    connections.value.find(
      (c) => c.kind === kind && c.id === shared.value?.id,
    ) || connections.value.find((c) => c.kind === kind);
  if (saved) setApiConnection(saved);
  else
    api.value = {
      connectionId: '',
      kind,
      baseUrl: (() => {
        if (kind === 'deepseek') {
          return 'https://api.deepseek.com';
        }
        if (kind === 'openai') {
          return 'https://api.openai.com/v1';
        }
        return '';
      })(),
      model: '',
      protocol: kind === 'openai' ? 'responses' : 'chat_completions',
    };
}
async function startLogin(id = localId.value) {
  const result = await localApi<{ authUrl: string }>(
    `/ai/connections/${id}/login`,
    jsonOptions('POST', {}),
  );
  loginUrl.value = result.authUrl;
  window.open(result.authUrl, '_blank', 'noopener,noreferrer');
}
async function setupLocal() {
  if (busy.value) return;
  busy.value = 'local';
  errorMessage.value = '';
  try {
    const result = await localApi<SetupResult>(
      '/ai/quick-setup',
      jsonOptions('POST', {
        mode: 'local',
        connectionId: localId.value || undefined,
        codexPath: codexPath.value,
        model: localModel.value,
      }),
    );
    localId.value = result.connection.id;
    if (result.status === 'login_required') {
      loginRequired.value = true;
      await load();
      await startLogin(result.connection.id);
      message.info('完成本机登录后，点击“我已登录，继续连接”。');
      return;
    }
    loginRequired.value = false;
    loginUrl.value = '';
    localDirty.value = false;
    apiKey.value = '';
    notify();
    await load(true);
    message.success('本机 Codex 已接入，所有 AI 功能已统一使用此连接。');
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '本地 Agent 连接失败。';
    if (/模型|程序|路径/.test(errorMessage.value))
      localOptionsOpen.value = true;
    await load();
  } finally {
    busy.value = '';
  }
}
async function setupApi() {
  if (busy.value) return;
  busy.value = 'api';
  errorMessage.value = '';
  try {
    const result = await localApi<SetupResult>(
      '/ai/quick-setup',
      jsonOptions('POST', {
        mode: 'api',
        ...api.value,
        connectionId: api.value.connectionId || undefined,
        ...(apiKey.value.trim() ? { apiKey: apiKey.value.trim() } : {}),
      }),
    );
    apiKey.value = '';
    apiDirty.value = false;
    loginRequired.value = false;
    notify();
    await load(true);
    message.success(`API 已保存并供所有 AI 功能使用 · ${result.model}`);
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : 'API 配置失败。';
    if (/模型|接口|目录/.test(errorMessage.value)) apiOptionsOpen.value = true;
  } finally {
    busy.value = '';
  }
}
const returnTo = computed(() =>
  typeof route.query.returnTo === 'string' &&
  route.query.returnTo.startsWith('/japan-grad/') &&
  !route.query.returnTo.startsWith('/japan-grad/ai')
    ? route.query.returnTo
    : '/japan-grad/overview',
);
</script>

<template>
  <section class="ai-connect-simple">
    <header class="ai-simple-heading">
      <div>
        <p>AI CONNECTION / AI 接入</p>
        <h1>选一种方式，就能开始<span>。</span></h1>
        <small>本地 Agent 或自己的 API，连接一次即可供各项 AI 功能使用。</small>
      </div>
      <Button :disabled="!!busy" :loading="loading" @click="load()">
        刷新状态
      </Button>
    </header>
    <p v-if="errorMessage" class="form-error" role="alert">
      {{ errorMessage }}
    </p>
    <p v-if="loading && !data" class="ai-simple-help" role="status">
      正在读取连接状态…
    </p>
    <section
      v-if="data"
      class="ai-current-connection"
      :class="{ ready }"
      aria-label="当前 AI 连接"
    >
      <i></i>
      <div>
        <strong>{{
          shared
            ? ready
              ? `当前使用：${shared.kind === 'codex' ? '本地 Codex' : shared.name}`
              : `已配置：${shared.name}`
            : configuredFeatures
              ? '当前按功能分别配置'
              : '还没有接入 AI'
        }}</strong>
        <p>
          {{
            shared
              ? `${currentModel} · ${ready ? '可以开始使用' : shared.kind === 'codex' ? '点击下方连接本地 Agent' : '请补填 API Key 后保存'}`
              : configuredFeatures
                ? '选择下方任一种方式，可统一应用到所有 AI 功能。'
                : '从下方选择本地 Agent 或 API 即可。'
          }}
        </p>
      </div>
      <RouterLink v-if="ready" :to="returnTo">返回使用 ↗</RouterLink>
    </section>
    <div class="ai-simple-choices">
      <article
        class="ai-simple-card"
        :class="{ active: shared?.kind === 'codex' }"
      >
        <header>
          <span class="ai-simple-icon"><ExplorerIcon name="drive" /></span><small>01 / LOCAL AGENT</small><span v-if="shared?.kind === 'codex'" class="ai-simple-active">当前选择</span>
        </header>
        <h2>连接本地 Agent</h2>
        <p>目前支持本机 Codex，自动沿用已有登录，无需填写 API Key。</p>
        <div class="ai-local-explanation">
          <span>使用本机登录账户和可用模型</span><span>网页对话、读资料、收集信息共用连接</span>
        </div>
        <details
          :open="localOptionsOpen"
          @toggle="
            localOptionsOpen = ($event.target as HTMLDetailsElement).open
          "
        >
          <summary>模型与程序位置（可选）</summary>
          <label>使用模型<input
              v-model="localModel"
              list="quick-local-models"
              maxlength="160"
              :disabled="!!busy"
              placeholder="自动使用本机默认模型"
              @input="localDirty = true"
            /><datalist id="quick-local-models">
              <option v-for="m in localModels" :key="m.id" :value="m.id">
                {{ m.name }}
              </option>
            </datalist></label><label>Codex 程序路径<Input
              v-model:value="codexPath"
              :maxlength="2048"
              :disabled="!!busy"
              placeholder="留空自动检测"
              @change="localDirty = true"
          /></label>
        </details>
        <div v-if="loginRequired" class="ai-simple-login">
          <p>需要先登录本机 Codex。</p>
          <a
            v-if="loginUrl"
            :href="loginUrl"
            target="_blank"
            rel="noopener noreferrer"
            >打开登录页面 ↗</a>
        </div>
        <footer class="ai-simple-card-footer">
          <Button
            type="primary"
            :loading="busy === 'local'"
            :disabled="!!busy || !data"
            @click="setupLocal"
          >
            {{
              loginRequired ? '我已登录，继续连接' : '连接本地 Agent'
            }}
</Button><small class="ai-simple-help">检测账户和模型列表，不会启动模型推理。</small>
        </footer>
      </article>
      <article
        class="ai-simple-card"
        :class="{ active: shared && shared.kind !== 'codex' }"
      >
        <header>
          <span class="ai-simple-icon"><ExplorerIcon name="globe" /></span><small>02 / YOUR API</small><span
            v-if="shared && shared.kind !== 'codex'"
            class="ai-simple-active"
            >当前选择</span>
        </header>
        <h2>使用自己的 API</h2>
        <p>支持 DeepSeek、OpenAI 和兼容接口，保存后直接供各项功能使用。</p>
        <form @submit.prevent="setupApi">
          <label>API 服务<Select
              v-accessible-select
              v-model:value="api.kind"
              :disabled="!!busy"
              :options="[
                { value: 'deepseek', label: 'DeepSeek' },
                { value: 'openai', label: 'OpenAI' },
                { value: 'compatible', label: '其他兼容 API' },
              ]"
              @change="chooseApiKind"
/></label><label>API 地址<Input
              v-model:value="api.baseUrl"
              required
              :maxlength="2048"
              :disabled="!!busy"
              placeholder="https://服务商地址/v1"
              @change="apiDirty = true"
/></label><label>API Key<Input.Password
              v-model:value="apiKey"
              autocomplete="off"
              :maxlength="4096"
              :disabled="!!busy"
              :placeholder="
                apiConnection?.keyConfigured
                  ? '已配置，留空沿用当前密钥'
                  : '粘贴服务商提供的 API Key'
              "
              @change="apiDirty = true"
          /></label>
          <details
            :open="apiOptionsOpen"
            @toggle="
              apiOptionsOpen = ($event.target as HTMLDetailsElement).open
            "
          >
            <summary>模型与接口选项（可选）</summary>
            <label>使用模型<input
                v-model="api.model"
                list="quick-api-models"
                maxlength="160"
                :disabled="!!busy"
                placeholder="留空自动获取，或填写模型 ID"
                @input="apiDirty = true"
              /><datalist id="quick-api-models">
                <option v-for="m in apiModels" :key="m.id" :value="m.id">
                  {{ m.name }}
                </option>
              </datalist></label><label v-if="api.kind !== 'deepseek'">接口类型<Select
                v-accessible-select
                v-model:value="api.protocol"
                :disabled="!!busy"
                :options="[
                  { value: 'chat_completions', label: 'Chat Completions' },
                  { value: 'responses', label: 'Responses' },
                ]"
                @change="apiDirty = true"
            /></label>
            <p>
              留空模型时自动读取目录并选择聊天模型。不提供目录的服务可手动填写；模型需支持工具调用。
            </p>
          </details>
          <footer class="ai-simple-card-footer">
            <Button
              type="primary"
              html-type="submit"
              :loading="busy === 'api'"
              :disabled="!!busy || !data"
            >
              保存并使用 API
</Button><small class="ai-simple-help">API Key 仅在本次本地服务内存中保存，重启后需补填。</small>
          </footer>
        </form>
      </article>
    </div>
    <section class="ai-simple-scope">
      <strong>连接后，以下功能自动共用</strong>
      <div>
        <span v-for="f in data?.features || []" :key="f.id"><ExplorerIcon name="check" />{{ f.name }}</span>
      </div>
      <p>保存会统一启用这些功能；已有对话保留原来的连接，新对话使用新配置。</p>
    </section>
    <section class="ai-simple-advanced">
      <button
        type="button"
        :aria-expanded="advancedOpen"
        @click="advancedOpen = !advancedOpen"
      >
        <span><ExplorerIcon name="grid" />高级设置</span><small>按功能单独选模型、管理多个连接与外部 Agent 授权</small><ExplorerIcon :name="advancedOpen ? 'up' : 'down'" />
</button><AdvancedSettings v-if="advancedOpen" />
    </section>
  </section>
</template>
<style scoped src="./ai-connection-simple.css"></style>
