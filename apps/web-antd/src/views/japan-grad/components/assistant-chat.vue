<script setup lang="ts">
import type {
  AssistantNoteDraft,
  ReaderAssistantContext,
  ReaderSource,
} from '../reader-types';

import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useEventListener, useStorage, useWindowSize } from '@vueuse/core';
import { App, Button, Input, Modal, Select } from 'ant-design-vue';

import { documentReaderPath } from '../documents';
import { useExplorerStore } from '../explorer';
import { jsonOptions, localApi } from '../local-api';
import { requireValue } from '../required-value';
import { vAccessibleSelect } from '../select-accessibility';
import AgentInformationHistory from './agent-information-history.vue';
import AssistantAnswer from './assistant-answer.vue';
import ExplorerIcon from './explorer-icon.vue';
const props = defineProps<{ reader?: ReaderAssistantContext }>();
const emit = defineEmits<{
  locateSource: [source: ReaderSource];
  saveNote: [draft: AssistantNoteDraft];
}>();
const route = useRoute();
const router = useRouter();
const settingsPath = () =>
  `/assistant/settings${props.reader ? '?feature=document_chat' : ''}`;
interface Provider {
  baseUrl: string;
  model: string;
  protocol: 'chat_completions' | 'codex' | 'responses';
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
  role: 'assistant' | 'user';
  text: string;
  status: string;
  error?: string;
  tools?: Trace[];
  proposalIds?: string[];
  sources?: ReaderSource[];
  selection?: { page: number; quote: string };
  citationWarning?: string;
  documentPage?: number;
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
  scope: {
    majorIds: string[];
    writableKinds: string[];
    document?: { id: string; sha256: string; title: string };
  };
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
    if (panel.value && !resizeStart && !props.reader)
      panel.value.style.setProperty(
        '--assistant-pane-width',
        `${paneWidth.value}px`,
      );
  },
  { flush: 'post' },
);
let resizeStart:
  | undefined
  | { x: number; width: number; target: HTMLElement; pointerId: number };
let nextWidth = 440;
let resizeFrame = 0;
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
  if (!['ArrowLeft', 'ArrowRight', 'End', 'Home'].includes(event.key)) return;
  event.preventDefault();
  storedWidth.value = (() => {
    if (event.key === 'Home') {
      return 320;
    }
    if (event.key === 'End') {
      return maxPaneWidth.value;
    }
    return Math.max(
      320,
      Math.min(
        maxPaneWidth.value,
        paneWidth.value + (event.key === 'ArrowLeft' ? 20 : -20),
      ),
    );
  })();
}
useEventListener(window, 'juai-ai-config-changed', () => {
  if (!busy.value && open.value) void load();
});
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
const awaitingNative = ref(false);
const loginUrl = ref('');
const nativeBusy = ref(false);
const nativeState = ref<NativeState>({
  connected: false,
  ready: false,
  needsLogin: false,
  models: [],
});
let invitationSession = '';
let awaitingExternal = false;
let nativeConnectCustom = false;

const store = useExplorerStore();
const { message, modal } = App.useApp();
const acting = ref('');
const busy = ref(false);
const draft = ref('');
const errorMessage = ref('');
const historyOpen = ref(false);
const loading = ref(false);
const savingSettings = ref(false);
const scroll = ref<HTMLElement>();
const session = ref<Session>();
const sessions = ref<SessionRow[]>([]);
const settings = ref<Settings>();
const settingsOpen = ref(false);
const status = ref('');
const attachment = ref<{ page: number; quote: string }>();
const creatingSession = ref(false);
const sessionInput = () =>
  props.reader
    ? { document: { id: props.reader.documentId, sha256: props.reader.sha256 } }
    : {};
const sessionListPath = () =>
  props.reader
    ? `/assistant/sessions?documentId=${encodeURIComponent(props.reader.documentId)}&sha256=${props.reader.sha256}`
    : '/assistant/sessions';
function sharedScope() {
  const ids = (settings.value?.majorIds ?? form.value.majorIds).filter((id) =>
    store.majors.some((m) => m.id === id),
  );
  return {
    majorIds: ids.length > 0 ? ids : majors.value.map((m) => m.value),
    writableKinds: settings.value?.writableKinds ?? ['major', 'lab'],
  };
}
function attachSelection(value: { page: number; quote: string }) {
  if (!props.reader || busy.value) {
    message.info('请先等待当前回答结束，或停止回答。');
    return;
  }
  if (value.quote.length > 8000) {
    message.info('每次提问最多附上 8,000 字，请缩小选区。');
    return;
  }
  attachment.value = { page: value.page, quote: value.quote };
  if (!draft.value.trim()) draft.value = '请解释这段原文，并标出依据。';
  void nextTick(() =>
    document.querySelector<HTMLTextAreaElement>('#assistant-message')?.focus(),
  );
}
function locate(source: ReaderSource) {
  if (props.reader) emit('locateSource', source);
  else
    window.open(
      `${documentReaderPath(source.documentId)}?page=${source.page}&sha256=${source.sha256}&quote=${encodeURIComponent(source.quote)}`,
      '_blank',
      'noopener,noreferrer',
    );
}
function saveAnswer(entry: Message) {
  const index =
    session.value?.messages.findIndex((m) => m.id === entry.id) ?? -1;
  const question = session.value?.messages
    .slice(0, index)
    .findLast((m) => m.role === 'user')?.text;
  emit('saveNote', {
    title: `AI 阅读笔记${question ? `：${question.slice(0, 70)}` : ''}`,
    body: entry.text,
    sources: entry.sources ?? [],
  });
}
defineExpose({ attachSelection });
const form = ref({
  source: 'codex' as 'api' | 'codex',
  codexPath: '',
  baseUrl: 'https://api.openai.com/v1',
  model: '',
  protocol: 'responses' as 'chat_completions' | 'responses',
  stream: true,
  majorIds: [] as string[],
  writableKinds: ['major', 'lab'],
  readOnly: false,
  apiKey: '',
});
const majors = computed(() =>
  store.majors.map((m) => {
    const school = store.schools.find((s) => s.id === m.schoolId);
    const university = store.universities.find(
      (u) => u.id === school?.universityId,
    );
    return { value: m.id, label: `${university?.name || ''} / ${m.name}` };
  }),
);
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
  if (!session.value?.messages.length) {
    element.scrollTop = 0;
    return;
  }
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
  validateSessionScope(value);
  if (generation === readGeneration) session.value = value;
}
function validateSessionScope(value: Session) {
  if (
    props.reader
      ? value.scope.document?.id !== props.reader.documentId ||
        value.scope.document?.sha256 !== props.reader.sha256
      : !!value.scope.document
  )
    throw new Error('这份对话属于另一资料范围，请在当前页面新建对话。');
}
async function listSessions() {
  sessions.value = await localApi<SessionRow[]>(sessionListPath());
}
async function selectSession(id: string) {
  if (busy.value) return;
  loading.value = true;
  errorMessage.value = '';
  try {
    await loadSession(id);
    keepBottom(true);
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '对话读取失败。';
  } finally {
    loading.value = false;
  }
}
async function load() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const [config, history] = await Promise.all([
      localApi<Settings>(settingsPath()),
      localApi<SessionRow[]>(sessionListPath()),
    ]);
    settings.value = config;
    sessions.value = history;
    if (session.value) await loadSession(session.value.id);
    else if (history.length > 0) await loadSession(requireValue(history[0]).id);
    keepBottom(true);
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '助手读取失败。';
  } finally {
    loading.value = false;
  }
}
watch(
  open,
  (value) => {
    if (refreshTimer) clearInterval(refreshTimer);
    if (value) {
      if (busy.value) {
        keepBottom(true);
      } else {
        void load();
      }
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
  },
  { immediate: true },
);
onUnmounted(() => {
  controller?.abort();
  if (refreshTimer) clearInterval(refreshTimer);
});
function editSettings() {
  void router.push({
    path: '/japan-grad/ai',
    query: { tab: 'features', returnTo: route.fullPath },
  });
}
watch(historyOpen, (value) => {
  if (!value && !busy.value && session.value)
    void loadSession(session.value.id).catch(() => {});
});
async function newSession() {
  if (busy.value || creatingSession.value) return;
  creatingSession.value = true;
  errorMessage.value = '';
  try {
    readGeneration++;
    session.value = await localApi<Session>(
      '/assistant/sessions',
      jsonOptions('POST', sessionInput()),
    );
    try {
      validateSessionScope(session.value);
    } catch (error) {
      session.value = undefined;
      throw error;
    }
    await listSessions();
    keepBottom(true);
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '请先配置助手。';
    editSettings();
  } finally {
    creatingSession.value = false;
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
        settings.value = await localApi<Settings>(settingsPath());
        await listSessions();
        awaitingNative.value = false;
        awaitingExternal = false;
        keepBottom(true);
      } else if (loginUrl.value) {
        loginUrl.value = '';
        await connectNative(nativeConnectCustom);
      }
    }
  } catch (error) {
    if (refresh)
      errorMessage.value =
        error instanceof Error ? error.message : '连接状态读取失败。';
  }
}
async function connectNative(custom = false) {
  if (nativeBusy.value || busy.value) return;
  nativeBusy.value = true;
  nativeConnectCustom = custom;
  errorMessage.value = '';
  try {
    const result = await localApi<{
      native: NativeState;
      settings: Settings;
      session: null | Session;
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
        ...(props.reader ? { ...sharedScope(), ...sessionInput() } : {}),
      }),
    );
    nativeState.value = result.native;
    if (!result.session) {
      awaitingNative.value = true;
      errorMessage.value = '本机 Codex 尚未登录，请完成登录后继续。';
      return;
    }
    readGeneration++;
    settings.value = result.settings;
    validateSessionScope(result.session);
    session.value = result.session;
    await listSessions();
    awaitingNative.value = false;
    loginUrl.value = '';
    settingsOpen.value = false;
    keepBottom(true);
    message.success('已连接本机 Codex，直接输入问题即可');
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '本机 Codex 连接失败。';
  } finally {
    nativeBusy.value = false;
  }
}
async function loginNative() {
  nativeBusy.value = true;
  errorMessage.value = '';
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
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '无法打开 Codex 登录。';
  } finally {
    nativeBusy.value = false;
  }
}
async function copyNativePrompt() {
  const scope = session.value?.scope ?? settings.value;
  const body = JSON.stringify({
    majorIds: scope?.majorIds ?? majors.value.map((m) => m.value),
    writableKinds: scope?.writableKinds ?? ['major', 'lab'],
    ...sessionInput(),
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
    errorMessage.value = '复制失败，请使用「连接本机 Codex」按钮。';
  }
}
async function streamEvents(
  response: Response,
  receive: (event: string, value: any) => void,
) {
  const decoder = new TextDecoder();
  const reader = requireValue(response.body).getReader();
  let buffer = '';
  function frame(raw: string) {
    const lines = raw.split('\n');
    const event = lines
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
      buffer = (buffer + decoder.decode(value, { stream: true })).replaceAll(
        '\r\n',
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
  if (
    busy.value ||
    creatingSession.value ||
    nativeBusy.value ||
    savingSettings.value ||
    !draft.value.trim()
  )
    return;
  if (!session.value) {
    await newSession();
    if (!session.value) return;
  }
  if (session.value.running) {
    errorMessage.value = '此对话正在回答，请等待或停止后再发送。';
    return;
  }
  const id = session.value.id;
  const text = draft.value.trim();
  const selection = attachment.value ? { ...attachment.value } : undefined;
  busy.value = true;
  errorMessage.value = '';
  status.value = '正在连接模型…';
  controller = new AbortController();
  let finished = false;
  let started = false;
  try {
    const response = await fetch(
      `/api/japangrad/assistant/sessions/${id}/turns`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-JapanGrad-Client': '1',
        },
        body: JSON.stringify({
          message: text,
          ...(props.reader
            ? {
                reader: {
                  documentId: props.reader.documentId,
                  sha256: props.reader.sha256,
                  page: props.reader.page,
                  ...(selection ? { selection } : {}),
                },
              }
            : {}),
        }),
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
        attachment.value = undefined;
        requireValue(session.value).messages.push(value.user, value.answer);
        requireValue(session.value).running = true;
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
        if (index === -1) answer.tools.push(value);
        else answer.tools[index] = value;
        keepBottom();
      } else if (event === 'source') {
        if (activeAnswer.value) {
          activeAnswer.value.sources ??= [];
          if (
            !activeAnswer.value.sources.some((source) => source.id === value.id)
          )
            activeAnswer.value.sources.push(value);
        }
      } else if (event === 'proposal') {
        requireValue(session.value).proposals.push(value);
        activeAnswer.value?.proposalIds?.push(value.id);
        keepBottom();
      } else if (event === 'error') {
        errorMessage.value = value.message;
      } else if (event === 'done') {
        finished = true;
        session.value = value.session;
        keepBottom();
      }
    });
    if (!finished)
      throw new Error('连接已断开，已接收的内容保留，请刷新对话查看最终状态。');
  } catch (error) {
    errorMessage.value = (() => {
      if (error instanceof Error && error.name === 'AbortError') {
        return '本次回答已停止。';
      }
      if (error instanceof Error) {
        return error.message;
      }
      return '对话失败。';
    })();
    if (started) await loadSession(id).catch(() => {});
  } finally {
    busy.value = false;
    status.value = '';
    controller = undefined;
    if (errorMessage.value && !draft.value) draft.value = text;
    if (errorMessage.value && selection && !attachment.value)
      attachment.value = selection;
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
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '停止失败。';
  }
}
async function resolveProposal(proposal: Proposal, action: 'apply' | 'reject') {
  if (busy.value || !session.value) return;
  acting.value = proposal.id;
  errorMessage.value = '';
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
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '建议处理失败。';
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
const display = (value: unknown) => {
  if (value === undefined) {
    return '未填写';
  }
  if (typeof value === 'string') {
    return value || '（空）';
  }
  return JSON.stringify(value, null, 2);
};
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
    :class="{ 'is-embedded': !!reader }"
    aria-label="AI 资料助手侧栏"
  >
    <div
      v-if="!reader"
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
    <header v-if="!reader" class="assistant-panel-heading">
      <strong>{{
        session?.provider.protocol === 'codex'
          ? 'Codex 资料助手'
          : 'AI 资料助手'
      }}</strong><Button type="text" aria-label="收起助手侧栏" @click="open = false">
        <ExplorerIcon name="close" />
      </Button>
    </header>
    <div class="assistant-shell">
      <header class="assistant-toolbar">
        <Select
          v-accessible-select
          v-model:value="selectedId"
          show-search
          option-filter-prop="label"
          :disabled="busy || loading || creatingSession"
          :options="sessions.map((s) => ({ value: s.id, label: s.title }))"
          placeholder="选择历史对话"
          aria-label="历史对话"
        />
        <Button
          :disabled="busy || loading || creatingSession"
          @click="newSession"
        >
          新对话
</Button><Button :disabled="busy" @click="editSettings">AI 管理</Button><Button v-if="!reader" :disabled="busy" @click="historyOpen = true">
          修改记录
</Button><Button
          v-if="session"
          :disabled="busy || session.running"
          aria-label="删除当前对话"
          @click="removeSession"
        >
          <ExplorerIcon name="trash" />
        </Button>
      </header>
      <p v-if="session" class="assistant-context">
        <strong>{{ session.provider.protocol === 'codex' ? '本机 Codex / ' : ''
          }}{{ session.provider.model }}</strong><span>{{
          reader ? '仅当前文档' : `${session.scope.majorIds.length} 个专攻`
        }}</span><span>{{
          reader
            ? '保存笔记需确认'
            : session.scope.writableKinds.length
              ? '修改需确认'
              : '只读资料'
        }}</span><span v-if="pending">{{ pending }} 项建议待确认</span>
      </p>
      <p v-if="reader" class="assistant-document-context" :title="reader.title">
        <ExplorerIcon name="book" /><span>{{ reader.title }}</span><small>当前第 {{ reader.page }} 页</small>
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
        <span>Codex 尚未登录</span><Button :loading="nativeBusy" @click="loginNative">登录 Codex</Button><a
          v-if="loginUrl"
          :href="loginUrl"
          target="_blank"
          rel="noopener noreferrer"
          >继续登录</a>
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
          v-else-if="!session?.messages.length && attachment"
          class="assistant-selection-intro"
        >
          <ExplorerIcon name="book" />
          <h2>围绕这段原文提问</h2>
          <p>选段已附在输入框上方。补充问题后发送，或在设置中选择模型连接。</p>
        </section>
        <section
          v-else-if="!session?.messages.length"
          class="assistant-welcome"
        >
          <span class="assistant-welcome-icon"><ExplorerIcon name="book" /></span>
          <h2>
            {{
              reader
                ? '围绕这份资料，深入理解。'
                : '在这里，和本机 Agent 对话。'
            }}
          </h2>
          <p>
            {{
              reader
                ? '直接提问，或选中一段原文再问。回答中的引用可点回原文，想法可以确认后存成笔记。'
                : '查找研究室、比较预算、整理考试与材料。每次修改先给你看，再由你确认。'
            }}
          </p>
          <div class="assistant-connect-actions">
            <Button
              v-if="reader && settings?.configured && !session"
              type="primary"
              :disabled="busy || loading"
              @click="newSession"
            >
              使用已配置模型
            </Button>
            <Button
              v-if="
                session?.messages.length &&
                session.provider.protocol !== 'codex'
              "
              size="small"
              :disabled="busy"
              :loading="nativeBusy"
              @click="connectNative(false)"
            >
              连接 Codex
            </Button>
            <Button
              v-if="
                (!reader ||
                  !settings?.configured ||
                  session?.provider.protocol === 'codex') &&
                (session?.provider.protocol !== 'codex' || !nativeState.ready)
              "
              type="primary"
              :loading="nativeBusy"
              @click="connectNative(false)"
            >
              连接本机 Codex
</Button><span
              v-else-if="
                session?.provider.protocol === 'codex' && nativeState.ready
              "
              class="assistant-native-ready"
              ><ExplorerIcon name="check" />已连接本机 Codex，直接输入问题</span><Button :disabled="nativeBusy" @click="editSettings">
              管理连接与模型
</Button><button
              type="button"
              class="text-button"
              @click="copyNativePrompt"
            >
              复制指令给本机 Agent
            </button>
          </div>
          <div class="assistant-suggestions">
            <button
              v-for="text in reader
                ? [
                    '请解释当前页的主要内容，并引用原文依据',
                    '这份资料有哪些关键信息？请说明你查看的范围',
                    '结合我保存的笔记，整理还需要弄清楚的问题',
                  ]
                : [
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
            }}<small v-if="entry.documentPage">第 {{ entry.documentPage }} 页</small><small v-if="entry.status === 'interrupted'">已中断</small>
          </header>
          <p
            v-if="entry.text && entry.role === 'user'"
            class="assistant-message-text"
          >
            {{ entry.text }}
          </p>
          <AssistantAnswer
            v-else-if="entry.text"
            :text="entry.text"
            :sources="entry.sources"
            @locate="locate"
          />
          <blockquote
            v-if="entry.selection"
            class="assistant-attached-selection"
          >
            <span>附上原文 · 第 {{ entry.selection.page }} 页</span>{{ entry.selection.quote }}
          </blockquote>
          <div v-if="entry.sources?.length" class="assistant-message-sources">
            <span>{{
              entry.status === 'complete' ? '引用原文' : '已读取的原文'
            }}</span><button
              v-for="source in entry.sources"
              :key="source.id"
              :title="source.quote"
              @click="locate(source)"
            >
              <strong>{{ source.id }} · {{ source.locator }}</strong><span>{{ source.quote }}</span>
            </button>
          </div>
          <p v-if="entry.citationWarning" class="assistant-citation-warning">
            {{ entry.citationWarning }}
          </p>
          <Button
            v-if="
              reader &&
              entry.role === 'assistant' &&
              entry.status === 'complete' &&
              entry.text
            "
            size="small"
            class="assistant-save-note"
            :disabled="busy || session?.running"
            @click="saveAnswer(entry)"
          >
            <ExplorerIcon name="notebook" />存为笔记
          </Button>
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
              /><span>{{ trace.label
                }}{{ trace.status === 'running' ? '…' : '' }}</span><small v-if="trace.error">{{ trace.error }}</small>
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
                <strong>{{ proposal.summary }}</strong><small>{{ proposal.name }}</small>
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
            <p v-if="proposal.error" class="form-error">
              {{ proposal.error }}
            </p>
            <footer v-if="proposal.status === 'pending'">
              <span>确认后同步到工作区</span><Button
                :disabled="busy || !!acting || session?.running"
                @click="resolveProposal(proposal, 'reject')"
              >
                拒绝
</Button><Button
                type="primary"
                :loading="acting === proposal.id"
                :disabled="busy || !!acting || session?.running"
                @click="resolveProposal(proposal, 'apply')"
              >
                确认修改
              </Button>
            </footer>
          </section>
          <p v-if="entry.error" class="form-error" role="alert">
            {{ entry.error }}
          </p>
        </article>
        <p v-if="busy" class="assistant-working" role="status">{{ status }}</p>
      </div>
      <div v-if="errorMessage" class="assistant-error" role="alert">
        {{ errorMessage
        }}<Button v-if="!busy" size="small" @click="load">刷新对话</Button>
      </div>
      <form class="assistant-composer" @submit.prevent="send">
        <div v-if="attachment" class="assistant-selection-attachment">
          <div>
            <strong>已附原文 · 第 {{ attachment.page }} 页</strong>
            <p>{{ attachment.quote }}</p>
          </div>
          <button
            type="button"
            aria-label="移除提问选段"
            :disabled="busy"
            @click="attachment = undefined"
          >
            <ExplorerIcon name="close" />
          </button>
        </div>
        <label class="sr-only" for="assistant-message">发送给助手的问题</label><Input.TextArea
          id="assistant-message"
          v-model:value="draft"
          :maxlength="12000"
          :auto-size="{ minRows: 2, maxRows: 7 }"
          :placeholder="
            reader
              ? '针对当前资料提问，回答会附上原文引用…'
              : '问问研究室、预算或考试安排…'
          "
          :disabled="busy"
        />
        <footer>
          <span>{{
            reader
              ? '提问及读取的原文会交给所选模型处理'
              : '授权资料会发送到你配置的模型服务'
          }}</span><Button v-if="busy || session?.running" @click="stop">
            停止回答
</Button><Button
            v-else
            type="primary"
            html-type="submit"
            :disabled="
              !draft.trim() ||
              loading ||
              creatingSession ||
              nativeBusy ||
              savingSettings
            "
          >
            发送
          </Button>
        </footer>
      </form>
    </div>
  </aside>
  <Modal
    v-model:open="historyOpen"
    title="资料修改与撤销"
    :width="960"
    :footer="null"
  >
    <AgentInformationHistory :active="historyOpen" />
  </Modal>
</template>
<style scoped>
.assistant-panel.is-embedded {
  position: relative;
  top: 0;
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
  min-height: 0;
  border: 0;
}

.is-embedded .assistant-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 12px;
}

.is-embedded .assistant-toolbar .ant-select {
  flex: 1;
  min-width: 130px;
}

.is-embedded .assistant-toolbar .ant-btn {
  padding-inline: 8px;
  font-size: 12px;
}

.is-embedded .assistant-context {
  padding-inline: 14px;
  font-size: 10px;
}

.assistant-document-context {
  display: flex;
  gap: 7px;
  align-items: center;
  padding: 8px 14px;
  margin: 0;
  font-size: 11px;
  background: var(--jg-card-header);
  border-bottom: 1px solid var(--jg-line);
}

.assistant-document-context svg {
  width: 14px;
  height: 14px;
  color: var(--jg-accent-text);
}

.assistant-document-context > span {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.assistant-document-context small {
  flex: none;
  color: var(--jg-muted);
}

.is-embedded .assistant-welcome {
  padding: 24px 16px;
}

.is-embedded .assistant-welcome h2 {
  font-size: 17px;
}

.is-embedded .assistant-welcome p {
  font-size: 12px;
}

.is-embedded .assistant-conversation {
  padding: 14px;
}

.is-embedded .assistant-message-user {
  margin-left: 16px;
}

.is-embedded .assistant-message {
  padding: 13px;
}

.is-embedded .assistant-message-text {
  font-size: 13px;
}

.is-embedded .assistant-composer {
  padding: 12px;
}

.is-embedded .assistant-connect-actions > .text-button {
  display: none;
}

.assistant-selection-intro {
  display: grid;
  gap: 12px;
  padding: 24px 12px;
}

.assistant-selection-intro > svg {
  width: 28px;
  height: 28px;
  color: var(--jg-accent-text);
}

.assistant-selection-intro h2 {
  font-size: 16px;
  font-weight: 650;
}

.assistant-selection-intro p {
  font-size: 12px;
  line-height: 1.9;
  color: var(--jg-muted);
}

.assistant-attached-selection {
  max-height: 150px;
  padding: 8px 10px;
  margin: 10px 0 0;
  overflow: auto;
  font-size: 12px;
  color: var(--jg-secondary);
  white-space: pre-wrap;
  border-left: 2px solid var(--jg-accent-line);
}

.assistant-attached-selection > span {
  display: block;
  margin-bottom: 4px;
  font-size: 10px;
  color: var(--jg-muted);
}

.assistant-message-sources {
  display: grid;
  gap: 7px;
  margin-top: 14px;
}

.assistant-message-sources > span {
  font-size: 10px;
  color: var(--jg-muted);
}

.assistant-message-sources button {
  display: grid;
  gap: 5px;
  padding: 9px;
  color: var(--jg-secondary);
  text-align: left;
  cursor: pointer;
  background: var(--jg-card-header);
  border: 1px solid var(--jg-line);
  border-radius: 7px;
}

.assistant-message-sources strong {
  font-size: 10px;
  font-weight: 600;
  color: var(--jg-accent-text);
}

.assistant-message-sources button > span {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  font-size: 11px;
  line-height: 1.8;
  overflow-wrap: anywhere;
}

.assistant-citation-warning {
  margin-top: 10px !important;
  font-size: 11px;
  line-height: 1.8;
  color: var(--jg-warning);
}

.assistant-save-note {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  margin-top: 12px;
  font-size: 11px;
}

.assistant-save-note svg {
  width: 14px;
  height: 14px;
}

.assistant-selection-attachment {
  display: flex;
  gap: 6px;
  align-items: flex-start;
  padding: 9px;
  margin-bottom: 9px;
  background: var(--jg-accent-soft);
  border: 1px solid var(--jg-accent-line);
  border-radius: 7px;
}

.assistant-selection-attachment > div {
  flex: 1;
  min-width: 0;
}

.assistant-selection-attachment strong {
  font-size: 10px;
  color: var(--jg-accent-text);
}

.assistant-selection-attachment p {
  display: -webkit-box;
  margin-top: 5px !important;
  overflow: hidden;
  -webkit-line-clamp: 3;
  font-size: 12px;
  line-height: 1.7;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
}

.assistant-selection-attachment button {
  padding: 0;
  color: var(--jg-muted);
  cursor: pointer;
  background: transparent;
  border: 0;
}

.assistant-selection-attachment svg {
  width: 14px;
  height: 14px;
}

.assistant-panel {
  position: sticky;
  top: 64px;
  display: flex;
  flex: 0 0 var(--assistant-pane-width, 440px);
  flex-direction: column;
  align-self: flex-start;
  width: var(--assistant-pane-width, 440px);
  min-width: 0;
  height: calc(100dvh - 64px);
  container-name: assistant-pane;
  container-type: inline-size;
  background: var(--jg-surface);
  border-left: 1px solid var(--jg-line);
}

.assistant-panel-heading {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
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
  z-index: 2;
  width: 8px;
  touch-action: none;
  cursor: col-resize;
}

.assistant-resizer:hover,
.assistant-resizer:focus-visible {
  outline: none;
  background: var(--jg-accent-line);
}

.assistant-panel > .assistant-shell {
  flex: 1;
  height: auto;
  min-height: 0;
  padding: 14px;
}

.assistant-connect-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.assistant-connect-actions > .text-button {
  width: 100%;
  font-size: 12px;
}

.assistant-native-ready {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 13px;
  color: var(--jg-accent-text);
}

.assistant-native-ready svg {
  width: 16px;
  height: 16px;
}

.assistant-native-login {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  padding: 10px;
  margin-bottom: 12px;
  font-size: 12px;
  background: var(--jg-accent-soft);
  border-radius: 8px;
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
  height: 100%;
  min-height: 0;
  color: var(--jg-text);
}

.assistant-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
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
  font-size: 12px;
  color: var(--jg-muted);
}

.assistant-context strong {
  color: var(--jg-accent-text);
}

.assistant-conversation {
  flex: 1;
  min-height: 0;
  padding: 18px;
  overflow-y: auto;
  scrollbar-width: thin;
  background: var(--jg-bg);
  border: 1px solid var(--jg-line);
  border-radius: 16px;
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
  line-height: 1.8;
  color: var(--jg-secondary);
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
  color: var(--jg-secondary);
  text-align: left;
  cursor: pointer;
  background: var(--jg-surface);
  border: 1px solid var(--jg-line);
  border-radius: 8px;
}

.assistant-suggestions button:hover {
  color: var(--jg-accent-text);
  border-color: var(--jg-accent-line);
}

.assistant-suggestions svg {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
}

.assistant-message {
  padding: 18px;
  margin-bottom: 22px;
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
  margin: 0;
  font-size: 14px;
  line-height: 1.9;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.assistant-tool-progress {
  display: grid;
  gap: 7px;
  padding: 0;
  margin: 14px 0 0;
  font-size: 12px;
  color: var(--jg-secondary);
  list-style: none;
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
  color: var(--jg-error);
  overflow-wrap: anywhere;
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
  font-size: 12px;
  color: var(--jg-accent-text);
  white-space: nowrap;
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
  align-items: center;
  justify-content: end;
  margin-top: 12px;
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
  min-width: 420px;
  table-layout: fixed;
  border-collapse: collapse;
}

.assistant-diff-scroll th,
.assistant-diff-scroll td {
  padding: 10px;
  font-size: 12px;
  vertical-align: top;
  text-align: left;
  border: 1px solid var(--jg-line);
}

.assistant-diff-scroll th {
  color: var(--jg-secondary);
  background: var(--jg-subtle);
}

.assistant-diff-scroll th:first-child {
  width: 120px;
}

.assistant-diff-scroll pre {
  max-height: 260px;
  margin: 0;
  overflow: auto;
  font: 12px/1.7 var(--jg-font);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
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
  font-size: 12px;
  color: var(--jg-secondary);
  background: var(--jg-subtle);
  border-radius: 8px;
}

.assistant-error {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin: 12px 0 0;
  color: var(--jg-error);
  background: var(--jg-error-bg);
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
  padding-right: 6px;
  overflow-y: auto;
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
  padding: 12px 14px;
  border: 1px solid var(--jg-line);
  border-radius: 8px;
}

.assistant-scope-details summary {
  font-size: 13px;
  color: var(--jg-secondary);
  cursor: pointer;
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
  min-width: 0;
  padding: 14px;
  margin: 0;
  border: 1px solid var(--jg-line);
  border-radius: 8px;
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
  line-height: 1.8;
  color: var(--jg-muted);
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
  height: 70px;
  margin-left: 40px;
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
