<script setup lang="ts">
import type { AiManagement } from '../ai-management-types';
import type { CollectionJob } from '../collection-types';
import type { EntityKind } from '../explorer';

import { computed, h, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

import { useEventListener } from '@vueuse/core';
import { App, Button, Input, InputNumber, Modal, Select } from 'ant-design-vue';

import { useCollectionJobsStore } from '../collection-jobs';
import { COLLECTION_NAMES } from '../collection-types';
import { jsonOptions, localApi } from '../local-api';
import { serverMode } from '../runtime-capabilities';
import { vAccessibleSelect } from '../select-accessibility';
import EntityEditor from './entity-editor.vue';
import ExplorerIcon from './explorer-icon.vue';
import ImportScope from './import-scope.vue';
const props = defineProps<{
  kind: 'special_program' | EntityKind;
  parentId?: string;
  parentName?: string;
  entityId?: string;
  urlOnly?: boolean;
}>();
const emit = defineEmits<{
  saved: [id: string];
  manual: [];
  created: [id: string];
}>();
const open = defineModel<boolean>('open', { default: false });
const route = useRoute();
const jobs = useCollectionJobsStore();
const { message } = App.useApp();
const busy = ref(false);
const errorMessage = ref('');
const management = ref<AiManagement>();
const mode = ref<'choose' | 'manual' | 'url'>('choose');
const url = ref('');
const aiMode = ref<'agent' | 'api'>(serverMode ? 'api' : 'agent');
const browserMode = ref('http');
const identity = ref('修士・外国人留学生');
const notes = ref('');
const importScope = ref('current');
const selectedMajors = ref<string[]>([]);
const year = ref(new Date().getFullYear() + 1);
const kindName = computed(() =>
  props.kind === 'special_program'
    ? '特殊入学项目'
    : COLLECTION_NAMES[props.kind],
);
const modeConnections = computed(
  () =>
    management.value?.connections.filter(
      (c) =>
        c.enabled &&
        (aiMode.value === 'agent' ? c.kind === 'codex' : c.kind !== 'codex'),
    ) || [],
);
// Each platform reports whether its stored API credentials are available.
const usable = (c: (typeof modeConnections.value)[number]) =>
  c.kind === 'codex' || c.provider.local || c.keyConfigured;
const selectedConnection = computed(() => {
  const preferred = management.value?.features.find(
    (f) => f.id === 'web_collection',
  )?.connectionId;
  const matches = modeConnections.value.filter(usable);
  return matches.find((c) => c.id === preferred) || matches[0];
});
const keyMissing = computed(
  () =>
    !selectedConnection.value && modeConnections.value.some((c) => !usable(c)),
);
const aiSetupPath = computed(
  () => `/japan-grad/ai?returnTo=${encodeURIComponent(route.fullPath)}`,
);
// The AI page opens in a new tab so the link and notes typed here are kept.
useEventListener(window, 'focus', () => {
  if (open.value && mode.value === 'url' && !busy.value) void loadAiState();
});
const selectedModel = computed(() => {
  const feature = management.value?.features.find(
    (f) => f.id === 'web_collection',
  );
  return (
    (feature?.connectionId === selectedConnection.value?.id
      ? feature?.model
      : '') ||
    selectedConnection.value?.provider.model ||
    '默认模型'
  );
});
let generation = 0;
watch(
  open,
  (value) => {
    generation++;
    if (!value) return;
    if (props.entityId) mode.value = 'manual';
    else if (props.urlOnly) mode.value = 'url';
    else mode.value = 'choose';
    url.value = '';
    errorMessage.value = '';
    management.value = undefined;
    notes.value = '';
    importScope.value = 'current';
    selectedMajors.value = [];
    if (props.urlOnly) void loadAiState(true);
  },
  { immediate: true },
);
const manualOpen = computed({
  get: () => open.value && mode.value === 'manual',
  set: (v: boolean) => {
    if (!v) open.value = false;
  },
});
const chooserOpen = computed({
  get: () => open.value && mode.value !== 'manual',
  set: (v: boolean) => {
    if (!v) open.value = false;
  },
});
async function chooseUrl() {
  mode.value = 'url';
  await loadAiState(true);
}
async function loadAiState(applyDefaults = false) {
  const token = generation;
  try {
    const [state, settings] = await Promise.all([
      localApi<AiManagement>('/ai/management'),
      localApi<{ profile: { admissionYear: number; identity: string } }>(
        '/settings',
      ),
    ]);
    if (token === generation) {
      management.value = state;
      errorMessage.value = '';
      if (!applyDefaults) return;
      year.value = settings.profile.admissionYear;
      identity.value = settings.profile.identity;
      const current = state.connections.find(
        (c) =>
          c.id ===
          state.features.find((f) => f.id === 'web_collection')?.connectionId,
      );
      aiMode.value = current?.kind === 'codex' ? 'agent' : 'api';
    }
  } catch (error) {
    if (token === generation)
      errorMessage.value =
        error instanceof Error ? error.message : 'AI 状态读取失败。';
  }
}
async function parse() {
  if (busy.value) return;
  busy.value = true;
  errorMessage.value = '';
  try {
    if (
      importScope.value === 'selected' &&
      (selectedMajors.value.length === 0 ||
        selectedMajors.value.length > 3 ||
        selectedMajors.value.some(
          (value) => value.split('/').filter((v) => v.trim()).length !== 2,
        ))
    )
      throw new Error('请选择 1–3 个专攻，新名称按“研究科 / 专攻”填写。');
    const parentKind = (() => {
      if (props.kind === 'school') {
        return 'university';
      }
      if (props.kind === 'major') {
        return 'school';
      }
      if (props.kind === 'lab') {
        return 'major';
      }
      if (props.kind === 'professor') {
        return 'lab';
      }
      return '';
    })();
    const degree = (() => {
      if (/本科|学部|bachelor/i.test(identity.value)) {
        return 'bachelor';
      }
      if (/博士(?!后)|doctor(?!al fellow)/i.test(identity.value)) {
        return 'doctor';
      }
      if (/研究生|research.?student/i.test(identity.value)) {
        return 'research_student';
      }
      if (/修士|硕士|master/i.test(identity.value)) {
        return 'master';
      }
      return 'unspecified';
    })();
    const job = await localApi<CollectionJob>(
      '/collection/jobs',
      jsonOptions('POST', {
        primaryUrl: url.value.trim(),
        supportingUrl: '',
        targetKind: props.urlOnly ? 'auto' : props.kind,
        selectedPrograms:
          importScope.value === 'selected' ? selectedMajors.value : [],
        parent:
          props.parentId && parentKind
            ? { kind: parentKind, id: props.parentId }
            : undefined,
        seekGuidelines: true,
        admissionYear: year.value,
        degree,
        identity: identity.value.trim(),
        notes: notes.value.trim(),
        aiMode: aiMode.value,
        aiConnectionId: selectedConnection.value?.id,
        browserMode: serverMode ? browserMode.value : 'auto',
      }),
    );
    open.value = false;
    jobs.track(job);
    emit('created', job.id);
    const to = {
      path: '/japan-grad/collection',
      query: { job: job.id, returnTo: route.path },
    };
    message.success({
      content: () =>
        h(RouterLink, { to }, () => '解析任务已创建，点此查看进度'),
      duration: 6,
    });
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '解析任务创建失败。';
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <Modal
    v-model:open="chooserOpen"
    :title="urlOnly ? '新建网址解析' : `新增${kindName}`"
    :width="620"
    :footer="null"
    :closable="!busy"
    :mask-closable="!busy"
    :keyboard="!busy"
  >
    <p v-if="parentName" class="create-parent">所属：{{ parentName }}</p>
    <div v-if="mode === 'choose'" class="create-methods">
      <button
        @click="
          kind === 'special_program'
            ? ((open = false), emit('manual'))
            : (mode = 'manual')
        "
      >
        <ExplorerIcon name="edit" /><strong>手动新增</strong><span>自己填写名称与基本资料</span>
      </button>
      <button @click="chooseUrl">
        <ExplorerIcon name="globe" /><strong>网址解析查询</strong><span>AI 读取官网，查找信息与募集要项</span>
      </button>
    </div>
    <form v-else class="create-url-form" @submit.prevent="parse">
      <label>{{ urlOnly ? '网页链接' : `${kindName}官网链接`
        }}<Input
          v-model:value="url"
          type="url"
          required
          :maxlength="4096"
          :disabled="busy"
          placeholder="https://…"
      /></label>
      <div class="create-application-context">
        <label>入学年份<InputNumber
            v-model:value="year"
            :min="1900"
            :max="2200"
            :precision="0"
            :disabled="busy"
/></label><label>申请身份<Input
            v-model:value="identity"
            :disabled="busy"
            :maxlength="240"
            placeholder="如：修士・外国人留学生 / 博士 / 研究生"
        /></label>
      </div>
      <ImportScope
        v-if="kind !== 'special_program'"
        v-model:scope="importScope"
        v-model:selections="selectedMajors"
      />
      <label>备注<Input.TextArea
          v-model:value="notes"
          :rows="2"
          :maxlength="1000"
          :disabled="busy"
          placeholder="选拔类别或希望重点查询的内容"
      /></label>
      <label>查询方式<Select
          v-accessible-select
          v-model:value="aiMode"
          :disabled="busy"
          :options="[
            ...(!serverMode
              ? [{ value: 'agent', label: '本机 Codex（沿用你电脑上的登录）' }]
              : []),
            { value: 'api', label: '自己的 API（DeepSeek、OpenAI 等）' },
          ]"
      /></label>
      <p class="create-parent">
        {{
          urlOnly
            ? '自动识别页面对应的大学、研究科、专攻或研究室，核对来源后再生成档案。'
            : '自动整理本层与所属上级，优先复用已有档案；找到的资料核对后再生成。'
        }}
      </p>
      <p v-if="selectedConnection" class="create-parent">
        使用 {{ selectedConnection.name }} ·
        {{ selectedModel }}。点击后，官网网页、PDF
        和这里的备注会发送给这个模型服务处理，费用按服务商规则计算。
      </p>
      <p v-else-if="management" class="form-error">
        {{
          keyMissing
            ? serverMode
              ? '该 API 连接尚未配置有效密钥，请在 AI 管理中补充。'
              : 'API Key 只保存在本次运行中，JUAI 重启后需要重新填写。'
            : aiMode === 'agent'
              ? '还没有连接本机 Codex。'
              : '还没有填写自己的 API。'
        }}
        <a :href="aiSetupPath" target="_blank" rel="noopener">在新标签页打开 AI 管理</a>，完成后回到这里即可继续，已填内容会保留。
      </p>
      <p v-if="errorMessage" class="form-error" role="alert">
        {{ errorMessage }}
      </p>
      <label v-if="serverMode">网页读取方式<Select
          v-model:value="browserMode"
          :options="[
            { value: 'http', label: '服务器读取公开网页' },
            {
              value: 'browser',
              label: '使用我已授权的 Chrome 连接器（电脑需在线）',
            },
          ]"
      /></label>
      <footer>
        <Button
          :disabled="busy"
          @click="urlOnly ? (open = false) : (mode = 'choose')"
        >
          {{ urlOnly ? '取消' : '返回' }}
</Button><Button
          type="primary"
          html-type="submit"
          :loading="busy"
          :disabled="!url.trim() || !selectedConnection"
        >
          解析并查询
        </Button>
      </footer>
    </form>
  </Modal>
  <EntityEditor
    v-if="kind !== 'special_program'"
    v-model:open="manualOpen"
    :kind="kind"
    :parent-id="parentId"
    :parent-name="parentName"
    :entity-id="entityId"
    @saved="(id) => emit('saved', id)"
  />
</template>
<style scoped>
.create-parent {
  margin: 8px 0 16px;
  font-size: 12px;
  line-height: 1.8;
  color: var(--jg-muted);
}

.create-methods {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin: 20px 0 12px;
}

.create-methods button {
  display: flex;
  flex-direction: column;
  gap: 14px;
  align-items: flex-start;
  padding: 24px 20px;
  color: var(--jg-text);
  text-align: left;
  cursor: pointer;
  background: var(--jg-surface);
  border: 1px solid var(--jg-line);
  border-radius: 12px;
}

.create-methods button:hover,
.create-methods button:focus-visible {
  background: var(--jg-accent-soft);
  border-color: var(--jg-accent);
}

.create-methods svg {
  width: 25px;
  height: 25px;
  color: var(--jg-accent-text);
}

.create-methods strong {
  font-size: 17px;
  font-weight: 600;
}

.create-methods span {
  font-size: 12px;
  line-height: 1.8;
  color: var(--jg-muted);
}

.create-url-form label {
  display: grid;
  gap: 8px;
  margin: 16px 0;
  font-size: 12px;
  color: var(--jg-secondary);
}

.create-application-context {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.create-application-context .ant-input-number,
.create-application-context .ant-select {
  width: 100%;
}

.create-url-form footer {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 20px;
}

@media (max-width: 500px) {
  .create-methods {
    grid-template-columns: 1fr;
  }
}
</style>
