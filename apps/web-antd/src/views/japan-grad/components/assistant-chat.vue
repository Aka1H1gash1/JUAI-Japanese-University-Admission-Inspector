<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { useWindowSize, useStorage, useEventListener } from '@vueuse/core';
import { App, Button, Checkbox, Input, Modal, Select } from 'ant-design-vue';
import { useExplorerStore } from '../explorer';
import { jsonOptions, localApi } from '../local-api';
import { vAccessibleSelect } from '../select-accessibility';
import ExplorerIcon from './explorer-icon.vue';
import AgentInformationHistory from './agent-information-history.vue';
interface Provider {
  baseUrl: string;
  model: string;
  protocol: 'responses' | 'chat_completions' | 'codex';
  codexPath?: string;
  stream: boolean;
  local?: boolean;
}
interface Settings {
  provider: Provider;
  majorIds: string[];
  writableKinds: string[];
  keyConfigured: boolean;
  configured: boolean;
}
interface Trace {
  id: string;
  label: string;
  status: string;
  error?: string;
}
interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  status: string;
  error?: string;
  tools?: Trace[];
  proposalIds?: string[];
}
interface Proposal {
  id: string;
  path: string;
  name: string;
  summary: string;
  status: string;
  changedFields: string[];
  before: { data: Record<string, unknown> };
  after: { data: Record<string, unknown> };
  error?: string;
}
interface Session {
  id: string;
  title: string;
  provider: Provider;
  scope: { majorIds: string[]; writableKinds: string[] };
  messages: Message[];
  proposals: Proposal[];
  running: boolean;
  keyConfigured: boolean;
}
interface SessionRow {
  id: string;
  title: string;
  model: string;
  running: boolean;
}
const open = defineModel<boolean>('open', { default: false });
const { width: windowWidth } = useWindowSize();
const storedWidth = useStorage('juai-assistant-pane-width', 440);
const maxPaneWidth = computed(() =>
  Math.max(
    320,
    Math.min(
      740,
      windowWidth.value - (windowWidth.value >= 1280 ? 232 : 0) - 400,
    ),
  ),
);
const paneWidth = computed(() =>
  Math.min(
    maxPaneWidth.value,
    Math.max(320, Number.isFinite(storedWidth.value) ? storedWidth.value : 440),
  ),
);
const panel = ref<HTMLElement>();
watch(
  [panel, paneWidth],
  () => {
    if (panel.value && !resizeStart)
      panel.value.style.setProperty(
        '--assistant-pane-width',
        `${paneWidth.value}px`,
      );
  },
  { flush: 'post' },
);
let resizeStart:
  | { x: number; width: number; target: HTMLElement; pointerId: number }
  | undefined;
let resizeFrame = 0,
  nextWidth = 440;
function startResize(event: PointerEvent) {
  if (windowWidth.value <= 900 || event.button !== 0) return;
  const target = event.currentTarget as HTMLElement;
  target.setPointerCapture(event.pointerId);
  nextWidth = paneWidth.value;
  resizeStart = {
    x: event.clientX,
    width: paneWidth.value,
    target,
    pointerId: event.pointerId,
  };
  event.preventDefault();
}
function moveResize(event: PointerEvent) {
  if (!resizeStart) return;
  nextWidth = Math.max(
    320,
    Math.min(
      maxPaneWidth.value,
      resizeStart.width + resizeStart.x - event.clientX,
    ),
  );
  if (!resizeFrame)
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      panel.value?.style.setProperty(
        '--assistant-pane-width',
        `${nextWidth}px`,
      );
      resizeStart?.target.setAttribute(
        'aria-valuenow',
        String(Math.round(nextWidth)),
      );
    });
}
function stopResize() {
  if (!resizeStart) return;
  if (resizeFrame) cancelAnimationFrame(resizeFrame);
  resizeFrame = 0;
  if (resizeStart.target.hasPointerCapture(resizeStart.pointerId))
    resizeStart.target.releasePointerCapture(resizeStart.pointerId);
  storedWidth.value = nextWidth;
  resizeStart = undefined;
}
function resizeKey(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  storedWidth.value =
    event.key === 'Home'
      ? 320
      : event.key === 'End'
        ? maxPaneWidth.value
        : Math.max(
            320,
            Math.min(
              maxPaneWidth.value,
              paneWidth.value + (event.key === 'ArrowLeft' ? 20 : -20),
            ),
          );
}
useEventListener(window, 'pointermove', moveResize);
useEventListener(window, 'pointerup', stopResize);
useEventListener(window, 'pointercancel', stopResize);
onUnmounted(() => {
  if (resizeFrame) cancelAnimationFrame(resizeFrame);
});
interface NativeState {
  connected: boolean;
  ready: boolean;
  needsLogin: boolean;
  models: Array<{ id: string; name: string; isDefault: boolean }>;
  defaultModel?: string;
  error?: string;
  sessionId?: string;
  loginPending?: boolean;
  path?: string;
  accountType?: string;
}
const nativeState = ref<NativeState>({
    connected: false,
    ready: false,
    needsLogin: false,
    models: [],
  }),
  nativeBusy = ref(false),
  loginUrl = ref(''),
  awaitingNative = ref(false);
let invitationSession = '';
let awaitingExternal = false;
let nativeConnectCustom = false;

const store = useExplorerStore(),
  { message, modal } = App.useApp();
const settings = ref<Settings>(),
  sessions = ref<SessionRow[]>([]),
  session = ref<Session>(),
  draft = ref(''),
  error = ref(''),
  status = ref(''),
  busy = ref(false),
  loading = ref(false),
  settingsOpen = ref(false),
  historyOpen = ref(false),
  savingSettings = ref(false),
  acting = ref(''),
  scroll = ref<HTMLElement>();
const form = ref({
  source: 'codex' as 'api' | 'codex',
  codexPath: '',
  baseUrl: 'https://api.openai.com/v1',
  model: '',
  protocol: 'responses' as 'responses' | 'chat_completions',
  stream: true,
  majorIds: [] as string[],
  writableKinds: ['major', 'lab'],
  readOnly: false,
  apiKey: '',
});
const kindOptions = [
  { value: 'major', label: '专攻资料与考试' },
  { value: 'lab', label: '研究室与材料待办' },
  { value: 'professor', label: '老师基本资料' },
  { value: 'university', label: '大学、费用与住宿（共享）' },
  { value: 'school', label: '研究科（共享）' },
];
const majors = computed(() =>
  store.majors.map((m) => {
    const school = store.schools.find((s) => s.id === m.schoolId);
    const university = store.universities.find(
      (u) => u.id === school?.universityId,
    );
    return { value: m.id, label: `${university?.name || ''} / ${m.name}` };
  }),
);
const formKeyConfigured = computed(() => {
  const base = form.value.baseUrl.trim().replace(/\/$/, '');
  return (
    (settings.value?.provider.baseUrl === base &&
      settings.value.keyConfigured) ||
    (session.value?.provider.baseUrl === base && session.value.keyConfigured)
  );
});
const selectedId = computed({
  get: () => session.value?.id,
  set: (id: string | undefined) => {
    if (id) void selectSession(id);
  },
});
const pending = computed(
  () =>
    session.value?.proposals.filter((p) => p.status === 'pending').length || 0,
);
const activeAnswer = computed(() =>
  session.value?.messages.findLast((m) => m.role === 'assistant'),
);
let controller: AbortController | undefined;
let readGeneration = 0;
let refreshTimer: ReturnType<typeof setInterval> | undefined;
let scrollQueued = false;
function keepBottom(force = false) {
  const element = scroll.value;
  if (!element) return;
  const close =
    element.scrollHeight - element.scrollTop - element.clientHeight < 160;
  if (!force && !close) return;
  if (scrollQueued) return;
  scrollQueued = true;
  void nextTick(() => {
    scrollQueued = false;
    if (scroll.value) scroll.value.scrollTop = scroll.value.scrollHeight;
  });
}
async function loadSession(id: string) {
  const generation = ++readGeneration;
  const value = await localApi<Session>(`/assistant/sessions/${id}`);
  if (generation === readGeneration) session.value = value;
}
async function listSessions() {
  sessions.value = await localApi<SessionRow[]>('/assistant/sessions');
}
async function selectSession(id: string) {
  if (busy.value) return;
  loading.value = true;
  error.value = '';
  try {
    await loadSession(id);
    keepBottom(true);
  } catch (e) {
    error.value = e instanceof Error ? e.message : '对话读取失败。';
  } finally {
    loading.value = false;
  }
}
async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [config, history] = await Promise.all([
      localApi<Settings>('/assistant/settings'),
      localApi<SessionRow[]>('/assistant/sessions'),
    ]);
    settings.value = config;
    sessions.value = history;
    if (session.value) await loadSession(session.value.id);
    else if (history.length) await loadSession(history[0]!.id);
    keepBottom(true);
  } catch (e) {
    error.value = e instanceof Error ? e.message : '助手读取失败。';
  } finally {
    loading.value = false;
  }
}
watch(open, (value) => {
  if (value) {
    if (!busy.value) void load();
    else keepBottom(true);
    void refreshNative();
    refreshTimer = setInterval(() => {
      if (
        awaitingNative.value ||
        nativeState.value.loginPending ||
        nativeState.value.needsLogin
      )
        void refreshNative(true);
      if (!busy.value && session.value?.running)
        void loadSession(session.value.id).catch(() => {});
    }, 4000);
  } else {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = undefined;
  }
});
onUnmounted(() => {
  controller?.abort();
  if (refreshTimer) clearInterval(refreshTimer);
});
function editSettings() {
  const c = settings.value,
    provider = session.value?.provider ?? c?.provider,
    scope = session.value?.scope ?? c;
  form.value = {
    source: c?.configured && provider?.protocol !== 'codex' ? 'api' : 'codex',
    codexPath: provider?.codexPath || '',
    baseUrl:
      provider?.protocol === 'codex'
        ? 'https://api.openai.com/v1'
        : provider?.baseUrl || 'https://api.openai.com/v1',
    model: provider?.model || '',
    protocol:
      provider?.protocol === 'codex'
        ? 'responses'
        : provider?.protocol || 'responses',
    stream: provider?.stream !== false,
    majorIds: (scope?.majorIds ?? majors.value.map((m) => m.value)).filter(
      (id) => store.majors.some((m) => m.id === id),
    ),
    writableKinds: [...(scope?.writableKinds ?? ['major', 'lab'])],
    readOnly: scope?.writableKinds.length === 0,
    apiKey: '',
  };
  settingsOpen.value = true;
}
watch(
  () => form.value.source,
  (source) => {
    if (source === 'codex')
      form.value.model =
        session.value?.provider.protocol === 'codex'
          ? session.value.provider.model
          : nativeState.value.defaultModel || '';
    else
      form.value.model =
        session.value?.provider.protocol !== 'codex'
          ? session.value?.provider.model || ''
          : '';
  },
);
watch(historyOpen, (value) => {
  if (!value && !busy.value && session.value)
    void loadSession(session.value.id).catch(() => {});
});
watch(settingsOpen, (value) => {
  if (!value) form.value.apiKey = '';
});
async function newSession() {
  if (busy.value) return;
  error.value = '';
  try {
    readGeneration++;
    session.value = await localApi<Session>(
      '/assistant/sessions',
      jsonOptions('POST', {}),
    );
    await listSessions();
    keepBottom(true);
  } catch (e) {
    error.value = e instanceof Error ? e.message : '请先配置助手。';
    editSettings();
  }
}
async function refreshNative(refresh = false) {
  try {
    const value = await localApi<NativeState>(
      `/assistant/native/status${refresh ? '?refresh=1' : ''}`,
    );
    nativeState.value = value;
    if (
      awaitingNative.value &&
      value.connected &&
      !value.needsLogin &&
      loginUrl.value
    ) {
      loginUrl.value = '';
      await connectNative(nativeConnectCustom);
    } else if (value.ready && awaitingNative.value) {
      if (
        awaitingExternal &&
        value.sessionId &&
        value.sessionId !== invitationSession
      ) {
        await loadSession(value.sessionId);
        settings.value = await localApi<Settings>('/assistant/settings');
        await listSessions();
        awaitingNative.value = false;
        awaitingExternal = false;
        keepBottom(true);
      } else if (loginUrl.value) {
        loginUrl.value = '';
        await connectNative(nativeConnectCustom);
      }
    }
  } catch (e) {
    if (refresh)
      error.value = e instanceof Error ? e.message : '连接状态读取失败。';
  }
}
async function connectNative(custom = false) {
  if (nativeBusy.value || busy.value) return;
  nativeBusy.value = true;
  nativeConnectCustom = custom;
  error.value = '';
  try {
    const result = await localApi<{
      native: NativeState;
      settings: Settings;
      session: Session | null;
    }>(
      '/assistant/native/connect',
      jsonOptions('POST', {
        path: custom
          ? form.value.codexPath
          : settings.value?.provider.codexPath || '',
        ...(custom
          ? {
              model: form.value.model || undefined,
              majorIds: form.value.majorIds,
              writableKinds: form.value.readOnly
                ? []
                : form.value.writableKinds,
            }
          : {}),
      }),
    );
    nativeState.value = result.native;
    if (!result.session) {
      awaitingNative.value = true;
      error.value = '本机 Codex 尚未登录，请完成登录后继续。';
      return;
    }
    readGeneration++;
    settings.value = result.settings;
    session.value = result.session;
    await listSessions();
    awaitingNative.value = false;
    loginUrl.value = '';
    settingsOpen.value = false;
    keepBottom(true);
    message.success('已连接本机 Codex，直接输入问题即可');
  } catch (e) {
    error.value = e instanceof Error ? e.message : '本机 Codex 连接失败。';
  } finally {
    nativeBusy.value = false;
  }
}
async function loginNative() {
  nativeBusy.value = true;
  error.value = '';
  try {
    const result = await localApi<{ authUrl: string }>(
      '/assistant/native/login',
      jsonOptions('POST', {
        path: form.value.codexPath || settings.value?.provider.codexPath || '',
      }),
    );
    loginUrl.value = result.authUrl;
    awaitingNative.value = true;
    nativeState.value.loginPending = true;
    window.open(result.authUrl, '_blank', 'noopener,noreferrer');
  } catch (e) {
    error.value = e instanceof Error ? e.message : '无法打开 Codex 登录。';
  } finally {
    nativeBusy.value = false;
  }
}
async function copyNativePrompt() {
  const scope = session.value?.scope ?? settings.value;
  const body = JSON.stringify({
    majorIds: scope?.majorIds ?? majors.value.map((m) => m.value),
    writableKinds: scope?.writableKinds ?? ['major', 'lab'],
  });
  const text = `请帮我把本机 Codex 连接到 JUAI 网页助手侧栏。JUAI 正在 ${window.location.origin} 运行。仅向 ${window.location.origin}/api/japangrad/assistant/native/connect 发送 POST，头为 Content-Type: application/json 和 X-JapanGrad-Client: 1，正文为 ${body}。该接口会检测本机 Codex、沿用已有登录并创建网页对话；不需要修改源码、SQLite 或 Codex 全局配置。返回 native.ready=true 后停止并告诉我回到网页；如果需要登录，只转述提示，不读取或复制账户凭据。不要调用 turns 或发起模型推理。`;
  try {
    await navigator.clipboard.writeText(text);
    awaitingNative.value = true;
    awaitingExternal = true;
    nativeConnectCustom = settingsOpen.value;
    invitationSession = nativeState.value.sessionId || '';
    message.success('已复制，让本机 Agent 执行后此侧栏会加载新对话');
  } catch {
    error.value = '复制失败，请使用「连接本机 Codex」按钮。';
  }
}
async function saveSettings() {
  if (form.value.source === 'codex') {
    await connectNative(true);
    return;
  }

  savingSettings.value = true;
  error.value = '';
  try {
    settings.value = await localApi<Settings>(
      '/assistant/settings',
      jsonOptions('PUT', {
        provider: {
          baseUrl: form.value.baseUrl,
          model: form.value.model,
          protocol: form.value.protocol,
          stream: form.value.stream,
        },
        majorIds: form.value.majorIds,
        writableKinds: form.value.readOnly ? [] : form.value.writableKinds,
        ...(form.value.apiKey.trim()
          ? { apiKey: form.value.apiKey.trim() }
          : {}),
      }),
    );
    form.value.apiKey = '';
    readGeneration++;
    session.value = await localApi<Session>(
      '/assistant/sessions',
      jsonOptions('POST', {}),
    );
    await listSessions();
    settingsOpen.value = false;
    message.success('已配置，直接输入问题即可');
  } catch (e) {
    error.value = e instanceof Error ? e.message : '助手配置失败。';
  } finally {
    savingSettings.value = false;
  }
}
async function clearKey() {
  try {
    const result = await localApi<{ baseUrl: string; keyConfigured: boolean }>(
      '/assistant/key',
      jsonOptions('DELETE', { baseUrl: form.value.baseUrl }),
    );
    form.value.apiKey = '';
    if (settings.value?.provider.baseUrl === result.baseUrl)
      settings.value.keyConfigured = false;
    if (session.value?.provider.baseUrl === result.baseUrl)
      session.value.keyConfigured = false;
    message.success('已清除此地址的本次密钥');
  } catch (e) {
    error.value = e instanceof Error ? e.message : '密钥清除失败。';
  }
}
async function streamEvents(
  response: Response,
  receive: (event: string, value: any) => void,
) {
  const reader = response.body!.getReader(),
    decoder = new TextDecoder();
  let buffer = '';
  function frame(raw: string) {
    const lines = raw.split('\n'),
      event = lines
        .find((l) => l.startsWith('event:'))
        ?.slice(6)
        .trim();
    const data = lines
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trimStart())
      .join('\n');
    if (event && data) receive(event, JSON.parse(data));
  }
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer = (buffer + decoder.decode(value, { stream: true })).replace(
        /\r\n/g,
        '\n',
      );
      let i;
      while ((i = buffer.indexOf('\n\n')) >= 0) {
        frame(buffer.slice(0, i));
        buffer = buffer.slice(i + 2);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) frame(buffer);
  } finally {
    reader.releaseLock();
  }
}
async function send() {
  if (busy.value || !draft.value.trim()) return;
  if (!session.value) {
    await newSession();
    if (!session.value) return;
  }
  if (session.value.running) {
    error.value = '此对话正在回答，请等待或停止后再发送。';
    return;
  }
  const text = draft.value.trim(),
    id = session.value.id;
  busy.value = true;
  error.value = '';
  status.value = '正在连接模型…';
  controller = new AbortController();
  let started = false,
    finished = false;
  try {
    const response = await fetch(
      `/api/japangrad/assistant/sessions/${id}/turns`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-JapanGrad-Client': '1',
        },
        body: JSON.stringify({ message: text }),
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || '无法开始对话。');
    }
    await streamEvents(response, (event, value) => {
      if (event === 'start') {
        started = true;
        draft.value = '';
        session.value!.messages.push(value.user, value.answer);
        session.value!.running = true;
        keepBottom(true);
      } else if (event === 'delta') {
        if (activeAnswer.value) activeAnswer.value.text += value.text;
        keepBottom();
      } else if (event === 'status') status.value = value.text;
      else if (event === 'tool') {
        const answer = activeAnswer.value;
        if (!answer) return;
        answer.tools ??= [];
        const index = answer.tools.findIndex((t) => t.id === value.id);
        if (index < 0) answer.tools.push(value);
        else answer.tools[index] = value;
        keepBottom();
      } else if (event === 'proposal') {
        session.value!.proposals.push(value);
        activeAnswer.value?.proposalIds?.push(value.id);
        keepBottom();
      } else if (event === 'error') {
        error.value = value.message;
      } else if (event === 'done') {
        finished = true;
        session.value = value.session;
        keepBottom();
      }
    });
    if (!finished)
      throw new Error('连接已断开，已接收的内容保留，请刷新对话查看最终状态。');
  } catch (e) {
    error.value =
      e instanceof Error && e.name === 'AbortError'
        ? '本次回答已停止。'
        : e instanceof Error
          ? e.message
          : '对话失败。';
    if (started) await loadSession(id).catch(() => {});
  } finally {
    busy.value = false;
    status.value = '';
    controller = undefined;
    if (error.value && !draft.value) draft.value = text;
    await listSessions().catch(() => {});
    void refreshNative();
  }
}
async function stop() {
  if (!session.value) return;
  try {
    const result = await localApi<{ stopping: boolean }>(
      `/assistant/sessions/${session.value.id}/stop`,
      jsonOptions('POST', {}),
    );
    if (!result.stopping) controller?.abort();
    status.value = '正在停止…';
  } catch (e) {
    error.value = e instanceof Error ? e.message : '停止失败。';
  }
}
async function resolveProposal(proposal: Proposal, action: 'apply' | 'reject') {
  if (busy.value || !session.value) return;
  acting.value = proposal.id;
  error.value = '';
  try {
    const updated = await localApi<Proposal>(
      `/assistant/proposals/${proposal.id}/${action}`,
      jsonOptions('POST', { confirm: true }),
    );
    const index = session.value.proposals.findIndex(
      (p) => p.id === proposal.id,
    );
    session.value.proposals[index] = updated;
    if (action === 'apply') {
      await store.refresh();
      message.success('已保存资料，可在 Agent 修改记录中撤销');
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '建议处理失败。';
    await loadSession(session.value.id).catch(() => {});
  } finally {
    acting.value = '';
  }
}
function removeSession() {
  if (!session.value || busy.value) return;
  const id = session.value.id;
  modal.confirm({
    title: '删除这个对话？',
    content: '删除对话及其中的建议。已经保存的资料与修改历史保留。',
    okText: '删除对话',
    cancelText: '取消',
    okButtonProps: { danger: true },
    async onOk() {
      await localApi(`/assistant/sessions/${id}`, jsonOptions('DELETE', {}));
      session.value = undefined;
      await listSessions();
    },
  });
}
const fieldLabel = (field: string) =>
  (
    ({
      name: '名称',
      japaneseName: '日文名',
      research: '研究方向',
      website: '官网',
      notes: '备注',
      category: '大学类型',
      region: '地域',
      prefecture: '都道府县',
      location: '所在地',
      qsRank: 'QS 排名',
      qsYear: '排名年份',
      admissionFee: '入学金',
      annualTuition: '年度学费',
      monthlyRent: '月房租',
      monthlyLivingExpenses: '月生活费',
      feeNotes: '费用备注',
      dormitoryStatus: '寮申请状态',
      dormitoryNotes: '住宿备注',
      dormitoryWebsite: '寮申请网站',
      applicationStart: '出愿开始',
      applicationEnd: '出愿截止',
      applicationMaterials: '出愿材料',
      languageRequirements: '语言要求',
      examHistory: '历年考试',
      examNotes: '考试备注',
      applicationNotes: '申请备注',
      wantApply: '想考标记',
      tasks: '材料与待办',
      title: '老师职务',
      laboratory: '研究室名称',
      email: '老师邮箱',
      personalWebsite: '个人主页',
      laboratoryWebsite: '研究室网站',
      favorite: '关注标记',
    }) as Record<string, string>
  )[field] || field;
const display = (value: unknown) =>
  value === undefined
    ? '未填写'
    : typeof value === 'string'
      ? value || '（空）'
      : JSON.stringify(value, null, 2);
const proposalLabel = (status: string) =>
  ({
    pending: '待确认',
    applied: '已保存',
    undone: '已撤销',
    rejected: '已拒绝',
    conflict: '资料有新修改',
  })[status] || status;
</script>
<template>
  <aside
    v-if="open"
    id="juai-assistant-panel"
    ref="panel"
    class="assistant-panel"
    aria-label="AI 资料助手侧栏"
  >
    <div
      class="assistant-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="调整助手侧栏宽度"
      :aria-valuenow="Math.round(paneWidth)"
      :aria-valuemin="320"
      :aria-valuemax="maxPaneWidth"
      tabindex="0"
      title="拖动调整宽度，双击恢复"
      @pointerdown="startResize"
      @keydown="resizeKey"
      @dblclick="storedWidth = 440"
    ></div>
    <header class="assistant-panel-heading">
      <strong>{{
        session?.provider.protocol === 'codex'
          ? 'Codex 资料助手'
          : 'AI 资料助手'
      }}</strong
      ><Button type="text" aria-label="收起助手侧栏" @click="open = false"
        ><ExplorerIcon name="close"
      /></Button>
    </header>
    <div class="assistant-shell">
      <header class="assistant-toolbar">
        <Select
          v-accessible-select
          v-model:value="selectedId"
          show-search
          option-filter-prop="label"
          :disabled="busy || loading"
          :options="sessions.map((s) => ({ value: s.id, label: s.title }))"
          placeholder="选择历史对话"
          aria-label="历史对话"
        />
        <Button :disabled="busy || loading" @click="newSession">新对话</Button
        ><Button :disabled="busy" @click="editSettings">设置</Button
        ><Button :disabled="busy" @click="historyOpen = true">修改记录</Button
        ><Button
          v-if="session"
          :disabled="busy || session.running"
          aria-label="删除当前对话"
          @click="removeSession"
          ><ExplorerIcon name="trash"
        /></Button>
      </header>
      <p v-if="session" class="assistant-context">
        <strong
          >{{ session.provider.protocol === 'codex' ? '本机 Codex / ' : ''
          }}{{ session.provider.model }}</strong
        ><span>{{ session.scope.majorIds.length }} 个专攻</span
        ><span>{{
          session.scope.writableKinds.length ? '修改需确认' : '只读资料'
        }}</span
        ><span v-if="pending">{{ pending }} 项建议待确认</span>
      </p>
      <p
        v-if="
          session
            ? !session.keyConfigured && !session.provider.local
            : settings?.configured &&
              settings.provider.protocol !== 'codex' &&
              !settings.keyConfigured
        "
        class="assistant-notice"
      >
        本地服务未保存 API 密钥，请在「模型与权限」中重新填写。
      </p>
      <div v-if="nativeState.needsLogin" class="assistant-native-login">
        <span>Codex 尚未登录</span
        ><Button :loading="nativeBusy" @click="loginNative">登录 Codex</Button
        ><a
          v-if="loginUrl"
          :href="loginUrl"
          target="_blank"
          rel="noopener noreferrer"
          >继续登录</a
        >
      </div>
      <div
        ref="scroll"
        class="assistant-conversation"
        aria-label="对话内容"
        :aria-busy="busy"
      >
        <div
          v-if="loading"
          class="assistant-skeleton"
          aria-label="正在读取对话"
        >
          <span></span><span></span><span></span>
        </div>
        <section
          v-else-if="!session?.messages.length"
          class="assistant-welcome"
        >
          <span class="assistant-welcome-icon"
            ><ExplorerIcon name="book"
          /></span>
          <h2>在这里，和本机 Agent 对话。</h2>
          <p>
            查找研究室、比较预算、整理考试与材料。每次修改先给你看，再由你确认。
          </p>
          <div class="assistant-connect-actions">
            <Button
              v-if="
                session?.messages.length &&
                session.provider.protocol !== 'codex'
              "
              size="small"
              :disabled="busy"
              :loading="nativeBusy"
              @click="connectNative(false)"
              >连接 Codex</Button
            >
            <Button
              v-if="
                session?.provider.protocol !== 'codex' || !nativeState.ready
              "
              type="primary"
              :loading="nativeBusy"
              @click="connectNative(false)"
              >连接本机 Codex</Button
            ><span v-else class="assistant-native-ready"
              ><ExplorerIcon name="check" />已连接本机 Codex，直接输入问题</span
            ><Button :disabled="nativeBusy" @click="editSettings"
              >其他连接方式</Button
            ><button
              type="button"
              class="text-button"
              @click="copyNativePrompt"
            >
              复制指令给本机 Agent
            </button>
          </div>
          <div class="assistant-suggestions">
            <button
              v-for="text in [
                '对比想考研究室的研究方向和语言要求',
                '帮我找出考试信息还没填完整的专攻',
                '根据现有材料清单，整理下一步待办',
              ]"
              :key="text"
              @click="draft = text"
            >
              {{ text }}<ExplorerIcon name="arrow" />
            </button>
          </div>
        </section>
        <article
          v-for="entry in session?.messages || []"
          :key="entry.id"
          class="assistant-message"
          :class="`assistant-message-${entry.role}`"
        >
          <header>
            {{ entry.role === 'user' ? '你' : 'JUAI 助手'
            }}<small v-if="entry.status === 'interrupted'">已中断</small>
          </header>
          <p v-if="entry.text" class="assistant-message-text">
            {{ entry.text }}
          </p>
          <ul v-if="entry.tools?.length" class="assistant-tool-progress">
            <li v-for="trace in entry.tools" :key="trace.id">
              <ExplorerIcon
                :name="
                  trace.status === 'complete'
                    ? 'check'
                    : trace.status === 'error'
                      ? 'close'
                      : 'search'
                "
              /><span
                >{{ trace.label
                }}{{ trace.status === 'running' ? '…' : '' }}</span
              ><small v-if="trace.error">{{ trace.error }}</small>
            </li>
          </ul>
          <section
            v-for="proposal in (session?.proposals || []).filter((p) =>
              entry.proposalIds?.includes(p.id),
            )"
            :key="proposal.id"
            class="assistant-proposal"
          >
            <header>
              <div>
                <strong>{{ proposal.summary }}</strong
                ><small>{{ proposal.name }}</small>
              </div>
              <span>{{ proposalLabel(proposal.status) }}</span>
            </header>
            <details>
              <summary>
                查看 {{ proposal.changedFields.length }} 个字段的变化
              </summary>
              <div class="assistant-diff-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>字段</th>
                      <th>修改前</th>
                      <th>建议值</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="field in proposal.changedFields" :key="field">
                      <th>{{ fieldLabel(field) }}</th>
                      <td>
                        <pre>{{ display(proposal.before.data[field]) }}</pre>
                      </td>
                      <td>
                        <pre>{{ display(proposal.after.data[field]) }}</pre>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </details>
            <p v-if="proposal.error" class="form-error">{{ proposal.error }}</p>
            <footer v-if="proposal.status === 'pending'">
              <span>确认后同步到工作区</span
              ><Button
                :disabled="busy || !!acting || session?.running"
                @click="resolveProposal(proposal, 'reject')"
                >拒绝</Button
              ><Button
                type="primary"
                :loading="acting === proposal.id"
                :disabled="busy || !!acting || session?.running"
                @click="resolveProposal(proposal, 'apply')"
                >确认修改</Button
              >
            </footer>
          </section>
          <p v-if="entry.error" class="form-error" role="alert">
            {{ entry.error }}
          </p>
        </article>
        <p v-if="busy" class="assistant-working" role="status">{{ status }}</p>
      </div>
      <div v-if="error" class="assistant-error" role="alert">
        {{ error
        }}<Button v-if="!busy" size="small" @click="load">刷新对话</Button>
      </div>
      <form class="assistant-composer" @submit.prevent="send">
        <label class="sr-only" for="assistant-message">发送给助手的问题</label
        ><Input.TextArea
          id="assistant-message"
          v-model:value="draft"
          :maxlength="12000"
          :auto-size="{ minRows: 2, maxRows: 7 }"
          placeholder="问问研究室、预算或考试安排…"
          :disabled="busy"
        />
        <footer>
          <span>授权资料会发送到你配置的模型服务</span
          ><Button v-if="busy || session?.running" @click="stop"
            >停止回答</Button
          ><Button
            v-else
            type="primary"
            html-type="submit"
            :disabled="!draft.trim() || loading"
            >发送</Button
          >
        </footer>
      </form>
    </div>
  </aside>
  <Modal
    v-model:open="historyOpen"
    title="资料修改与撤销"
    :width="960"
    :footer="null"
    ><AgentInformationHistory :active="historyOpen"
  /></Modal>
  <Modal
    v-model:open="settingsOpen"
    title="模型与资料权限"
    :width="700"
    :footer="null"
    :mask-closable="!savingSettings && !nativeBusy"
    :closable="!savingSettings && !nativeBusy"
    :keyboard="!savingSettings && !nativeBusy"
  >
    <form class="assistant-settings" @submit.prevent="saveSettings">
      <p class="form-context">
        选择本机 Codex 或自己的
        API，直接在侧栏对话。模型服务会接收对话和本轮读取的授权资料。
      </p>
      <div class="field">
        <label>助手来源</label
        ><Select
          v-accessible-select
          v-model:value="form.source"
          aria-label="助手来源"
          :options="[
            { value: 'codex', label: '本机 Codex（沿用已有登录）' },
            { value: 'api', label: '自己的模型 API' },
          ]"
        />
      </div>
      <template v-if="form.source === 'api'">
        <div class="field">
          <label for="assistant-base-url">API Base URL</label
          ><Input
            id="assistant-base-url"
            v-model:value="form.baseUrl"
            :maxlength="2048"
            placeholder="https://api.openai.com/v1"
          />
        </div>
        <div class="assistant-setting-row">
          <div class="field">
            <label>接口类型</label
            ><Select
              v-accessible-select
              v-model:value="form.protocol"
              aria-label="模型接口类型"
              :options="[
                { value: 'responses', label: 'OpenAI Responses' },
                {
                  value: 'chat_completions',
                  label: 'OpenAI 兼容 Chat Completions',
                },
              ]"
            />
          </div>
          <div class="field">
            <label for="assistant-model">模型 ID</label
            ><Input
              id="assistant-model"
              v-model:value="form.model"
              :maxlength="160"
              placeholder="填写服务商提供的模型 ID"
            />
          </div>
        </div>
        <p class="form-context">
          较新的 OpenAI 模型选
          Responses；其他兼容服务按其接口选择。模型需支持工具调用。本地服务可填写
          http://localhost:11434/v1 等地址。
        </p>
        <div class="field">
          <label for="assistant-key">API 密钥</label
          ><Input.Password
            id="assistant-key"
            v-model:value="form.apiKey"
            autocomplete="off"
            :maxlength="4096"
            :placeholder="
              formKeyConfigured
                ? '已在本次服务内存中保存，留空保留'
                : '本地模型可留空，远程服务需填写'
            "
          />
        </div>
        <Checkbox v-model:checked="form.stream"
          >流式显示回答（不兼容时可关闭）</Checkbox
        >
      </template>
      <template v-else>
        <p class="form-context">
          直接使用本机 Codex 的登录和模型，无需填写 API 密钥。资料只通过 JUAI
          工具访问，写入仍需确认。
        </p>
        <div class="field">
          <label>Codex 模型</label
          ><Select
            v-accessible-select
            v-model:value="form.model"
            allow-clear
            aria-label="Codex 模型"
            placeholder="自动使用本机默认模型"
            :options="
              nativeState.models.map((m) => ({ value: m.id, label: m.name }))
            "
          />
        </div>
        <details class="assistant-scope-details">
          <summary>程序路径（自动检测失败时填写）</summary>
          <div class="field">
            <label for="assistant-codex-path">codex 程序绝对路径</label
            ><Input
              id="assistant-codex-path"
              v-model:value="form.codexPath"
              placeholder="留空自动检测"
              :maxlength="2048"
            />
          </div>
        </details>
        <div v-if="nativeState.needsLogin" class="assistant-native-login">
          <Button :loading="nativeBusy" @click="loginNative">登录 Codex</Button
          ><a
            v-if="loginUrl"
            :href="loginUrl"
            target="_blank"
            rel="noopener noreferrer"
            >继续登录</a
          >
        </div>
        <button class="text-button" type="button" @click="copyNativePrompt">
          复制连接指令给本机 Agent
        </button>
      </template>
      <details class="assistant-scope-details">
        <summary>
          资料权限：{{ form.majorIds.length }} 个专攻，{{
            form.readOnly ? '只读资料' : '修改均需确认'
          }}
        </summary>
        <fieldset class="assistant-scope">
          <legend>允许助手读取的专攻</legend>
          <Checkbox.Group v-model:value="form.majorIds" :options="majors" />
          <p v-if="!majors.length">请先建立大学与专攻资料。</p>
          <small
            >包含所属大学、研究科、研究室及老师基本资料和备注，邮件与考学经历不开放。</small
          >
        </fieldset>
        <Checkbox v-model:checked="form.readOnly"
          >只查询资料，不提出修改</Checkbox
        >
        <fieldset v-if="!form.readOnly" class="assistant-scope">
          <legend>允许提出修改的资料类型</legend>
          <Checkbox.Group
            v-model:value="form.writableKinds"
            :options="kindOptions"
          /><small
            >大学和研究科为共享资料。所有写入都需要你在对话里确认。</small
          >
        </fieldset>
      </details>
      <p class="form-context">
        范围包含所选专攻的大学、研究室及老师基本资料与备注。可展开调整，邮件和考学经历不开放。
      </p>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <div class="form-footer">
        <Button
          v-if="form.source === 'api' && formKeyConfigured"
          :disabled="savingSettings"
          @click="clearKey"
          >清除本次密钥</Button
        ><span>保存设置后开始新对话</span
        ><Button :disabled="savingSettings" @click="settingsOpen = false"
          >取消</Button
        ><Button
          type="primary"
          html-type="submit"
          :loading="savingSettings || nativeBusy"
          :disabled="
            (form.source === 'api' && !form.model.trim()) ||
            !form.majorIds.length ||
            (!form.readOnly && !form.writableKinds.length)
          "
          >{{
            form.source === 'codex' ? '连接并开始对话' : '保存并开始对话'
          }}</Button
        >
      </div>
    </form>
  </Modal>
</template>
<style scoped>
.assistant-panel {
  container-type: inline-size;
  container-name: assistant-pane;
  position: sticky;
  top: 64px;
  align-self: flex-start;
  flex: 0 0 var(--assistant-pane-width, 440px);
  width: var(--assistant-pane-width, 440px);
  height: calc(100dvh - 64px);
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--jg-surface);
  border-left: 1px solid var(--jg-line);
}
.assistant-panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--jg-line);
}
.assistant-panel-heading strong {
  font-size: 14px;
}
.assistant-panel-heading svg {
  width: 17px;
  height: 17px;
}
.assistant-resizer {
  position: absolute;
  top: 0;
  bottom: 0;
  left: -4px;
  width: 8px;
  cursor: col-resize;
  touch-action: none;
  z-index: 2;
}
.assistant-resizer:hover,
.assistant-resizer:focus-visible {
  background: var(--jg-accent-line);
  outline: none;
}
.assistant-panel > .assistant-shell {
  height: auto;
  flex: 1;
  min-height: 0;
  padding: 14px;
}
.assistant-connect-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.assistant-connect-actions > .text-button {
  width: 100%;
  font-size: 12px;
}
.assistant-native-ready {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--jg-accent-text);
}
.assistant-native-ready svg {
  width: 16px;
  height: 16px;
}
.assistant-native-login {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 10px;
  background: var(--jg-accent-soft);
  border-radius: 8px;
  margin-bottom: 12px;
  font-size: 12px;
}
.assistant-native-login a {
  color: var(--jg-accent-text);
}
@container assistant-pane (max-width: 600px) {
  .assistant-toolbar .ant-select {
    flex-basis: 100%;
  }
  .assistant-welcome {
    padding: 18px 2px;
  }
  .assistant-welcome h2 {
    font-size: 20px;
  }
  .assistant-message {
    padding: 14px;
  }
}
@media (max-width: 900px) {
  .assistant-panel {
    top: 64px;
    flex: 1;
    width: 100%;
    border-left: 0;
  }
  .assistant-resizer {
    display: none;
  }
}
@media (max-width: 767px) {
  .assistant-panel {
    top: 60px;
    height: calc(100dvh - 60px);
  }
}
.assistant-shell {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  color: var(--jg-text);
}
.assistant-toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  padding-bottom: 14px;
}
.assistant-toolbar .ant-select {
  flex: 1;
  min-width: 180px;
}
.assistant-toolbar svg {
  width: 16px;
  height: 16px;
}
.assistant-context {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  margin: 0 0 14px;
  color: var(--jg-muted);
  font-size: 12px;
}
.assistant-context strong {
  color: var(--jg-accent-text);
}
.assistant-conversation {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  padding: 18px;
  background: var(--jg-bg);
  border: 1px solid var(--jg-line);
  border-radius: 16px;
  scrollbar-width: thin;
}
.assistant-welcome {
  display: grid;
  gap: 18px;
  justify-items: start;
  padding: 28px 16px;
}
.assistant-welcome-icon {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  color: var(--jg-accent-text);
  background: var(--jg-accent-soft);
  border: 1px solid var(--jg-accent-line);
  border-radius: 12px;
}
.assistant-welcome h2 {
  margin: 0;
  font-size: 22px;
  letter-spacing: -0.6px;
}
.assistant-welcome p {
  max-width: 44ch;
  margin: 0;
  color: var(--jg-secondary);
  line-height: 1.8;
}
.assistant-suggestions {
  display: grid;
  gap: 10px;
  width: 100%;
  margin-top: 8px;
}
.assistant-suggestions button {
  display: flex;
  gap: 14px;
  align-items: center;
  justify-content: space-between;
  padding: 14px;
  border: 1px solid var(--jg-line);
  border-radius: 8px;
  background: var(--jg-surface);
  color: var(--jg-secondary);
  text-align: left;
  cursor: pointer;
}
.assistant-suggestions button:hover {
  border-color: var(--jg-accent-line);
  color: var(--jg-accent-text);
}
.assistant-suggestions svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}
.assistant-message {
  margin-bottom: 22px;
  padding: 18px;
  background: var(--jg-surface);
  border: 1px solid var(--jg-line);
  border-radius: 12px;
}
.assistant-message-user {
  margin-left: 36px;
  background: var(--jg-accent-soft);
  border-color: var(--jg-accent-line);
}
.assistant-message > header {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--jg-secondary);
}
.assistant-message header small {
  font-weight: 400;
  color: var(--jg-muted);
}
.assistant-message-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  margin: 0;
  font-size: 14px;
  line-height: 1.9;
}
.assistant-tool-progress {
  display: grid;
  gap: 7px;
  padding: 0;
  margin: 14px 0 0;
  list-style: none;
  font-size: 12px;
  color: var(--jg-secondary);
}
.assistant-tool-progress li {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.assistant-tool-progress svg {
  width: 14px;
  height: 14px;
}
.assistant-tool-progress small {
  flex-basis: 100%;
  overflow-wrap: anywhere;
  color: var(--jg-error);
}
.assistant-proposal {
  padding: 16px;
  margin-top: 16px;
  background: var(--jg-card-header);
  border: 1px solid var(--jg-accent-line);
  border-radius: 12px;
}
.assistant-proposal > header {
  display: flex;
  gap: 12px;
  justify-content: space-between;
  font-size: 13px;
}
.assistant-proposal header small {
  display: block;
  margin-top: 4px;
}
.assistant-proposal header > span {
  color: var(--jg-accent-text);
  white-space: nowrap;
  font-size: 12px;
}
.assistant-proposal summary {
  padding: 14px 0;
  font-size: 12px;
  color: var(--jg-secondary);
  cursor: pointer;
}
.assistant-proposal footer {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
  justify-content: end;
  align-items: center;
}
.assistant-proposal footer > span {
  flex: 1;
  font-size: 12px;
  color: var(--jg-muted);
}
.assistant-diff-scroll {
  overflow-x: auto;
}
.assistant-diff-scroll table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  min-width: 420px;
}
.assistant-diff-scroll th,
.assistant-diff-scroll td {
  padding: 10px;
  border: 1px solid var(--jg-line);
  text-align: left;
  vertical-align: top;
  font-size: 12px;
}
.assistant-diff-scroll th {
  background: var(--jg-subtle);
  color: var(--jg-secondary);
}
.assistant-diff-scroll th:first-child {
  width: 120px;
}
.assistant-diff-scroll pre {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 260px;
  overflow: auto;
  font: 12px/1.7 var(--jg-font);
}
.assistant-working {
  margin: 16px 0 0;
  font-size: 13px;
  color: var(--jg-accent-text);
}
.assistant-notice,
.assistant-error {
  padding: 10px 12px;
  margin: 0 0 12px;
  background: var(--jg-subtle);
  color: var(--jg-secondary);
  font-size: 12px;
  border-radius: 8px;
}
.assistant-error {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  margin: 12px 0 0;
  background: var(--jg-error-bg);
  color: var(--jg-error);
}
.assistant-composer {
  padding-top: 14px;
}
.assistant-composer footer {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
}
.assistant-composer footer span {
  font-size: 11px;
  color: var(--jg-muted);
}
.assistant-settings {
  display: grid;
  gap: 16px;
  max-height: 72dvh;
  overflow-y: auto;
  padding-right: 6px;
  color: var(--jg-text);
}
.assistant-setting-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.assistant-settings .form-context {
  margin: 0;
}
.assistant-scope-details {
  border: 1px solid var(--jg-line);
  border-radius: 8px;
  padding: 12px 14px;
}
.assistant-scope-details summary {
  cursor: pointer;
  color: var(--jg-secondary);
  font-size: 13px;
}
.assistant-scope-details[open] > :not(summary) {
  margin-top: 14px;
}
.assistant-settings > .form-footer {
  position: sticky;
  bottom: 0;
  padding: 12px 0 0;
  background: var(--jg-elevated);
}
.assistant-scope {
  border: 1px solid var(--jg-line);
  border-radius: 8px;
  padding: 14px;
  margin: 0;
  min-width: 0;
}
.assistant-scope legend {
  float: none;
  width: auto;
  padding: 0 6px;
  margin: 0;
  font-size: 13px;
  color: var(--jg-secondary);
}
.assistant-scope :deep(.ant-checkbox-group) {
  display: grid;
  gap: 10px;
  justify-items: start;
  max-height: 180px;
  overflow-y: auto;
}
.assistant-scope :deep(.ant-checkbox-wrapper) {
  margin: 0;
}
.assistant-scope small {
  display: block;
  margin-top: 12px;
  color: var(--jg-muted);
  line-height: 1.8;
}
.assistant-skeleton {
  display: grid;
  gap: 20px;
  padding-top: 24px;
}
.assistant-skeleton span {
  height: 110px;
  background: var(--jg-subtle);
  border-radius: 12px;
}
.assistant-skeleton span:nth-child(2) {
  margin-left: 40px;
  height: 70px;
}
@media (max-width: 767px) {
  .assistant-conversation {
    padding: 12px;
  }
  .assistant-welcome {
    padding: 18px 4px;
  }
  .assistant-message {
    padding: 14px;
  }
  .assistant-message-user {
    margin-left: 20px;
  }
  .assistant-setting-row {
    grid-template-columns: minmax(0, 1fr);
  }
  .assistant-toolbar .ant-select {
    flex-basis: 100%;
  }
  .assistant-composer footer span {
    max-width: 65%;
  }
}
</style>
