<script setup lang="ts">
import type { AiManagement } from '../ai-management-types';
import type { CollectionJob } from '../collection-types';
import type { EntityKind } from '../explorer';

import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { App, Button, Input, InputNumber, Modal, Select } from 'ant-design-vue';

import { COLLECTION_NAMES } from '../collection-types';
import { jsonOptions, localApi } from '../local-api';
import { vAccessibleSelect } from '../select-accessibility';
import EntityEditor from './entity-editor.vue';
import ExplorerIcon from './explorer-icon.vue';
const props = defineProps<{
  kind: 'special_program' | EntityKind;
  parentId?: string;
  parentName?: string;
  entityId?: string;
}>();
const emit = defineEmits<{ saved: [id: string]; manual: [] }>();
const open = defineModel<boolean>('open', { default: false });
const route = useRoute();
const router = useRouter();
const { message } = App.useApp();
const busy = ref(false);
const errorMessage = ref('');
const management = ref<AiManagement>();
const mode = ref<'choose' | 'manual' | 'url'>('choose');
const url = ref('');
const aiMode = ref<'agent' | 'api'>('agent');
const identity = ref('修士・外国人留学生');
const notes = ref('');
const year = ref(new Date().getFullYear() + 1);
const kindName = computed(() =>
  props.kind === 'special_program'
    ? '特殊入学项目'
    : COLLECTION_NAMES[props.kind],
);
const selectedConnection = computed(() => {
  const preferred = management.value?.features.find(
    (f) => f.id === 'web_collection',
  )?.connectionId;
  const matches =
    management.value?.connections.filter(
      (c) =>
        c.enabled &&
        (aiMode.value === 'agent' ? c.kind === 'codex' : c.kind !== 'codex'),
    ) || [];
  return matches.find((c) => c.id === preferred) || matches[0];
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
    mode.value = props.entityId ? 'manual' : 'choose';
    url.value = '';
    errorMessage.value = '';
    management.value = undefined;
    notes.value = '';
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
        targetKind: props.kind,
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
        browserMode: 'auto',
      }),
    );
    open.value = false;
    try {
      await router.push({
        path: '/japan-grad/collection',
        query: { job: job.id, returnTo: route.path },
      });
    } catch {
      message.info('网址解析任务已创建，请从新增入口或查询记录查看。');
    }
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
    :title="`新增${kindName}`"
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
      <label>{{ kindName }}官网链接<Input
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
            { value: 'agent', label: '本地 Agent 查询' },
            { value: 'api', label: 'API 查询' },
          ]"
      /></label>
      <p class="create-parent">
        自动整理本层与所属上级，优先复用已有档案；找到的资料核对后再生成。
      </p>
      <p v-if="selectedConnection" class="create-parent">
        使用 {{ selectedConnection.name }} · {{ selectedModel }}
      </p>
      <p v-else-if="management" class="form-error">
        请先<RouterLink to="/japan-grad/ai" @click="open = false">
          连接本地 Agent 或填写 API
</RouterLink>。
      </p>
      <p v-if="errorMessage" class="form-error" role="alert">
        {{ errorMessage }}
      </p>
      <footer>
        <Button :disabled="busy" @click="mode = 'choose'">返回</Button><Button
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
