<script setup lang="ts">
import type { FlowStageId } from './application-flow-model';
import type { MailRecord } from './communications';
import type { StoredDocument } from './documents';
import type { AdmissionBatch } from './foundation-types';

import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { App, Button, Checkbox, Input, Modal, Select } from 'ant-design-vue';

import { buildPlannerEvents } from './application-calendar';
import {
  agendaGroups,
  FLOW_FIELDS,
  FLOW_STAGES,
  materialCandidates,
  materialSummary,
  nearestRecordedEvent,
  suggestedFlowStage,
} from './application-flow-model';
import {
  CONTACT_LABELS,
  CONTACT_RESULT_LABELS,
  japanToday,
  normalizedContact,
  primaryProfessor,
} from './application-planning';
import ExplorerIcon from './components/explorer-icon.vue';
import OverviewCalendar from './components/overview-calendar.vue';
import UniversityLogo from './components/university-logo.vue';
import { fileSize, fileUrl } from './documents';
import { useExplorerStore } from './explorer';
import { labContext, labPath } from './lab-targets';
import { localApi } from './local-api';
import { vAccessibleSelect } from './select-accessibility';

import './application-flow-prototype.css';

interface Material {
  id: string;
  title: string;
  complete: boolean;
  notes: string;
  files: StoredDocument[];
  preview?: boolean;
  stage?: FlowStageId;
}
interface Target {
  id: string;
  batch_id: null | string;
  contacts: { professor_id: string; experience_id: string }[];
  materials: Material[];
  mails: MailRecord[];
}
interface Draft {
  id: string;
  subject: string;
  body: string;
  recipient: string;
  files: File[];
  saved: boolean;
}
const store = useExplorerStore();
const route = useRoute();
const router = useRouter();
const { modal } = App.useApp();
const targets = computed(() =>
  store.labs
    .filter((lab) => lab.wantApply)
    .flatMap((lab) => {
      const target = labContext(store, lab.id);
      return target ? [target] : [];
    }),
);
const labId = ref('');
const target = computed(() =>
  targets.value.find((t) => t.lab.id === labId.value),
);
const original = ref<Target>();
const stageDocuments = ref<StoredDocument[]>([]);
const targetRows = ref<{ id: string; batch_id: null | string }[]>([]);
const targetId = ref('');
const batches = ref<AdmissionBatch[]>([]);
const loading = ref(false);
const errorMessage = ref('');
const feedback = ref('');
const materials = ref<Material[]>([]);
const selectedMaterialId = ref('');
const material = computed(
  () =>
    materials.value.find((m) => m.id === selectedMaterialId.value) ||
    materials.value[0],
);
const summary = computed(() => materialSummary(materials.value));
const person = computed(() => {
  const binding = original.value?.contacts[0];
  return (
    target.value?.professors.find((p) => p.id === binding?.professor_id) ||
    (target.value ? primaryProfessor(target.value) : undefined)
  );
});
const contact = computed(() => {
  const binding = original.value?.contacts.find(
    (c) => c.professor_id === person.value?.id,
  );
  const records = [
    person.value?.contact,
    ...(person.value?.contactHistory || []),
  ];
  return normalizedContact(
    records.find((c) => c?.experienceId === binding?.experience_id) ||
      person.value?.contact,
  );
});
const currentStage = ref<FlowStageId>('prepare');
const viewedStage = ref<FlowStageId>('prepare');
const stageChanged = ref(false);
const stageLabel = computed(
  () => FLOW_STAGES.find((s) => s.id === currentStage.value)?.label || '未设置',
);
const viewedLabel = computed(
  () =>
    FLOW_STAGES.find((s) => s.id === viewedStage.value)?.label || '阶段记录',
);
const stageRecords = ref<Record<string, Record<string, string>>>({});
const fields = computed(() => stageRecords.value[viewedStage.value] || {});
const stageEditor = ref(false);
const fieldDraft = ref<Record<string, string>>({});
const screen = ref<'overview' | 'workspace'>(
  route.query.screen === 'overview' ? 'overview' : 'workspace',
);
const tab = ref(
  ['mail', 'timeline'].includes(String(route.query.view))
    ? String(route.query.view)
    : 'stages',
);
const drafts = ref<Draft[]>([]);
const selectedMailId = ref('');
const query = ref('');
const mailFilter = ref('all');
const compose = ref(false);
const aiAction = ref('progress');
const writingRequirements = ref('');
const fileInput = ref<HTMLInputElement>();
const uploadMaterial = ref<HTMLInputElement>();
const materialEditor = ref(false);
const newMaterialTitle = ref('');
const newMaterialNotes = ref('');
const currentDraft = computed(() =>
  drafts.value.find((d) => d.id === selectedMailId.value),
);
const selectedMail = computed(() =>
  original.value?.mails.find((m) => m.id === selectedMailId.value),
);
const batch = computed(() =>
  batches.value.find((b) => b.id === original.value?.batch_id),
);
const batchLabel = computed(() =>
  batch.value
    ? [
        batch.value.admissionYear
          ? `${batch.value.admissionYear}年度`
          : '入学年度未确认',
        batch.value.label,
        batch.value.examType,
      ]
        .filter(Boolean)
        .join(' · ')
    : '未指定招生批次',
);
const candidateSource = computed(
  () =>
    batch.value?.materials || target.value?.major.applicationMaterials || '',
);
const candidates = computed(() => materialCandidates(candidateSource.value));
const events = computed(() => buildPlannerEvents(targets.value, 'all'));
const targetEvents = computed(() =>
  events.value.filter((e) => e.labId === labId.value),
);
const today = japanToday();
const dates = computed(() => {
  const written = nearestRecordedEvent(
    targetEvents.value,
    ['written', 'exam'],
    today,
  );
  const interview = nearestRecordedEvent(
    targetEvents.value,
    ['interview'],
    today,
  );
  return [
    {
      label: batch.value ? '考试日期' : '笔试 / 考试',
      value: batch.value?.examDate || (batch.value ? '' : written?.start),
      source: batch.value ? '所选批次' : written?.title || '暂无记录',
    },
    {
      label: '入试面试',
      value:
        batch.value?.interviewDate || (batch.value ? '' : interview?.start),
      source: batch.value ? '所选批次' : interview?.title || '暂无记录',
    },
  ];
});
const visibleEvents = computed(() =>
  [...events.value].toSorted((a, b) => a.start.localeCompare(b.start)),
);
const nextEvents = computed(() => {
  const agenda = visibleEvents.value.filter((event) => event.kind !== 'task');
  const upcoming = agenda.filter(
    (event) => event.end >= today && !event.complete,
  );
  return agendaGroups(
    upcoming.length > 0 ? upcoming : agenda.toReversed(),
  ).slice(0, 5);
});
const mailbox = computed(() =>
  [
    ...drafts.value.map((d) => ({
      id: d.id,
      subject: d.subject || '无主题草稿',
      preview: d.body || '尚未填写正文',
      date: '本地草稿',
      direction: 'draft',
      sender: '我',
    })),
    ...(original.value?.mails || []).map((m) => ({
      id: m.id,
      subject: m.subject || '无主题',
      preview: m.body,
      date: m.date,
      direction: m.direction,
      sender: m.sender || m.address || person.value?.name || '未知发件人',
    })),
  ].filter(
    (m) =>
      (mailFilter.value === 'all' || m.direction === mailFilter.value) &&
      `${m.subject} ${m.preview} ${m.sender}`
        .toLowerCase()
        .includes(query.value.toLowerCase()),
  ),
);
let generation = 0;
watch(
  targets,
  (rows) => {
    if (!rows.some((t) => t.lab.id === labId.value))
      labId.value = rows[0]?.lab.id || '';
  },
  { immediate: true },
);
watch(
  labId,
  async (id) => {
    const sequence = ++generation;
    original.value = undefined;
    stageDocuments.value = [];
    materials.value = [];
    drafts.value = [];
    selectedMailId.value = '';
    targetRows.value = [];
    targetId.value = '';
    stageChanged.value = false;
    if (!id) return;
    loading.value = true;
    errorMessage.value = '';
    try {
      const t = targets.value.find((t) => t.lab.id === id);
      if (!t) return;
      const [rows, bs] = await Promise.all([
        localApi<{ id: string; batch_id: null | string }[]>(
          `/applications/labs/${id}`,
        ),
        localApi<AdmissionBatch[]>(`/foundation/majors/${t.major.id}/batches`),
      ]);
      if (sequence !== generation) return;
      targetRows.value = rows;
      batches.value = bs;
      targetId.value = rows[0]?.id || '';
      await readTarget(sequence);
    } catch (error) {
      if (sequence === generation)
        errorMessage.value =
          error instanceof Error ? error.message : '资料读取失败';
    } finally {
      if (sequence === generation) loading.value = false;
    }
  },
  { immediate: true },
);
async function readTarget(sequence = generation) {
  if (!targetId.value) return;
  const state = await localApi<Target>(`/applications/${targetId.value}`);
  if (sequence !== generation) return;
  original.value = state;
  materials.value = structuredClone(state.materials);
  selectedMaterialId.value = materials.value[0]?.id || '';
  const values = Object.fromEntries(
    Object.entries(contact.value).filter(
      ([, value]) => typeof value === 'string',
    ),
  ) as Record<string, string>;
  values.finalResult =
    contact.value.finalResult === 'pending'
      ? ''
      : CONTACT_RESULT_LABELS[contact.value.finalResult];
  stageRecords.value = Object.fromEntries(
    FLOW_STAGES.map((stage) => [stage.id, { ...values }]),
  );
  currentStage.value = suggestedFlowStage(contact.value);
  viewedStage.value = currentStage.value;
  selectedMailId.value = state.mails.at(-1)?.id || '';
  if (person.value) {
    const library = await localApi<{ documents: StoredDocument[] }>(
      `/experience-library?professorIds=${person.value.id}`,
    );
    if (sequence === generation)
      stageDocuments.value = library.documents.filter(
        (d) =>
          d.kind === 'consent' && d.experienceId === contact.value.experienceId,
      );
  }
}
async function chooseTarget() {
  drafts.value = [];
  compose.value = false;
  selectedMailId.value = '';
  stageChanged.value = false;
  loading.value = true;
  errorMessage.value = '';
  try {
    await readTarget();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '读取失败';
  } finally {
    loading.value = false;
  }
}
function setTab(value: string) {
  tab.value = value;
  screen.value = 'workspace';
  void router.replace({ query: { ...route.query, view: value } });
}
function setCurrent() {
  currentStage.value = viewedStage.value;
  stageChanged.value = true;
  feedback.value = '已更新原型阶段；总览视图同步，正式数据未更改。';
}
function editStage() {
  fieldDraft.value = { ...fields.value };
  stageEditor.value = true;
}
function saveStage() {
  stageRecords.value[viewedStage.value] = { ...fieldDraft.value };
  stageEditor.value = false;
  feedback.value = '阶段记录仅保留在本次原型中，切换阶段不会丢失，刷新后重置。';
}
function previewImport() {
  modal.confirm({
    title: '预览材料清单',
    content:
      '将已有招生材料原文放入本页原型。它们尚未采纳到申请目标，适用批次仍需核对；正式数据不会写入。',
    okText: '仅加入原型',
    cancelText: '取消',
    onOk() {
      for (const title of candidates.value) {
        if (!materials.value.some((m) => m.title === title))
          materials.value.push({
            id: crypto.randomUUID(),
            title,
            complete: false,
            notes: '来自已存材料要求，范围待核对；原型条目。',
            files: [],
            preview: true,
          });
      }
      selectedMaterialId.value = materials.value[0]?.id || '';
      feedback.value = '已预览已有要求，尚未导入正式材料清单。';
    },
  });
}
function addMaterial() {
  if (!newMaterialTitle.value.trim()) return;
  const item = {
    id: crypto.randomUUID(),
    title: newMaterialTitle.value.trim(),
    notes: newMaterialNotes.value,
    complete: false,
    files: [],
    preview: true,
    stage: viewedStage.value,
  };
  materials.value.push(item);
  selectedMaterialId.value = item.id;
  materialEditor.value = false;
  newMaterialTitle.value = '';
  newMaterialNotes.value = '';
}
function addMaterialFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  if (!material.value) return;
  for (const file of input.files || []) {
    material.value.files.push({
      id: `preview-${crypto.randomUUID()}`,
      ownerType: 'workspace',
      ownerId: '',
      kind: 'other',
      year: 0,
      title: file.name,
      filename: file.name,
      path: '',
      size: file.size,
      questionId: '',
      notes: '仅原型文件名，未上传',
      authors: '',
      venue: '',
      createdAt: new Date().toISOString(),
    });
  }
  input.value = '';
  feedback.value = '仅在原型中显示文件名，未上传；材料完成状态保持独立。';
}
function newDraft() {
  const d = {
    id: crypto.randomUUID(),
    subject: '',
    body: '',
    recipient: person.value?.email || '',
    files: [],
    saved: false,
  };
  drafts.value.unshift(d);
  selectedMailId.value = d.id;
  compose.value = true;
  mailFilter.value = 'all';
  query.value = '';
}
function saveDraft() {
  if (currentDraft.value) {
    currentDraft.value.saved = true;
    compose.value = false;
    feedback.value = '草稿仅保存到本页原型，未进入邮件数据库，也未发送。';
  }
}
function deleteMail() {
  if (!selectedMailId.value) return;
  modal.confirm({
    title: '从原型移除这封邮件？',
    content: '只影响当前演示，不删除正式邮件和附件。',
    okText: '从原型移除',
    cancelText: '取消',
    onOk() {
      drafts.value = drafts.value.filter((d) => d.id !== selectedMailId.value);
      if (original.value)
        original.value = {
          ...original.value,
          mails: original.value.mails.filter(
            (m) => m.id !== selectedMailId.value,
          ),
        };
      selectedMailId.value = mailbox.value[0]?.id || '';
    },
  });
}
function attachMail(event: Event) {
  const input = event.target as HTMLInputElement;
  if (currentDraft.value) currentDraft.value.files.push(...(input.files || []));
  input.value = '';
}
function previewAiDraft() {
  newDraft();
  aiAction.value = 'draft';
  feedback.value =
    '已打开一封独立空白草稿。原型不调用 AI，写作要求保留在右侧；正式版会在此放入可修改的代笔结果。';
}
function stageValue(key: string) {
  return fields.value[key] || '未填写';
}
</script>

<template>
  <section class="flow-prototype juai-design">
    <div class="flow-preview-strip">
      <span><ExplorerIcon name="grid" />交互原型
        <b>仅本页演示，不保存正式数据</b></span>
      <div>
        <button
          :class="{ 'is-active': screen === 'overview' }"
          :aria-pressed="screen === 'overview'"
          @click="screen = 'overview'"
        >
          总览视图
</button><button
          :class="{ 'is-active': screen === 'workspace' }"
          :aria-pressed="screen === 'workspace'"
          @click="screen = 'workspace'"
        >
          申请工作台
        </button>
      </div>
    </div>
    <p v-if="errorMessage" role="alert" class="flow-alert">
      {{ errorMessage }}
    </p>
    <p v-if="loading" role="status" class="flow-feedback">
      正在读取工作区副本…
    </p>
    <template v-if="target">
      <header class="flow-heading">
        <div>
          <p class="flow-eyebrow">
            {{
              screen === 'overview'
                ? '修考之路 · 进度摘要'
                : `${target.university.name} / ${target.major.name}`
            }}
          </p>
          <h1>{{ screen === 'overview' ? '申请总览' : target.lab.name }}</h1>
          <p v-if="screen === 'workspace'" class="flow-heading-context">
            {{ person?.name || '教师未确认' }} <span>·</span> {{ stageLabel }}
            <span>·</span>
            {{
              summary.total
                ? `材料 ${summary.complete} / ${summary.total} 项完成`
                : '材料清单待建立'
            }}
          </p>
          <p v-else class="flow-heading-context">
            同一份阶段、材料与日程，只保留此刻需要关注的信息。
          </p>
        </div>
        <RouterLink :to="labPath(target)" class="flow-text-action">
          研究室资料 <ExplorerIcon name="link" />
        </RouterLink>
      </header>
      <p v-if="feedback" class="flow-feedback" role="status">
        {{ feedback
        }}<button aria-label="关闭提示" @click="feedback = ''">×</button>
      </p>
      <template v-if="screen === 'overview'">
        <div class="flow-overview-grid">
          <section class="flow-overview-main">
            <header class="flow-section-heading">
              <h2>我的申请目标</h2>
              <span>{{ targets.length }} 个研究室</span>
            </header>
            <article class="flow-overview-target">
              <div class="flow-target-identity">
                <UniversityLogo
                  :name="target.university.name"
                  :catalog-id="target.university.catalogId"
                  :logo-id="target.university.logoId"
                />
                <div>
                  <h3>{{ target.lab.name }}</h3>
                  <p>
                    {{ target.university.name }} ·
                    {{ person?.name || '教师未确认' }}
                  </p>
                </div>
                <span class="flow-state-label">{{ stageLabel }}</span>
              </div>
              <div class="flow-summary-axis">
                <span
                  v-for="stage in FLOW_STAGES"
                  :key="stage.id"
                  :class="{ 'is-active': stage.id === currentStage }"
                  >{{ stage.label }}</span>
              </div>
              <div class="flow-overview-bottom">
                <div v-if="summary.total">
                  <strong>{{ summary.pending }}</strong> 项材料待准备
                  <span>·</span> {{ summary.withoutFiles }} 项尚无文件
                </div>
                <div v-else>材料清单尚未建立</div>
                <button class="flow-text-action" @click="setTab('stages')">
                  继续准备 <ExplorerIcon name="arrow" />
                </button>
              </div>
              <p v-if="!summary.total" class="flow-muted">
                尚未建立材料清单，不能把空清单视为已经准备完成。
              </p>
              <div
                v-if="materials.some((m) => !m.complete)"
                class="flow-missing-list"
              >
                <span
                  v-for="m in materials.filter((m) => !m.complete).slice(0, 4)"
                  :key="m.id"
                  >{{ m.title }}</span>
              </div>
            </article>
            <p class="flow-source-note">
              本页阶段与材料直接来自原型工作台，修改后同步展示，不另算一套进度。
            </p>
          </section>
          <section class="flow-overview-dates">
            <header class="flow-section-heading">
              <h2>笔试与入试面试</h2>
              <button class="flow-text-action" @click="setTab('timeline')">
                全部日程 <ExplorerIcon name="arrow" />
              </button>
            </header>
            <div v-for="d in dates" :key="d.label" class="flow-date-entry">
              <span>{{ d.label }}</span><strong>{{ d.value || '未确认' }}</strong><small>{{ d.value && d.value < today ? '日期已过 · ' : ''
                }}{{ d.source }}</small>
            </div>
            <p class="flow-source-note">
              {{
                batch
                  ? '来自所选招生批次'
                  : '目标未关联批次，展示既有时间线记录，适用范围仍需核对。'
              }}
            </p>
          </section>
        </div>
        <section class="flow-overview-schedule">
          <header class="flow-section-heading">
            <h2>近期日程</h2>
            <button class="flow-text-action" @click="setTab('timeline')">
              日程与时间线 <ExplorerIcon name="arrow" />
            </button>
          </header>
          <div v-if="nextEvents.length" class="flow-event-list">
            <article v-for="event in nextEvents" :key="event.id">
              <time>{{ event.start }}</time>
              <div>
                <strong>{{ event.title }}</strong>
                <p>{{ event.universityName }} · {{ event.labName }}</p>
              </div>
              <span>{{ event.end < today ? '日期已过' : '待到来'
                }}{{
                  event.sourceIds.length > 1
                    ? ` · ${event.sourceIds.length}条同日记录`
                    : ''
                }}</span>
            </article>
          </div>
          <p v-else class="flow-empty-copy">
            当前没有已记录的日程，未知日期不自动推算。
          </p>
        </section>
      </template>
      <template v-else>
        <div class="flow-context-row">
          <section class="flow-target-selector">
            <div class="flow-section-heading">
              <h2>申请目标</h2>
              <span class="flow-muted">{{
                batch?.scope || '招生范围未确认'
              }}</span>
            </div>
            <div class="flow-target-controls">
              <Select
                v-accessible-select
                v-model:value="labId"
                :options="
                  targets.map((t) => ({
                    value: t.lab.id,
                    label: `${t.university.name} · ${t.lab.name}`,
                  }))
                "
                aria-label="选择研究室目标"
              /><Select
                v-accessible-select
                v-if="targetRows.length > 1"
                v-model:value="targetId"
                :options="
                  targetRows.map((t) => ({
                    value: t.id,
                    label:
                      batches.find((b) => b.id === t.batch_id)?.label ||
                      '未指定批次',
                  }))
                "
                aria-label="选择申请批次目标"
                @change="chooseTarget"
              /><span v-else class="flow-batch-label">{{ batchLabel }}</span>
            </div>
          </section>
          <section class="flow-date-summary">
            <div v-for="d in dates" :key="d.label">
              <span>{{ d.label }}</span><strong>{{ d.value || '未确认' }}</strong><small>{{ d.value && d.value < today ? '已过 · ' : ''
                }}{{ batch ? '批次记录' : '原时间线 · 批次待确认' }}</small>
            </div>
            <button
              class="flow-date-link"
              aria-label="查看完整日程与来源"
              @click="setTab('timeline')"
            >
              <ExplorerIcon name="calendar" />
            </button>
          </section>
        </div>
        <nav class="flow-tabs" aria-label="申请工作台分区">
          <button
            v-for="item in [
              { id: 'stages', label: '阶段与材料', icon: 'folder' },
              { id: 'mail', label: '教授邮件', icon: 'mail' },
              { id: 'timeline', label: '日程与时间线', icon: 'calendar' },
            ]"
            :key="item.id"
            :class="{ 'is-active': tab === item.id }"
            :aria-current="tab === item.id ? 'page' : undefined"
            @click="setTab(item.id)"
          >
            <ExplorerIcon :name="item.icon" />{{ item.label
            }}<span v-if="item.id === 'mail'">{{
              (original?.mails.length || 0) + drafts.length
            }}</span>
          </button>
        </nav>
        <div v-if="tab === 'stages'" class="flow-stage-layout">
          <aside class="flow-stage-rail">
            <h2>申请阶段</h2>
            <p>手动切换，记录分别保留</p>
            <ol>
              <li v-for="(stage, index) in FLOW_STAGES" :key="stage.id">
                <button
                  :class="{ 'is-active': viewedStage === stage.id }"
                  :aria-pressed="viewedStage === stage.id"
                  @click="viewedStage = stage.id"
                >
                  <span class="flow-stage-number">{{ index + 1 }}</span><span><strong>{{ stage.label }}</strong><small>{{ stage.hint }}</small></span><b v-if="stage.id === currentStage">当前</b>
                </button>
              </li>
            </ol>
            <div class="flow-legacy-note">
              <span>原教授联络记录</span><strong>{{ CONTACT_LABELS[contact.status] }}</strong>
              <p>
                {{
                  stageChanged
                    ? '当前阶段已在原型中手动调整。'
                    : '初始阶段参考此记录展示，正式接入前需确认。'
                }}
              </p>
            </div>
          </aside>
          <div class="flow-stage-main">
            <section class="flow-stage-record">
              <header class="flow-section-heading">
                <div>
                  <h2>
                    {{ viewedLabel }}
                    <span
                      v-if="viewedStage === currentStage"
                      class="flow-current-tag"
                      >当前阶段</span>
                  </h2>
                </div>
                <div class="flow-inline-actions">
                  <Button
                    v-if="viewedStage !== currentStage"
                    @click="setCurrent"
                  >
                    设为当前阶段
</Button><Button @click="editStage">
                    <ExplorerIcon name="edit" />编辑阶段记录
                  </Button>
                </div>
              </header>
              <dl class="flow-stage-values">
                <div
                  v-for="field in FLOW_FIELDS[viewedStage].slice(0, 2)"
                  :key="field.key"
                  :class="{ 'is-long': field.type === 'textarea' }"
                >
                  <dt>{{ field.label }}</dt>
                  <dd :class="{ 'is-empty': !fields[field.key] }">
                    {{ stageValue(field.key) }}
                  </dd>
                </div>
              </dl>
              <details
                v-if="FLOW_FIELDS[viewedStage].length > 2"
                class="flow-stage-more"
              >
                <summary>查看原文与补充记录</summary>
                <dl class="flow-stage-values">
                  <div
                    v-for="field in FLOW_FIELDS[viewedStage].slice(2)"
                    :key="field.key"
                  >
                    <dt>{{ field.label }}</dt>
                    <dd :class="{ 'is-empty': !fields[field.key] }">
                      {{ stageValue(field.key) }}
                    </dd>
                  </div>
                </dl>
              </details>
              <div
                v-if="viewedStage === 'consent'"
                class="flow-stage-documents"
              >
                <span><ExplorerIcon name="folder" />内诺文件</span>
                <a
                  v-for="file in stageDocuments"
                  :key="file.id"
                  :href="fileUrl(file.id)"
                  target="_blank"
                  rel="noreferrer"
                  >{{ file.title }}</a>
                <small v-if="!stageDocuments.length">暂无签署文件</small>
                <button
                  class="flow-text-action"
                  @click="
                    newMaterialTitle = '内诺文件';
                    newMaterialNotes = '内诺确认阶段的签署文件或待签署版本';
                    materialEditor = true;
                  "
                >
                  添加到阶段材料 <ExplorerIcon name="plus" />
                </button>
              </div>
            </section>
            <section class="flow-materials">
              <header class="flow-section-heading">
                <div>
                  <h2>申请材料</h2>
                  <p>
                    {{
                      summary.total
                        ? `${summary.complete} / ${summary.total} 项完成 · ${summary.pending} 项待准备`
                        : '尚未建立清单'
                    }}
                  </p>
                </div>
                <div class="flow-inline-actions">
                  <Button v-if="candidates.length" @click="previewImport">
                    预览导入要求
</Button><Button type="primary" @click="materialEditor = true">
                    <ExplorerIcon name="plus" />新增材料
                  </Button>
                </div>
              </header>
              <div class="flow-material-columns">
                <div class="flow-material-list">
                  <template v-if="materials.length">
                    <article
                      v-for="m in materials"
                      :key="m.id"
                      :class="{ 'is-selected': material?.id === m.id }"
                    >
                      <Checkbox
                        v-model:checked="m.complete"
                        :aria-label="`完成材料：${m.title}`"
                      /><button @click="selectedMaterialId = m.id">
                        <strong>{{ m.title }}</strong><small>{{ m.preview ? '原型草稿 · ' : ''
                          }}{{
                            m.files.length
                              ? `${m.files.length} 个文件`
                              : '尚无文件'
                          }}{{ m.complete ? ' · 已勾选完成' : '' }}</small>
                      </button>
                    </article>
                  </template>
                  <div v-else class="flow-material-empty">
                    <ExplorerIcon name="folder" />
                    <h3>先建立这个目标的材料清单</h3>
                    <p>
                      现有目标尚无材料。可预览已存要求，或手动增加；不会自动当作已完成。
                    </p>
                    <Button v-if="candidates.length" @click="previewImport">
                      预览 {{ candidates.length }} 条材料要求
                    </Button>
                  </div>
                </div>
                <div class="flow-material-detail">
                  <template v-if="material">
                    <div class="flow-file-heading">
                      <h3>{{ material.title }}</h3>
                      <span>{{
                        material.complete ? '已标记完成' : '准备中'
                      }}</span>
                    </div>
                    <p v-if="material.notes" class="flow-source-note">
                      {{ material.notes }}
                    </p>
                    <button
                      class="flow-upload-area"
                      @click="uploadMaterial?.click()"
                    >
                      <ExplorerIcon name="upload" /><strong>选择本地文件</strong><span>原型仅展示文件名，不上传。上传与完成独立管理。</span>
</button><input
                      ref="uploadMaterial"
                      type="file"
                      multiple
                      hidden
                      @change="addMaterialFiles"
                    />
                    <div
                      v-for="file in material.files"
                      :key="file.id"
                      class="flow-file-row"
                    >
                      <ExplorerIcon name="book" />
                      <div>
                        <strong>{{ file.filename }}</strong><small>{{ fileSize(file.size)
                          }}{{
                            file.id.startsWith('preview-')
                              ? ' · 未上传的演示文件'
                              : ''
                          }}</small>
                      </div>
                      <a
                        v-if="!file.id.startsWith('preview-')"
                        :href="fileUrl(file.id)"
                        target="_blank"
                        rel="noreferrer"
                        >查看</a>
                    </div>
                    <p v-if="!material.files.length" class="flow-empty-copy">
                      暂无关联文件
                    </p>
</template><template v-else>
                    <div class="flow-detail-placeholder">
                      <ExplorerIcon name="book" />
                      <h3>材料、文件与完成情况，在这里集中处理</h3>
                      <p>从左侧选择材料，即可查看文件并独立管理完成状态。</p>
                    </div>
                    <details
                      v-if="candidateSource"
                      class="flow-original-requirements"
                    >
                      <summary>查看已记录的材料要求 · 范围待核对</summary>
                      <p>{{ candidateSource }}</p>
                    </details>
                  </template>
                </div>
              </div>
            </section>
          </div>
        </div>
        <div v-else-if="tab === 'mail'" class="flow-mail-workspace">
          <aside class="flow-mail-sidebar">
            <header>
              <h2>
                目标邮件
                <span>{{ (original?.mails.length || 0) + drafts.length }}</span>
              </h2>
              <Button type="primary" @click="newDraft">
                <ExplorerIcon name="plus" />新建邮件
              </Button>
            </header>
            <Input
              v-model:value="query"
              placeholder="搜索主题、正文、发件人"
              aria-label="搜索邮件"
            >
              <template #prefix><ExplorerIcon name="search" /></template>
            </Input>
            <div class="flow-mail-filters">
              <button
                v-for="f in [
                  { id: 'all', label: '全部' },
                  { id: 'received', label: '收到' },
                  { id: 'sent', label: '已发' },
                  { id: 'draft', label: '草稿' },
                ]"
                :key="f.id"
                :class="{ 'is-active': mailFilter === f.id }"
                @click="mailFilter = f.id"
              >
                {{ f.label }}
              </button>
            </div>
            <div class="flow-mail-list">
              <button
                v-for="m in mailbox"
                :key="m.id"
                :class="{ 'is-selected': selectedMailId === m.id }"
                @click="
                  selectedMailId = m.id;
                  compose = false;
                "
              >
                <span><b>{{ m.sender }}</b><small>{{
                    m.direction === 'draft' ? '草稿' : m.date.slice(0, 10)
                  }}</small></span><strong>{{ m.subject }}</strong>
                <p>{{ m.preview }}</p>
              </button>
              <div v-if="!mailbox.length" class="flow-mail-empty">
                <ExplorerIcon name="mail" />
                <h3>{{ query ? '没有匹配的邮件' : '这个目标还没有邮件' }}</h3>
                <p>
                  {{
                    query
                      ? '换一个关键词试试。'
                      : '新建邮件或手动录入往来。原型草稿不会被当作已发邮件。'
                  }}
                </p>
              </div>
            </div>
            <footer>仅本申请目标及关联经历的邮件</footer>
          </aside>
          <section class="flow-mail-reader">
            <template v-if="currentDraft || selectedMail">
              <header class="flow-reader-heading">
                <div>
                  <span class="flow-eyebrow">{{
                    currentDraft
                      ? '未发送 · 原型草稿'
                      : selectedMail?.direction === 'received'
                        ? '收到的邮件'
                        : '已发送记录'
                  }}</span>
                  <h2>
                    {{
                      currentDraft?.subject || selectedMail?.subject || '新邮件'
                    }}
                  </h2>
                </div>
                <div class="flow-inline-actions">
                  <Button
                    v-if="currentDraft && !compose"
                    @click="compose = true"
                  >
                    编辑
</Button><Button
                    type="text"
                    aria-label="删除当前邮件"
                    @click="deleteMail"
                  >
                    <ExplorerIcon name="trash" />
                  </Button>
                </div>
              </header>
              <template v-if="currentDraft && compose">
                <div class="flow-compose-fields">
                  <label>收件人<Input
                      v-model:value="currentDraft.recipient"
                      placeholder="教授邮箱"
/></label><label>主题<Input
                      v-model:value="currentDraft.subject"
                      placeholder="填写邮件主题"
                  /></label>
                </div>
                <Input.TextArea
                  v-model:value="currentDraft.body"
                  class="flow-compose-body"
                  placeholder="在这里撰写邮件。正式版的 AI 代笔结果也会作为独立草稿放在这里，供你修改。"
                  :auto-size="{ minRows: 12, maxRows: 20 }"
                  aria-label="邮件正文"
                />
                <div class="flow-compose-actions">
                  <span>仅原型草稿，不会发送</span><Button type="primary" @click="saveDraft">
                    保存到原型草稿
                  </Button>
                </div>
</template><template v-else>
                <dl class="flow-mail-meta">
                  <div>
                    <dt>发件人</dt>
                    <dd>
                      {{
                        selectedMail?.sender ||
                        selectedMail?.address ||
                        (currentDraft ? '我（未发送）' : '未填写')
                      }}
                    </dd>
                  </div>
                  <div>
                    <dt>收件人</dt>
                    <dd>
                      {{
                        currentDraft?.recipient ||
                        selectedMail?.recipient ||
                        person?.email ||
                        '未填写'
                      }}
                    </dd>
                  </div>
                  <div>
                    <dt>时间</dt>
                    <dd>{{ selectedMail?.date || '本页原型草稿' }}</dd>
                  </div>
                </dl>
                <div class="flow-mail-body">
                  {{
                    currentDraft?.body || selectedMail?.body || '正文尚未填写'
                  }}
                </div>
              </template>
              <section class="flow-mail-attachments">
                <header class="flow-section-heading">
                  <h3>
                    邮件附件 <span>{{ currentDraft?.files.length || 0 }}</span>
                  </h3>
                  <Button v-if="currentDraft" @click="fileInput?.click()">
                    添加附件
                  </Button>
                </header>
                <input
                  ref="fileInput"
                  type="file"
                  multiple
                  hidden
                  @change="attachMail"
                />
                <div
                  v-for="(file, index) in currentDraft?.files || []"
                  :key="index"
                  class="flow-file-row"
                >
                  <ExplorerIcon name="book" />
                  <div>
                    <strong>{{ file.name }}</strong><small>{{ fileSize(file.size) }} · 本地待上传</small>
                  </div>
                  <button @click="currentDraft?.files.splice(index, 1)">
                    移除
                  </button>
                </div>
                <p v-if="!currentDraft?.files.length" class="flow-muted">
                  暂无关联附件。正式版将复用统一文件存储，附件随邮件独立关联。
                </p>
              </section>
            </template>
            <div v-else class="flow-reader-empty">
              <ExplorerIcon name="mail" />
              <h2>从一封邮件，开始管理联络</h2>
              <p>左侧选择来往邮件，在这里阅读正文与附件。</p>
              <Button @click="newDraft">新建一封草稿</Button>
            </div>
          </section>
          <aside class="flow-ai-panel">
            <header>
              <span class="flow-ai-symbol"><ExplorerIcon name="chat" /></span>
              <div>
                <h2>AI 工作台</h2>
                <p>围绕本目标的邮件与材料</p>
              </div>
            </header>
            <div class="flow-ai-actions">
              <button
                v-for="action in [
                  { id: 'progress', label: '总结当前进展' },
                  { id: 'ideas', label: '下一封写作思路' },
                  { id: 'draft', label: 'AI 代笔写信' },
                ]"
                :key="action.id"
                :class="{ 'is-active': aiAction === action.id }"
                @click="aiAction = action.id"
              >
                {{ action.label }}<ExplorerIcon name="chevron" />
              </button>
            </div>
            <div class="flow-ai-scope">
              <h3>本次可用的上下文</h3>
              <p>
                <span>申请阶段</span><strong>{{ stageLabel }}</strong>
              </p>
              <p>
                <span>已关联邮件</span><strong>{{ original?.mails.length || 0 }} 封</strong>
              </p>
              <p>
                <span>待准备材料</span><strong>{{
                  summary.total ? `${summary.pending} 项` : '清单未建立'
                }}</strong>
              </p>
            </div>
            <template v-if="aiAction === 'draft'">
              <label class="flow-writing-request">希望这封信表达什么？<Input.TextArea
                  v-model:value="writingRequirements"
                  :auto-size="{ minRows: 4, maxRows: 8 }"
                  placeholder="例如：确认内诺文件的签署方式，并询问后续出愿安排。"
/></label><Button block type="primary" @click="previewAiDraft">
                查看新邮件草稿流程
              </Button>
              <p class="flow-ai-boundary">
                原型不调用 AI。此处会打开独立空白草稿；正式接入后由 AI
                起草，供你修改确认。
              </p>
</template><template v-else>
              <div class="flow-ai-placeholder">
                <ExplorerIcon name="book" />
                <h3>
                  {{
                    aiAction === 'progress'
                      ? '从真实来往中梳理进展'
                      : '先确定下一封信的目的'
                  }}
                </h3>
                <p>
                  {{
                    aiAction === 'progress'
                      ? '正式版将区分教授明确表达的内容、待确认事项和下一步建议。'
                      : '正式版将结合已选邮件、当前阶段与用户要求提出写作思路，不推测教授承诺。'
                  }}
                </p>
                <span>原型不调用模型，不展示虚构的 AI 结果</span>
              </div>
            </template>
            <div class="flow-attachment-advice">
              <h3>随信附件</h3>
              <p>
                代笔结果旁会给出待核对的附件建议，并可从申请材料中选择文件。
              </p>
              <span
                v-for="m in materials.filter((m) => m.files.length).slice(0, 3)"
                :key="m.id"
                ><ExplorerIcon name="folder" />{{ m.title }} ·
                {{ m.files.length }} 个文件</span><small v-if="!materials.some((m) => m.files.length)">当前材料清单暂无可复用文件</small><button class="flow-text-action" @click="setTab('stages')">
                查看阶段与材料 <ExplorerIcon name="arrow" />
              </button>
            </div>
          </aside>
        </div>
        <section v-else class="flow-timeline-page">
          <header class="flow-section-heading">
            <div>
              <h2>日程与时间线</h2>
              <p>保留既有考试、教授面谈及跟进记录；总览读取相同来源。</p>
            </div>
            <RouterLink
              to="/japan-grad/journey?view=timeline"
              class="flow-text-action"
            >
              查看原时间线 <ExplorerIcon name="link" />
            </RouterLink>
          </header>
          <div class="flow-schedule-layout">
            <OverviewCalendar
              :events="targetEvents"
              :today="today"
              @todo="
                feedback = '日程原型为只读展示；正式日程编辑与原时间线保留。'
              "
            />
            <div class="flow-event-list">
              <article v-for="event in targetEvents" :key="event.id">
                <time>{{ event.start }}</time>
                <div>
                  <strong>{{ event.title }}</strong>
                  <p>{{ event.details || '已有时间线记录' }}</p>
                </div>
                <span>{{ event.end < today ? '已过' : '已记录' }}</span>
              </article>
              <p v-if="!targetEvents.length" class="flow-empty-copy">
                暂无已记录日程
              </p>
            </div>
          </div>
        </section>
      </template>
    </template>
    <div v-else-if="store.loaded && !loading" class="flow-no-target">
      <h1>申请工作流原型</h1>
      <p>当前工作区没有想考研究室，原型不会填充虚构目标。</p>
    </div>
    <Modal
      v-model:open="stageEditor"
      :title="`${viewedLabel} · 编辑阶段记录`"
      ok-text="应用到原型"
      cancel-text="取消"
      @ok="saveStage"
    >
      <p class="flow-modal-note">
        仅更新原型，不写入正式记录；切换阶段后仍保留本次输入。
      </p>
      <div class="flow-stage-form">
        <label v-for="field in FLOW_FIELDS[viewedStage]" :key="field.key">{{ field.label
          }}<Input.TextArea
            v-if="field.type === 'textarea'"
            v-model:value="fieldDraft[field.key]"
            :auto-size="{ minRows: 3, maxRows: 8 }"
/><Input
            v-else
            v-model:value="fieldDraft[field.key]"
            :type="field.type === 'date' ? 'date' : 'text'"
        /></label>
      </div>
    </Modal>
    <Modal
      v-model:open="materialEditor"
      title="新增原型材料"
      ok-text="加入原型清单"
      cancel-text="取消"
      :ok-button-props="{ disabled: !newMaterialTitle.trim() }"
      @ok="addMaterial"
    >
      <div class="flow-stage-form">
        <label>材料名称<Input
            v-model:value="newMaterialTitle"
            placeholder="填写真实需要准备的材料"
/></label><label>补充说明<Input.TextArea
            v-model:value="newMaterialNotes"
            :auto-size="{ minRows: 3, maxRows: 6 }"
        /></label>
      </div>
    </Modal>
  </section>
</template>
