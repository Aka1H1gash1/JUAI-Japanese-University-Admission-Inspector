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
import { jsonOptions, localApi } from './local-api';
import { vAccessibleSelect } from './select-accessibility';

import './application-flow-prototype.css';

const props = withDefaults(defineProps<{ formal?: boolean }>(), {
  formal: false,
});
interface Material {
  version?: number;
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
  savedMailId?: string;
  version: number;
  workflow?: Workflow;
  batch_id: null | string;
  contacts: { professor_id: string; experience_id: string }[];
  materials: Material[];
  mails: (MailRecord & { documents?: StoredDocument[]; recordHash?: string })[];
}
interface Draft {
  id: string;
  subject: string;
  body: string;
  recipient: string;
  files: File[];
  sender?: string;
  saved: boolean;
  version?: number;
  documents?: StoredDocument[];
}
const store = useExplorerStore();
const route = useRoute();
const router = useRouter();
const { modal } = App.useApp();
const newBatchId = ref<string>();
const existingMails = ref<MailRecord[]>([]);
const existingMailId = ref<string>();
async function openTarget(batchId?: string) {
  await action(async () => {
    const state = await localApi<Target>(
      `/applications/labs/${labId.value}`,
      jsonOptions('POST', { batchId }),
    );
    targetRows.value = await localApi(`/applications/labs/${labId.value}`);
    targetId.value = state.id;
    void router.replace({ query: { ...route.query, target: state.id } });
    await readTarget();
  });
}
async function findExistingMails() {
  await action(async () => {
    const records = await Promise.all(
      (original.value?.contacts ?? []).map((contact) =>
        localApi<MailRecord[]>(`/messages?professorId=${contact.professor_id}`),
      ),
    );
    existingMails.value = records
      .flat()
      .filter(
        (mail) =>
          original.value?.contacts.some(
            (contact) =>
              contact.professor_id === mail.professorId &&
              contact.experience_id === mail.experienceId,
          ) && !original.value?.mails.some((record) => record.id === mail.id),
      );
    if (existingMails.value.length === 0)
      feedback.value = '当前关联经历没有可导入的其他邮件。';
  });
}
async function linkExistingMail() {
  if (!existingMailId.value) return;
  await action(async () => {
    original.value = await localApi<Target>(
      `/applications/${targetId.value}/mail`,
      jsonOptions('POST', { messageId: existingMailId.value }),
    );
    selectedMailId.value = existingMailId.value || '';
    existingMails.value = existingMails.value.filter(
      (mail) => mail.id !== existingMailId.value,
    );
    existingMailId.value = undefined;
  });
}
const selectedTeacher = ref('');
const selectedExperience = ref('');
const teacherExperiences = computed(() => {
  const teacher = target.value?.professors.find(
    (item) => item.id === selectedTeacher.value,
  );
  return [teacher?.contact, ...(teacher?.contactHistory ?? [])].filter(
    (item) => !!item?.experienceId,
  );
});
async function bindExperience() {
  if (!original.value || !selectedTeacher.value || !selectedExperience.value)
    return;
  await action(async () => {
    await localApi(
      `/applications/${targetId.value}/contacts`,
      jsonOptions('POST', {
        version: original.value?.version,
        professorId: selectedTeacher.value,
        experienceId: selectedExperience.value,
      }),
    );
    await readTarget();
  });
}
const targets = computed(() =>
  store.labs
    .filter(
      (lab) => lab.wantApply || (props.formal && lab.id === route.params.labId),
    )
    .flatMap((lab) => {
      const target = labContext(store, lab.id);
      return target ? [target] : [];
    }),
);
const labId = ref(props.formal ? String(route.params.labId || '') : '');
const workflowVersion = ref(0);
const workflowStageSet = ref(false);
const aiResult = ref('');
const attachmentSuggestions = ref<
  { documentId?: string; title: string; reason: string }[]
>([]);
const editingRecordHash = ref('');
const editingProfessor = ref('');
const fileChoices = ref<StoredDocument[]>([]);
const existingFile = ref<string>();
const aiBusy = ref(false);
const working = ref(false);
interface Workflow {
  savedDraftId?: string;
  currentStage: FlowStageId | null;
  version: number;
  stages: Record<string, Record<string, string>>;
  drafts: Array<{
    id: string;
    subject: string;
    body: string;
    recipient: string;
    version: number;
    documentIds: string[];
    documents?: StoredDocument[];
  }>;
}
async function action(fn: () => Promise<void>) {
  if (working.value) return;
  working.value = true;
  errorMessage.value = '';
  try {
    await fn();
    if (props.formal)
      window.dispatchEvent(new Event('juai:application-change'));
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '操作失败，请保留草稿后重试';
  } finally {
    working.value = false;
  }
}
function acceptWorkflow(value: Workflow) {
  workflowVersion.value = value.version;
  workflowStageSet.value = !!value.currentStage;
  currentStage.value = value.currentStage || '';
  stageRecords.value = value.stages;
  drafts.value = value.drafts.map((d) => ({ ...d, files: [], saved: true }));
}
async function refreshWorkflow() {
  if (targetId.value)
    acceptWorkflow(
      await localApi<Workflow>(`/applications/${targetId.value}/workflow`),
    );
}
async function uploadDocument(file: File) {
  const response = await fetch('/api/japangrad/documents', {
    method: 'POST',
    headers: {
      'X-JapanGrad-Client': '1',
      'X-JapanGrad-Metadata': encodeURIComponent(
        JSON.stringify({
          ownerType: 'workspace',
          ownerId: 'workspace',
          kind: 'other',
          year: new Date().getFullYear(),
          title: file.name,
          filename: file.name,
        }),
      ),
    },
    body: file,
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || '上传失败');
  return value as StoredDocument;
}
async function completeMaterial(m: Material, complete: boolean) {
  if (!props.formal) {
    m.complete = complete;
    return;
  }
  await action(async () => {
    const state = await localApi<Target>(
      `/applications/${targetId.value}/materials/${m.id}`,
      jsonOptions('PUT', { ...m, complete }),
    );
    materials.value = state.materials;
  });
}
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
const currentStage = ref<'' | FlowStageId>(props.formal ? '' : 'prepare');
const viewedStage = ref<FlowStageId>('prepare');
const stageChanged = ref(false);
const stageLabel = computed(() =>
  props.formal && !workflowStageSet.value
    ? '申请阶段未设置'
    : FLOW_STAGES.find((s) => s.id === currentStage.value)?.label || '未设置',
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
function initialTab() {
  const requested = String(route.query.view);
  if (requested === 'contact') return 'mail';
  return ['mail', 'timeline'].includes(requested) ? requested : 'stages';
}
const tab = ref(initialTab());
const drafts = ref<Draft[]>([]);
const selectedMailId = ref('');
const query = ref('');
const mailFilter = ref('all');
const compose = ref(false);
const recordMode = ref<'draft' | 'received' | 'sent'>('draft');
const recordDate = ref('');
const editingRecordId = ref('');
const aiAction = ref('progress');
const writingRequirements = ref('');
const fileInput = ref<HTMLInputElement>();
const uploadMaterial = ref<HTMLInputElement>();
const materialEditor = ref(false);
const editingMaterialId = ref('');
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
      date: props.formal ? '未发送草稿' : '本地草稿',
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
  () => target.value?.lab.id,
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
    aiResult.value = '';
    attachmentSuggestions.value = [];
    fileChoices.value = [];
    existingFile.value = undefined;
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
      targetId.value =
        rows.find((row) => row.id === route.query.target)?.id ||
        rows[0]?.id ||
        '';
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
  if (props.formal && state.workflow) acceptWorkflow(state.workflow);
  if (currentStage.value) viewedStage.value = currentStage.value;
  selectedMailId.value =
    state.mails.at(-1)?.id || drafts.value.at(-1)?.id || '';
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
  ++generation;
  aiResult.value = '';
  attachmentSuggestions.value = [];
  fileChoices.value = [];
  existingFile.value = undefined;
  if (props.formal)
    void router.replace({ query: { ...route.query, target: targetId.value } });
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
async function setCurrent() {
  if (props.formal) {
    await action(async () => {
      acceptWorkflow(
        await localApi<Workflow>(
          `/applications/${targetId.value}/workflow`,
          jsonOptions('PUT', {
            version: workflowVersion.value,
            stage: viewedStage.value,
            makeCurrent: true,
          }),
        ),
      );
      feedback.value = '申请阶段已保存，总览与修考之路同步读取。';
    });
    return;
  }
  currentStage.value = viewedStage.value;
  stageChanged.value = true;
  feedback.value = '已更新原型阶段；总览视图同步，正式数据未更改。';
}
function editStage() {
  fieldDraft.value = { ...fields.value };
  stageEditor.value = true;
}
async function saveStage() {
  if (props.formal) {
    await action(async () => {
      acceptWorkflow(
        await localApi<Workflow>(
          `/applications/${targetId.value}/workflow`,
          jsonOptions('PUT', {
            version: workflowVersion.value,
            stage: viewedStage.value,
            makeCurrent: false,
            fields: fieldDraft.value,
          }),
        ),
      );
      stageEditor.value = false;
      feedback.value = '阶段记录已保存。';
    });
    return;
  }
  stageRecords.value[viewedStage.value] = { ...fieldDraft.value };
  stageEditor.value = false;
  feedback.value = '阶段记录仅保留在本次原型中，切换阶段不会丢失，刷新后重置。';
}
function previewImport() {
  if (props.formal) {
    modal.confirm({
      title: '从已保存要求建立材料清单',
      content: batch.value
        ? '材料生成后独立管理，已有项目保留。'
        : '请确认专攻通用材料要求适用于本申请目标；不适用的内容请勿导入。',
      okText: '确认适用并生成',
      onOk: () =>
        action(async () => {
          const state = await localApi<Target>(
            `/applications/${targetId.value}/seed`,
            jsonOptions('POST', { confirmCommon: !batch.value }),
          );
          materials.value = state.materials;
        }),
    });
    return;
  }
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
async function addMaterial() {
  if (props.formal) {
    await action(async () => {
      const state = await localApi<Target>(
        `/applications/${targetId.value}/materials${editingMaterialId.value ? `/${editingMaterialId.value}` : ''}`,
        jsonOptions(
          editingMaterialId.value ? 'PUT' : 'POST',
          editingMaterialId.value
            ? {
                ...materials.value.find(
                  (m) => m.id === editingMaterialId.value,
                ),
                title: newMaterialTitle.value,
                notes: newMaterialNotes.value,
              }
            : { title: newMaterialTitle.value, notes: newMaterialNotes.value },
        ),
      );
      materials.value = state.materials;
      selectedMaterialId.value = state.materials.at(-1)?.id || '';
      newMaterialTitle.value = '';
      newMaterialNotes.value = '';
      materialEditor.value = false;
      editingMaterialId.value = '';
    });
    return;
  }
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
async function addMaterialFiles(event: Event) {
  if (props.formal) {
    const input = event.target as HTMLInputElement;
    const m = material.value;
    if (!m) return;
    const files = [...(input.files || [])];
    input.value = '';
    await action(async () => {
      for (const file of files) {
        const doc = await uploadDocument(file);
        const current = materials.value.find((item) => item.id === m.id);
        if (!current) throw new Error('材料已变化，已上传文件保留在文件管理中');
        const state = await localApi<Target>(
          `/applications/${targetId.value}/materials/${m.id}`,
          jsonOptions('PUT', {
            ...current,
            documentIds: [...current.files.map((f) => f.id), doc.id],
          }),
        );
        materials.value = state.materials;
      }
      feedback.value = '文件已上传并关联；完成状态保持独立。';
    });
    return;
  }
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
  recordMode.value = 'draft';
  editingRecordId.value = '';
  editingRecordHash.value = '';
  editingProfessor.value = person.value?.id || '';
  recordDate.value = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(new Date())
    .replace(' ', 'T');
  const d = {
    id: crypto.randomUUID(),
    subject: '',
    body: '',
    recipient: person.value?.email || '',
    files: [],
    saved: false,
  } satisfies Draft;
  drafts.value.unshift(d);
  selectedMailId.value = d.id;
  compose.value = true;
  mailFilter.value = 'all';
  query.value = '';
  return drafts.value[0];
}
async function saveDraft() {
  if (props.formal && recordMode.value !== 'draft') {
    const d = currentDraft.value;
    if (!d) return;
    await action(async () => {
      const path = `/applications/${targetId.value}/records${editingRecordId.value ? `/${editingRecordId.value}` : ''}`;
      const state = await localApi<Target>(
        path,
        jsonOptions(editingRecordId.value ? 'PUT' : 'POST', {
          professorId: editingProfessor.value,
          expectedHash: editingRecordHash.value,
          direction: recordMode.value,
          subject: d.subject,
          body: d.body,
          date: recordDate.value,
          sender: d.sender || '',
          recipient: d.recipient,
          documentIds: d.documents?.map((f) => f.id) || [],
        }),
      );
      original.value = state;
      drafts.value = drafts.value.filter((item) => item.id !== d.id);
      selectedMailId.value = state.savedMailId || '';
      editingRecordId.value = '';
      compose.value = false;
      feedback.value = '邮件记录已保存。';
    });
    return;
  }
  if (props.formal) {
    const d = currentDraft.value;
    if (!d) return;
    await action(async () => {
      const value = await localApi<Workflow>(
        `/applications/${targetId.value}/drafts${d.version ? `/${d.id}` : ''}`,
        jsonOptions(d.version ? 'PUT' : 'POST', {
          subject: d.subject,
          body: d.body,
          recipient: d.recipient,
          version: d.version,
          documentIds: d.documents?.map((f) => f.id) || [],
        }),
      );
      acceptWorkflow(value);
      selectedMailId.value = value.savedDraftId || d.id;
      compose.value = false;
      feedback.value = '未发送草稿已保存。';
    });
    return;
  }
  if (currentDraft.value) {
    currentDraft.value.saved = true;
    compose.value = false;
    feedback.value = '草稿仅保存到本页原型，未进入邮件数据库，也未发送。';
  }
}
function deleteMail() {
  if (props.formal) {
    modal.confirm({
      title: currentDraft.value ? '删除草稿？' : '移除本目标的邮件记录？',
      content: currentDraft.value
        ? '附件原文件仍可在文件管理中查看。'
        : '原联络经历的邮件和文件仍可查看。',
      okText: '确认删除',
      cancelText: '取消',
      onOk: () =>
        action(async () => {
          const d = currentDraft.value;
          if (d) {
            if (d.version)
              acceptWorkflow(
                await localApi<Workflow>(
                  `/applications/${targetId.value}/drafts/${d.id}`,
                  jsonOptions('DELETE', { version: d.version }),
                ),
              );
            else drafts.value = drafts.value.filter((item) => item.id !== d.id);
          } else if (selectedMail.value) {
            await localApi(
              `/applications/${targetId.value}/records/${selectedMail.value.id}`,
              jsonOptions('DELETE', {
                expectedHash: selectedMail.value.recordHash,
              }),
            );
            await readTarget();
          }
          selectedMailId.value = mailbox.value[0]?.id || '';
        }),
    });
    return;
  }
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
async function loadExistingFiles() {
  await action(async () => {
    const files = await localApi<StoredDocument[]>('/documents/index');
    fileChoices.value = files.filter(
      (file) =>
        file.ownerType === 'workspace' ||
        (file.ownerType === 'major' && file.ownerId === target.value?.major.id),
    );
    if (fileChoices.value.length === 0) feedback.value = '暂无可关联的文件。';
  });
}
async function attachExisting(file: StoredDocument, mode: 'mail' | 'material') {
  if (mode === 'mail') {
    const draft = currentDraft.value;
    if (!draft) return;
    draft.documents ??= [];
    if (!draft.documents.some((doc) => doc.id === file.id))
      draft.documents.push(file);
    return;
  }
  const m = material.value;
  if (!m || m.files.some((doc) => doc.id === file.id)) return;
  await action(async () => {
    const state = await localApi<Target>(
      `/applications/${targetId.value}/materials/${m.id}`,
      jsonOptions('PUT', {
        ...m,
        documentIds: [...m.files.map((doc) => doc.id), file.id],
      }),
    );
    materials.value = state.materials;
  });
}
function attachSuggested(id?: string) {
  const file = materials.value
    .flatMap((m) => m.files)
    .find((doc) => doc.id === id);
  if (file) void attachExisting(file, 'mail');
}
function chooseExisting(mode: 'mail' | 'material') {
  const file = fileChoices.value.find((doc) => doc.id === existingFile.value);
  if (file) void attachExisting(file, mode);
  existingFile.value = undefined;
}
async function attachMail(event: Event) {
  if (props.formal) {
    const input = event.target as HTMLInputElement;
    const d = currentDraft.value;
    if (!d) return;
    const files = [...(input.files || [])];
    input.value = '';
    await action(async () => {
      for (const file of files) {
        const doc = await uploadDocument(file);
        d.documents ||= [];
        d.documents.push(doc);
      }
      feedback.value = '附件已上传，保存草稿后完成邮件关联。';
    });
    return;
  }
  const input = event.target as HTMLInputElement;
  if (currentDraft.value) currentDraft.value.files.push(...(input.files || []));
  input.value = '';
}
async function previewAiDraft() {
  if (props.formal) {
    await runAi('draft');
    return;
  }
  newDraft();
  aiAction.value = 'draft';
  feedback.value =
    '已打开一封独立空白草稿。原型不调用 AI，写作要求保留在右侧；正式版会在此放入可修改的代笔结果。';
}
async function runAi(kind: string) {
  if (aiBusy.value || working.value) return;
  aiBusy.value = true;
  errorMessage.value = '';
  try {
    const value = await localApi<{
      text: string;
      workflow?: Workflow;
      draftId?: string;
      attachmentSuggestions?: {
        documentId?: string;
        title: string;
        reason: string;
      }[];
    }>(
      `/applications/${targetId.value}/ai`,
      jsonOptions('POST', {
        action: kind,
        requirements: writingRequirements.value,
        messageId: selectedMail.value?.id,
      }),
    );
    aiResult.value = value.text;
    attachmentSuggestions.value = value.attachmentSuggestions || [];
    if (value.workflow) {
      acceptWorkflow(value.workflow);
      selectedMailId.value = value.draftId || '';
      compose.value = true;
    } else if (kind === 'draft') {
      await refreshWorkflow();
      selectedMailId.value = drafts.value.at(-1)?.id || '';
      compose.value = true;
    }
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : 'AI请求失败，未发送任何邮件';
  } finally {
    aiBusy.value = false;
  }
}
function editMail() {
  const m = selectedMail.value;
  if (currentDraft.value) {
    compose.value = true;
    return;
  }
  if (!m) return;
  const d = newDraft();
  if (d) {
    d.subject = m.subject;
    d.body = m.body;
    d.recipient = m.recipient || '';
    d.sender = m.sender || '';
    d.documents = m.documents || [];
  }
  recordMode.value = m.direction;
  recordDate.value = m.date;
  editingRecordId.value = m.id;
  editingRecordHash.value = m.recordHash || '';
  editingProfessor.value = m.professorId;
}
function editMaterial(m: Material) {
  editingMaterialId.value = m.id;
  newMaterialTitle.value = m.title;
  newMaterialNotes.value = m.notes;
  materialEditor.value = true;
}
function removeMaterial(m: Material) {
  modal.confirm({
    title: '删除材料条目？',
    content: '关联文件仍保留在文件管理中。',
    okText: '删除条目',
    cancelText: '取消',
    onOk: () =>
      action(async () => {
        const state = await localApi<Target>(
          `/applications/${targetId.value}/materials/${m.id}`,
          jsonOptions('DELETE', { version: m.version }),
        );
        materials.value = state.materials;
        selectedMaterialId.value = state.materials[0]?.id || '';
      }),
  });
}
async function detachMaterialFile(doc: StoredDocument) {
  const m = material.value;
  if (!m) return;
  await action(async () => {
    const state = await localApi<Target>(
      `/applications/${targetId.value}/materials/${m.id}`,
      jsonOptions('PUT', {
        ...m,
        documentIds: m.files.filter((f) => f.id !== doc.id).map((f) => f.id),
      }),
    );
    materials.value = state.materials;
  });
}
function stageValue(key: string) {
  return fields.value[key] || '未填写';
}
</script>

<template>
  <section class="flow-prototype juai-design">
    <div v-if="!props.formal" class="flow-preview-strip">
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
    <div v-if="props.formal" class="flow-inline-actions">
      <RouterLink to="/japan-grad/overview">申请总览</RouterLink><RouterLink to="/japan-grad/journey">修考之路</RouterLink><a v-if="targetId" :href="`/api/japangrad/applications/${targetId}/zip`">导出材料 ZIP</a><Button
        v-if="target && !original && !loading"
        @click="
          action(async () => {
            const state = await localApi<Target>(
              `/applications/labs/${labId}`,
              jsonOptions('POST', {}),
            );
            targetId = state.id;
            await readTarget();
          })
        "
      >
        建立此申请目标
      </Button>
    </div>
    <p v-if="errorMessage" role="alert" class="flow-alert">
      {{ errorMessage }}
    </p>
    <p v-if="loading" role="status" class="flow-feedback">
      {{ props.formal ? '正在读取申请目标…' : '正在读取资料…' }}
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
                :disabled="working || aiBusy || loading"
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
                :disabled="working || aiBusy || loading"
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
            <details
              v-if="props.formal && batches.length"
              class="flow-stage-more"
            >
              <summary>建立或打开其他招生批次</summary>
              <div class="flow-inline-actions">
                <Select
                  v-model:value="newBatchId"
                  aria-label="选择目标招生批次"
                  :options="
                    batches.map((item) => ({
                      value: item.id,
                      label: item.label,
                    }))
                  "
                />
                <Button
                  :disabled="!newBatchId || working"
                  @click="openTarget(newBatchId)"
                >
                  打开批次目标
                </Button>
              </div>
            </details>
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
            <details
              v-if="props.formal && original && target.professors.length"
              class="flow-stage-more"
            >
              <summary>关联教授联络经历</summary>
              <label>教授
                <Select
                  v-model:value="selectedTeacher"
                  :options="
                    target.professors.map((teacher) => ({
                      value: teacher.id,
                      label: teacher.name,
                    }))
                  "
                  @change="selectedExperience = ''"
                />
              </label>
              <label>已有经历
                <Select
                  v-model:value="selectedExperience"
                  :options="
                    teacherExperiences.map((item) => ({
                      value: item?.experienceId,
                      label: item?.experienceTitle || '联络经历',
                    }))
                  "
                />
              </label>
              <Button
                :disabled="!selectedExperience || working"
                @click="bindExperience"
              >
                保存关联
              </Button>
            </details>
            <div class="flow-legacy-note">
              <span>原教授联络记录</span><strong>{{ CONTACT_LABELS[contact.status] }}</strong>
              <p>
                {{
                  stageChanged
                    ? props.formal
                      ? '申请阶段由本目标单独维护。'
                      : '当前阶段已在原型中手动调整。'
                    : props.formal
                      ? '原联络经历保留，不自动覆盖申请阶段。'
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
</Button><Button
                    type="primary"
                    @click="
                      editingMaterialId = '';
                      newMaterialTitle = '';
                      newMaterialNotes = '';
                      materialEditor = true;
                    "
                  >
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
                        :checked="m.complete"
                        :disabled="working"
                        @change="completeMaterial(m, !m.complete)"
                        :aria-label="`完成材料：${m.title}`"
                      /><button @click="selectedMaterialId = m.id">
                        <strong>{{ m.title }}</strong><small>{{ m.preview ? '原型草稿 · ' : ''
                          }}{{
                            m.files.length
                              ? `${m.files.length} 个文件`
                              : '尚无文件'
                          }}{{ m.complete ? ' · 已勾选完成' : '' }}</small>
                      </button>
                      <div v-if="props.formal" class="flow-inline-actions">
                        <Button size="small" @click="editMaterial(m)">
                          编辑
</Button><Button size="small" @click="removeMaterial(m)">
                          删除
                        </Button>
                      </div>
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
                  <div
                    v-if="props.formal && material"
                    class="flow-inline-actions"
                  >
                    <Button @click="loadExistingFiles">选择已有文件</Button>
                    <Select
                      v-if="fileChoices.length"
                      v-model:value="existingFile"
                      aria-label="已有申请材料文件"
                      :options="
                        fileChoices.map((doc) => ({
                          value: doc.id,
                          label: doc.filename,
                        }))
                      "
                      @change="chooseExisting('material')"
                    />
                  </div>
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
                      <ExplorerIcon name="upload" /><strong>选择本地文件</strong><span>{{
                        props.formal
                          ? '上传文件并关联当前材料；完成状态独立管理。'
                          : '原型仅展示文件名，不上传。上传与完成独立管理。'
                      }}</span>
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
                        >查看</a><Button
                        v-if="props.formal"
                        type="text"
                        size="small"
                        @click="detachMaterialFile(file)"
                      >
                        解除关联
                      </Button>
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
            <details v-if="props.formal" class="flow-stage-more">
              <summary>导入既有邮件</summary>
              <Button size="small" @click="findExistingMails">
                查找关联经历邮件
              </Button>
              <Select
                v-if="existingMails.length"
                v-model:value="existingMailId"
                aria-label="选择既有邮件"
                :options="
                  existingMails.map((mail) => ({
                    value: mail.id,
                    label: mail.subject,
                  }))
                "
              />
              <Button
                v-if="existingMailId"
                size="small"
                @click="linkExistingMail"
              >
                关联邮件
              </Button>
            </details>
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
                      : '新建草稿，或在编辑器中选择“收到的邮件 / 已发送记录”录入已有往来。'
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
                      ? '未发送草稿'
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
                    v-if="
                      (currentDraft || (props.formal && selectedMail)) &&
                      !compose
                    "
                    @click="editMail"
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
                  <label v-if="props.formal">邮件类型<Select
                      v-model:value="recordMode"
                      :options="[
                        { value: 'draft', label: '未发送草稿' },
                        { value: 'received', label: '收到的邮件' },
                        { value: 'sent', label: '已发送记录' },
                      ]"
/></label><label v-if="props.formal && recordMode !== 'draft'">往来时间<Input
                      v-model:value="recordDate"
                      type="datetime-local"
/></label><label v-if="props.formal && recordMode !== 'draft'">发件人<Input v-model:value="currentDraft.sender" /></label>
                  <label>收件人<Input
                      v-model:value="currentDraft.recipient"
                      :disabled="working"
                      placeholder="教授邮箱"
/></label><label>主题<Input
                      v-model:value="currentDraft.subject"
                      :disabled="working"
                      placeholder="填写邮件主题"
                  /></label>
                </div>
                <Input.TextArea
                  v-model:value="currentDraft.body"
                  class="flow-compose-body"
                  placeholder="在这里撰写邮件，或修改 AI 生成的独立草稿。"
                  :disabled="working"
                  :auto-size="{ minRows: 12, maxRows: 20 }"
                  aria-label="邮件正文"
                />
                <div class="flow-compose-actions">
                  <span>{{
                    props.formal ? '草稿不会自动发送' : '仅原型草稿，不会发送'
                  }}</span><Button type="primary" :loading="working" @click="saveDraft">
                    {{
                      props.formal
                        ? recordMode === 'draft'
                          ? '保存草稿'
                          : '保存往来记录'
                        : '保存到原型草稿'
                    }}
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
                    <dd>
                      {{
                        selectedMail?.date ||
                        (props.formal ? '未发送草稿' : '本页原型草稿')
                      }}
                    </dd>
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
                    邮件附件
                    <span>{{
                      (currentDraft?.files.length || 0) +
                      (currentDraft?.documents?.length ||
                        selectedMail?.documents?.length ||
                        0)
                    }}</span>
                  </h3>
                  <Button
                    v-if="currentDraft && (!props.formal || compose)"
                    @click="fileInput?.click()"
                  >
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
                <div
                  v-if="props.formal && currentDraft && compose"
                  class="flow-inline-actions"
                >
                  <Button @click="loadExistingFiles">选择已有文件</Button>
                  <Select
                    v-if="fileChoices.length"
                    v-model:value="existingFile"
                    aria-label="已有邮件附件"
                    :options="
                      fileChoices.map((doc) => ({
                        value: doc.id,
                        label: doc.filename,
                      }))
                    "
                    @change="chooseExisting('mail')"
                  />
                </div>
                <div
                  v-for="doc in currentDraft?.documents ||
                  selectedMail?.documents ||
                  []"
                  :key="doc.id"
                  class="flow-file-row"
                >
                  <ExplorerIcon name="book" /><a
                    :href="fileUrl(doc.id)"
                    target="_blank"
                    rel="noreferrer"
                    >{{ doc.filename }}</a><small>{{ fileSize(doc.size) }}</small><Button
                    v-if="props.formal && currentDraft && compose"
                    size="small"
                    @click="
                      currentDraft.documents = currentDraft.documents?.filter(
                        (file) => file.id !== doc.id,
                      )
                    "
                  >
                    解除附件
                  </Button>
                </div>
                <p
                  v-if="
                    !currentDraft?.files.length &&
                    !currentDraft?.documents?.length &&
                    !selectedMail?.documents?.length
                  "
                  class="flow-muted"
                >
                  暂无关联附件。可在编辑邮件时上传附件并保存关联。
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
                v-for="option in [
                  { id: 'progress', label: '总结当前进展' },
                  { id: 'ideas', label: '下一封写作思路' },
                  { id: 'draft', label: 'AI 代笔写信' },
                ]"
                :key="option.id"
                :class="{ 'is-active': aiAction === option.id }"
                @click="aiAction = option.id"
              >
                {{ option.label }}<ExplorerIcon name="chevron" />
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
                {{ props.formal ? '生成新邮件草稿' : '查看新邮件草稿流程' }}
              </Button>
              <p v-if="!props.formal" class="flow-ai-boundary">
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
                      ? '区分教授明确表达的内容、待确认事项和下一步建议。'
                      : '结合本目标邮件、阶段与写作要求提出思路，不推测教授承诺。'
                  }}
                </p>
                <span v-if="!props.formal">原型不调用模型，不展示虚构的 AI 结果</span>
              </div>
            </template>
            <Button
              v-if="props.formal && aiAction !== 'draft'"
              block
              :loading="aiBusy"
              @click="runAi(aiAction)"
            >
              开始整理
            </Button>
            <p v-if="props.formal && aiResult" class="flow-mail-body">
              {{ aiResult }}
            </p>
            <div class="flow-attachment-advice">
              <h3>随信附件</h3>
              <div
                v-for="(suggestion, index) in attachmentSuggestions"
                :key="index"
                class="flow-file-row"
              >
                <div>
                  <strong>{{ suggestion.title }}</strong><small>{{ suggestion.reason }}</small><small v-if="!suggestion.documentId">待准备材料</small>
                </div>
                <Button
                  v-if="
                    currentDraft &&
                    compose &&
                    materials
                      .flatMap((m) => m.files)
                      .some((doc) => doc.id === suggestion.documentId)
                  "
                  size="small"
                  @click="attachSuggested(suggestion.documentId)"
                >
                  加入草稿
                </Button>
              </div>
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
                feedback = props.formal
                  ? '请在日历与待办中管理提醒。'
                  : '日程原型为只读展示；正式日程编辑与原时间线保留。'
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
      <h1>{{ props.formal ? '申请工作台' : '申请工作流原型' }}</h1>
      <p>当前工作区没有想考研究室。请先在修考之路选择目标。</p>
    </div>
    <Modal
      :confirm-loading="working"
      :closable="!working"
      :mask-closable="!working"
      v-model:open="stageEditor"
      :title="`${viewedLabel} · 编辑阶段记录`"
      :ok-text="props.formal ? '保存记录' : '应用到原型'"
      cancel-text="取消"
      @ok="saveStage"
    >
      <p v-if="!props.formal" class="flow-modal-note">
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
      :confirm-loading="working"
      :closable="!working"
      :mask-closable="!working"
      v-model:open="materialEditor"
      :title="props.formal ? '新增申请材料' : '新增原型材料'"
      :ok-text="props.formal ? '加入清单' : '加入原型清单'"
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
