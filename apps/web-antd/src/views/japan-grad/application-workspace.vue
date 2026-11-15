<script setup lang="ts">
import type { MailRecord } from './communications';
import type { StoredDocument } from './documents';
import type { AdmissionBatch } from './foundation-types';

import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import {
  App,
  Button,
  Checkbox,
  Input,
  Modal,
  Select,
  Tabs,
} from 'ant-design-vue';

import JourneyTimeline from './components/journey-timeline.vue';
import ProfessorContact from './components/professor-contact.vue';
import ProfessorMail from './components/professor-mail.vue';
import ContentSection from './design-system/content-section.vue';
import DateMarker from './design-system/date-marker.vue';
import FileList from './design-system/file-list.vue';
import PageHeading from './design-system/page-heading.vue';
import { useExplorerStore } from './explorer';
import { labContext, labPath, majorPath } from './lab-targets';
import { jsonOptions, localApi } from './local-api';
import { vAccessibleSelect } from './select-accessibility';

interface Material {
  id: string;
  title: string;
  notes: string;
  source: string;
  version: number;
  complete: boolean;
  files: StoredDocument[];
}
interface Target {
  version: number;
  contacts: { professor_id: string; experience_id: string }[];
  id: string;
  batch_id: null | string;
  materials: Material[];
  mails: MailRecord[];
}
async function copyDraft() {
  await run(async () => {
    await navigator.clipboard.writeText(aiDraft.value);
  });
}
const route = useRoute();
const router = useRouter();
const store = useExplorerStore();
const { modal } = App.useApp();
const context = computed(() => labContext(store, String(route.params.labId)));
const batches = ref<AdmissionBatch[]>([]);
const batchId = ref<string>();
const busy = ref(false);
const errorMessage = ref('');
const selectedMaterial = ref('');
const selectedTarget = ref('');
const state = ref<Target>();
const tab = ref(route.query.view === 'contact' ? 'contact' : 'materials');
const targets = ref<Array<{ id: string; batch_id: null | string }>>([]);
const material = computed(
  () =>
    state.value?.materials.find((m) => m.id === selectedMaterial.value) ||
    state.value?.materials[0],
);
const aiDraft = ref('');
const aiBusy = ref(false);
let aiController: AbortController | undefined;
onBeforeUnmount(() => aiController?.abort());
const availableMail = ref<MailRecord[]>([]);
const mailEditor = ref(false);
const mailToLink = ref<string>();
const replyRequirements = ref('');
function targetLabel(batch: null | string) {
  const b = batches.value.find((item) => item.id === batch);
  return b
    ? [b.admissionYear || '年度未确认', b.label, b.examType]
        .filter(Boolean)
        .join(' · ')
    : '未指定批次的申请目标';
}
const selectedMail = ref('');
const teacher = ref(
  typeof route.query.professor === 'string' ? route.query.professor : '',
);
const teachers = computed(() => context.value?.professors || []);
const mail = computed(
  () =>
    state.value?.mails.find((m) => m.id === selectedMail.value) ||
    state.value?.mails[0],
);
const base = () => `/applications/${state.value?.id}`;
async function run(work: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true;
  errorMessage.value = '';
  try {
    await work();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '操作失败';
  } finally {
    busy.value = false;
  }
}
async function readTarget() {
  if (state.value?.id !== selectedTarget.value) {
    aiController?.abort();
    aiDraft.value = '';
    selectedMail.value = '';
    replyRequirements.value = '';
    state.value = undefined;
  }
  if (!selectedTarget.value) {
    state.value = undefined;
    return;
  }
  state.value = await localApi<Target>(`/applications/${selectedTarget.value}`);
}
async function load() {
  if (!context.value) return;
  if (!teachers.value.some((p) => p.id === teacher.value))
    teacher.value = teachers.value[0]?.id || '';
  targets.value = await localApi(`/applications/labs/${context.value.lab.id}`);
  batches.value = await localApi(
    `/foundation/majors/${context.value.major.id}/batches`,
  );
  if (!targets.value.some((t) => t.id === selectedTarget.value))
    selectedTarget.value =
      targets.value.find((t) => t.id === route.query.target)?.id ||
      targets.value[0]?.id ||
      '';
  await readTarget();
}
watch(
  () => route.params.labId,
  () => {
    state.value = undefined;
    selectedTarget.value = '';
    void run(load);
  },
  { immediate: true },
);
function chooseTarget(value: unknown) {
  selectedTarget.value = String(value);
  void router.replace({
    query: { ...route.query, target: selectedTarget.value },
  });
  void run(readTarget);
}
watch([() => route.query.target, busy], ([value, loading]) => {
  if (
    typeof value !== 'string' ||
    value === selectedTarget.value ||
    !targets.value.some((t) => t.id === value)
  )
    return;
  if (loading) {
    aiController?.abort();
    return;
  }
  selectedTarget.value = value;
  void run(readTarget);
});
watch(
  () => route.query.view,
  (value) => {
    tab.value = ['contact', 'materials', 'timeline'].includes(String(value))
      ? String(value)
      : 'materials';
  },
);
async function createTarget() {
  await run(async () => {
    if (!context.value) return;
    const result = await localApi<Target>(
      `/applications/labs/${context.value.lab.id}`,
      jsonOptions('POST', { batchId: batchId.value }),
    );
    selectedTarget.value = result.id;
    void router.replace({ query: { ...route.query, target: result.id } });
    await load();
  });
}
const editing = ref<Material>();
const materialOpen = ref(false);
const notes = ref('');
const title = ref('');
function editMaterial(value?: Material) {
  editing.value = value;
  title.value = value?.title || '';
  notes.value = value?.notes || '';
  materialOpen.value = true;
}
function generateMaterials() {
  if (state.value?.batch_id) {
    void run(async () => {
      state.value = await localApi<Target>(
        `${base()}/seed`,
        jsonOptions('POST', {}),
      );
    });
    return;
  }
  modal.confirm({
    title: '按专攻通用要求生成？',
    content:
      '尚未关联招生批次，请确认通用要求适用于本目标。不会推定入学年份，也不会覆盖现有材料。',
    okText: '已核对，生成材料',
    cancelText: '取消',
    onOk: () =>
      run(async () => {
        state.value = await localApi<Target>(
          `${base()}/seed`,
          jsonOptions('POST', { confirmCommon: true }),
        );
      }),
  });
}
async function saveMaterial() {
  await run(async () => {
    const m = editing.value;
    state.value = await localApi<Target>(
      `${base()}/materials${m ? `/${m.id}` : ''}`,
      jsonOptions(m ? 'PUT' : 'POST', {
        ...m,
        title: title.value,
        notes: notes.value,
      }),
    );
    materialOpen.value = false;
  });
}
async function complete(m: Material, checked: boolean) {
  await run(async () => {
    state.value = await localApi<Target>(
      `${base()}/materials/${m.id}`,
      jsonOptions('PUT', { ...m, complete: checked }),
    );
  });
}
async function removeMaterial(m: Material) {
  await run(async () => {
    state.value = await localApi<Target>(
      `${base()}/materials/${m.id}`,
      jsonOptions('DELETE', { version: m.version }),
    );
  });
}
async function upload(file: File) {
  const m = material.value;
  if (!m) {
    errorMessage.value = '请先选择材料条目。';
    return;
  }
  await run(async () => {
    const r = await fetch('/api/japangrad/documents', {
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
    const doc = await r.json();
    if (!r.ok) throw new Error(doc.error);
    try {
      state.value = await localApi<Target>(
        `${base()}/materials/${m.id}`,
        jsonOptions('PUT', {
          ...m,
          documentIds: [...m.files.map((f) => f.id), doc.id],
        }),
      );
    } catch (error) {
      throw new Error('文件已保存在个人文件区，但关联失败，请重新选择关联。', {
        cause: error,
      });
    }
  });
}
const existingFiles = ref<StoredDocument[]>([]);
const fileChoice = ref<string>();
async function loadFiles() {
  await run(async () => {
    const files = await localApi<StoredDocument[]>('/documents/index');
    existingFiles.value = files.filter(
      (f) =>
        f.ownerType === 'workspace' ||
        (f.ownerType === 'major' && f.ownerId === context.value?.major.id),
    );
  });
}
async function associate() {
  const m = material.value;
  if (!m || !fileChoice.value) return;
  await run(async () => {
    state.value = await localApi<Target>(
      `${base()}/materials/${m.id}`,
      jsonOptions('PUT', {
        ...m,
        documentIds: [
          ...new Set([...m.files.map((f) => f.id), fileChoice.value]),
        ],
      }),
    );
  });
}
async function detach(doc: StoredDocument) {
  const m = material.value;
  if (!m) return;
  await run(async () => {
    state.value = await localApi<Target>(
      `${base()}/materials/${m.id}`,
      jsonOptions('PUT', {
        ...m,
        documentIds: m.files.filter((f) => f.id !== doc.id).map((f) => f.id),
      }),
    );
  });
}
async function deleteFile(doc: StoredDocument) {
  const m = material.value;
  if (!m) return;
  await run(async () => {
    const refs = await localApi<Array<{ id: string; label: string }>>(
      `/documents/${doc.id}/references`,
    );
    const others = refs.filter((r) => r.id !== m.id);
    if (others.length > 0)
      throw new Error(
        `文件还被以下业务引用，不能删除：${others.map((r) => r.label).join('、')}。可以单独解除当前关联。`,
      );
    modal.confirm({
      title: `删除「${doc.title}」？`,
      content: '解除当前材料关联后将文件移入可恢复区，材料完成状态保持不变。',
      okText: '删除文件',
      cancelText: '取消',
      async onOk() {
        await detach(doc);
        if (errorMessage.value) return;
        await run(async () => {
          await localApi(`/documents/${doc.id}`, { method: 'DELETE' });
        });
      },
    });
  });
}
async function recordMails(id: string | undefined, rows: MailRecord[]) {
  if (!id) return;
  try {
    for (const row of rows) {
      const next = await localApi<Target>(
        `/applications/${id}/mail`,
        jsonOptions('POST', { messageId: row.id }),
      );
      if (state.value?.id === id) state.value = next;
    }
  } catch (error) {
    errorMessage.value = `邮件已保存，但目标关联失败：${error instanceof Error ? error.message : '请手动关联'}`;
  }
}
async function refreshMail() {
  await loadMail();
  await run(readTarget);
}
const contactBinding = computed(
  () =>
    state.value?.contacts.find((c) => c.professor_id === teacher.value)
      ?.experience_id,
);
const contactOptions = computed(() => {
  const p = teachers.value.find((p) => p.id === teacher.value);
  return [p?.contact, ...(p?.contactHistory || [])]
    .filter(Boolean)
    .map((c) => ({
      value: c?.experienceId,
      label: c?.experienceTitle || '未命名经历',
    }));
});
const chosenExperience = ref<string>();
async function bindExperience(id?: string) {
  if (!id) return;
  await run(async () => {
    state.value = await localApi<Target>(
      `${base()}/contacts`,
      jsonOptions('POST', {
        version: state.value?.version,
        professorId: teacher.value,
        experienceId: id,
      }),
    );
  });
}
async function newExperience() {
  if (!teacher.value) return;
  await run(async () => {
    const result = await store.createContactExperience(
      teacher.value,
      `申请目标 · ${batches.value.find((b) => b.id === state.value?.batch_id)?.label || '未指定批次'}`,
    );
    state.value = await localApi<Target>(
      `${base()}/contacts`,
      jsonOptions('POST', {
        version: state.value?.version,
        professorId: teacher.value,
        experienceId: result.experience.experienceId,
      }),
    );
  });
}
async function loadMail() {
  await run(async () => {
    const results = await Promise.all(
      teachers.value.map((p) =>
        localApi<MailRecord[]>(`/messages?professorId=${p.id}`),
      ),
    );
    availableMail.value = results.flat();
    availableMail.value = availableMail.value.filter((m) =>
      state.value?.contacts.some(
        (c) =>
          c.professor_id === m.professorId &&
          c.experience_id === m.experienceId,
      ),
    );
  });
}
async function linkMail() {
  if (!mailToLink.value) return;
  await run(async () => {
    state.value = await localApi<Target>(
      `${base()}/mail`,
      jsonOptions('POST', { messageId: mailToLink.value }),
    );
  });
}
async function ai(action: string) {
  aiController = new AbortController();
  aiBusy.value = true;
  try {
    await run(async () => {
      const result = await localApi<{ text: string }>(`${base()}/ai`, {
        ...jsonOptions('POST', {
          action,
          messageId: mail.value?.id,
          requirements: replyRequirements.value,
        }),
        signal: aiController?.signal,
      });
      aiDraft.value = result.text;
    });
  } finally {
    aiBusy.value = false;
  }
}
</script>
<template>
  <section v-if="context" class="juai-design juai-stack">
    <PageHeading
      :title="context.lab.name"
      :description="context.lab.research || undefined"
      :context="`${context.university.name} / ${context.major.name} · 申请工作台`"
    >
      <template #meta>
        <RouterLink :to="labPath(context)">研究室资料 ↗</RouterLink><RouterLink :to="majorPath(context)">专攻与招生信息 ↗</RouterLink><RouterLink to="/japan-grad/journey">
          返回修考之路
        </RouterLink>
</template><template #actions>
        <a v-if="state" :href="`/api/japangrad${base()}/zip`" class="ant-btn">导出材料 ZIP</a>
      </template>
    </PageHeading>
    <p v-if="busy" role="status" class="juai-scope-note">
      正在处理，请稍候…
      <Button v-if="aiBusy" size="small" @click="aiController?.abort()">
        停止生成
      </Button>
    </p>
    <p v-if="errorMessage" role="alert" class="form-error">
      {{ errorMessage }}
    </p>
    <ContentSection title="申请目标">
      <div class="application-tools">
        <Select
          v-accessible-select
          v-if="targets.length"
          v-model:value="selectedTarget"
          :disabled="busy"
          :options="
            targets.map((t) => ({
              value: t.id,
              label: targetLabel(t.batch_id),
            }))
          "
          aria-label="选择申请目标"
          @change="chooseTarget"
        /><Select
          v-accessible-select
          v-model:value="batchId"
          allow-clear
          :options="
            batches.map((b) => ({
              value: b.id,
              label: `${b.admissionYear || '年度未确认'} · ${b.label}`,
            }))
          "
          placeholder="选择招生批次，未知可留空"
          aria-label="目标招生批次"
        /><Button :disabled="busy" @click="createTarget">
          建立 / 打开此目标
        </Button>
      </div>
    </ContentSection>
    <template v-if="state">
      <ContentSection title="本目标招生时间">
        <p class="juai-scope-note">
          {{
            batches.find((b) => b.id === state?.batch_id)?.scope ||
            '适用范围未确认'
          }}
        </p>
        <div class="juai-date-row">
          <DateMarker
            label="考试日期"
            :value="batches.find((b) => b.id === state?.batch_id)?.examDate"
          /><DateMarker
            label="面试日期"
            :value="
              batches.find((b) => b.id === state?.batch_id)?.interviewDate
            "
          />
        </div>
      </ContentSection>
      <Tabs
        v-model:active-key="tab"
        @change="
          (value) =>
            router.replace({
              query: {
                ...route.query,
                view: String(value),
                target: selectedTarget,
              },
            })
        "
      >
        <Tabs.TabPane key="materials" tab="申请材料">
          <div class="application-split">
            <ContentSection title="材料清单">
              <template #actions>
                <Button :disabled="busy" @click="editMaterial()">
                  新增材料
</Button><Button :disabled="busy" @click="generateMaterials">
                  从已保存要求生成
                </Button>
              </template>
              <p class="juai-scope-note">
                完成状态独立于文件上传。{{
                  state.materials.filter((m) => m.complete).length
                }}/{{ state.materials.length }} 项完成
              </p>
              <ul class="material-list">
                <li
                  v-for="m in state.materials"
                  :key="m.id"
                  :class="{ selected: material?.id === m.id }"
                >
                  <Checkbox
                    :checked="m.complete"
                    :disabled="busy"
                    :aria-label="`完成材料：${m.title}`"
                    @change="complete(m, !m.complete)"
                  /><button
                    class="material-name"
                    :disabled="busy"
                    @click="selectedMaterial = m.id"
                  >
                    {{ m.title }}
</button><Button
                    size="small"
                    :disabled="busy"
                    @click="editMaterial(m)"
                  >
                    编辑
</Button><Button
                    size="small"
                    danger
                    :disabled="busy"
                    @click="removeMaterial(m)"
                  >
                    移除
                  </Button>
                </li>
              </ul>
            </ContentSection>
            <ContentSection :title="material?.title || '选择一项材料'">
              <template v-if="material">
                <p v-if="material.notes" class="juai-prose">
                  {{ material.notes }}
                </p>
                <p v-if="material.source" class="juai-scope-note">
                  来源：{{
                    material.source.startsWith('batch:')
                      ? '本批次招生要求（生成后独立管理）'
                      : material.source.startsWith('major-common:')
                        ? '专攻通用要求（范围已手动核对）'
                        : '原有研究室材料清单'
                  }}
                </p>
                <label
                  class="material-drop"
                  @dragover.prevent
                  @drop.prevent="
                    (e) => {
                      const f = e.dataTransfer?.files[0];
                      if (f) upload(f);
                    }
                  "
                  >拖拽文件或从本地选择<input
                    type="file"
                    accept=".pdf,.doc,.docx,.md,.txt"
                    :disabled="busy"
                    @change="
                      (e) => {
                        const f = (e.target as HTMLInputElement).files?.[0];
                        if (f) upload(f);
                      }
                    "
/></label><FileList :files="material.files">
                  <template #actions="{ file }">
                    <Button type="text" :disabled="busy" @click="detach(file)">
                      解除关联
</Button><Button
                      type="text"
                      danger
                      :disabled="busy"
                      @click="deleteFile(file)"
                    >
                      删除
                    </Button>
                  </template>
                </FileList>
                <div class="application-tools">
                  <Button :disabled="busy" @click="loadFiles">
                    选择已有文件
</Button><Select
                    v-accessible-select
                    v-if="existingFiles.length"
                    v-model:value="fileChoice"
                    :options="
                      existingFiles.map((f) => ({
                        value: f.id,
                        label: f.title,
                      }))
                    "
                    aria-label="已有文件"
                  /><Button
                    v-if="fileChoice"
                    :disabled="busy"
                    @click="associate"
                  >
                    关联此文件
                  </Button>
                </div>
              </template>
            </ContentSection>
          </div>
</Tabs.TabPane><Tabs.TabPane key="contact" tab="教授联络">
          <div class="application-split">
            <ContentSection title="联络与阶段">
              <Select
                v-accessible-select
                v-model:value="teacher"
                :disabled="busy"
                :options="teachers.map((p) => ({ value: p.id, label: p.name }))"
                placeholder="选择老师"
                aria-label="联络老师"
              />
              <div class="application-tools">
                <Select
                  v-accessible-select
                  v-model:value="chosenExperience"
                  :options="contactOptions"
                  placeholder="选择本目标的联络经历"
                  aria-label="联络经历"
                /><Button
                  :disabled="busy || !chosenExperience"
                  @click="bindExperience(chosenExperience)"
                >
                  关联经历
</Button><Button :disabled="busy || !teacher" @click="newExperience">
                  新建本目标经历
                </Button>
              </div>
              <p class="juai-scope-note">
                更换关联会解除该老师其他经历的目标邮件关联，原邮件保留。
              </p>
              <ProfessorContact
                v-if="teacher && contactBinding"
                :key="contactBinding"
                :professor-id="teacher"
                :experience-id="contactBinding"
                compact
              />
              <p v-else class="juai-scope-note">
                先新建或明确关联本目标的联络经历，其他批次的进度不会自动带入。
              </p>
              <Button
                :disabled="!teacher || !contactBinding"
                @click="mailEditor = true"
              >
                新增 / 导入 / 编辑邮件
              </Button>
</ContentSection><ContentSection title="本目标邮件">
              <div class="application-tools">
                <Button :disabled="busy" @click="loadMail">
                  从现有邮件关联
</Button><Select
                  v-accessible-select
                  v-if="availableMail.length"
                  v-model:value="mailToLink"
                  :options="
                    availableMail.map((m) => ({
                      value: m.id,
                      label: `${m.date} · ${m.subject}`,
                    }))
                  "
                  aria-label="选择邮件关联"
                /><Button v-if="mailToLink" :disabled="busy" @click="linkMail">
                  关联邮件
                </Button>
              </div>
              <Select
                v-accessible-select
                v-if="state.mails.length"
                v-model:value="selectedMail"
                :options="
                  state.mails.map((m) => ({
                    value: m.id,
                    label: `${m.date} · ${m.subject}`,
                  }))
                "
                placeholder="选择邮件"
                aria-label="当前邮件"
              />
              <article v-if="mail" class="mail-body">
                <h3>{{ mail.subject }}</h3>
                <p>
                  发件人：{{
                    mail.sender ||
                    (mail.direction === 'received'
                      ? mail.address || '未记录'
                      : '未记录')
                  }}
                  · 收件人：{{
                    mail.recipient ||
                    (mail.direction === 'sent'
                      ? mail.address || '未记录'
                      : '未记录')
                  }}
                  · {{ mail.date }}
                </p>
                <pre>{{ mail.body }}</pre>
                <Button
                  type="text"
                  @click="
                    run(async () => {
                      state = await localApi(
                        `${base()}/mail/${mail?.id}`,
                        jsonOptions('DELETE', {}),
                      );
                    })
                  "
                >
                  解除目标关联
                </Button>
              </article>
              <p v-else class="juai-scope-note">
                请主动关联属于本申请目标的邮件，其他批次邮件不会自动加入。
              </p>
              <div class="application-tools">
                <Button :disabled="busy || !mail" @click="ai('mail_summary')">
                  单封邮件总结
</Button><Button
                  :disabled="busy || !state.mails.length"
                  @click="ai('progress')"
                >
                  联络进展总结
                </Button>
              </div>
              <Input.TextArea
                v-model:value="replyRequirements"
                :rows="2"
                placeholder="你的回信要求"
                :maxlength="4000"
              /><Button
                :disabled="busy || !mail || !replyRequirements.trim()"
                @click="ai('reply')"
              >
                生成 AI 回信草稿
</Button><Input.TextArea
                v-if="aiDraft"
                v-model:value="aiDraft"
                :rows="10"
                aria-label="可编辑AI草稿"
              /><Button v-if="aiDraft" @click="copyDraft">复制草稿</Button>
              <p class="juai-scope-note">
                使用你配置的工作区 AI
                API；草稿可修改、重新生成，不会自动发送。AI建议不能视为教授承诺。
              </p>
            </ContentSection>
          </div>
</Tabs.TabPane><Tabs.TabPane key="timeline" tab="原有日程与时间线">
          <JourneyTimeline :targets="[context]" year="latest" />
        </Tabs.TabPane>
      </Tabs>
    </template>
    <Modal
      v-model:open="materialOpen"
      :footer="null"
      title="编辑申请材料"
      :mask-closable="!busy"
    >
      <form class="material-editor" @submit.prevent="saveMaterial">
        <label>材料名称<Input
            v-model:value="title"
            :maxlength="240"
            :disabled="busy"
/></label><label>补充说明<Input.TextArea
            v-model:value="notes"
            :maxlength="4000"
            :disabled="busy"
/></label><Button html-type="submit" type="primary" :loading="busy">
          保存材料
        </Button>
      </form>
    </Modal>
    <Modal
      v-model:open="mailEditor"
      :footer="null"
      title="邮件记录管理"
      width="min(1100px,100vw)"
      @cancel="refreshMail"
    >
      <ProfessorMail
        v-if="teacher && mailEditor"
        :professor-id="teacher"
        :experience-id="contactBinding"
        :context-id="state?.id"
        @recorded="recordMails"
        :email="teachers.find((p) => p.id === teacher)?.email || ''"
      />
    </Modal>
  </section>
  <section v-else class="search-empty">
    <h1>申请研究室不存在</h1>
    <RouterLink to="/japan-grad/journey">返回修考之路</RouterLink>
  </section>
</template>
<style scoped>
.application-split {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
  gap: 24px;
  align-items: start;
}

.application-split > * {
  min-width: 0;
}

.application-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin: 12px 0;
}

.application-tools .ant-select {
  min-width: 220px;
  max-width: 100%;
}

.material-list {
  display: grid;
  gap: 8px;
  padding: 0;
  margin: 16px 0;
  list-style: none;
}

.material-list li {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 10px;
  border: 1px solid var(--jg-line);
  border-radius: 6px;
}

.material-list .selected {
  background: var(--jg-subtle);
}

.material-name {
  flex: 1;
  text-align: left;
  overflow-wrap: anywhere;
}

.material-drop {
  display: grid;
  gap: 12px;
  padding: 20px;
  margin: 16px 0;
  font-size: 12px;
  border: 1px dashed var(--jg-border);
  border-radius: 8px;
}

.material-editor {
  display: grid;
  gap: 16px;
  padding-top: 16px;
}

.material-editor label {
  display: grid;
  gap: 8px;
}

.mail-body {
  margin: 16px 0;
}

.mail-body p {
  font-size: 11px;
  color: var(--jg-muted);
}

.mail-body pre {
  font: 13px/1.8 var(--jg-font);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

@media (max-width: 900px) {
  .application-split {
    grid-template-columns: 1fr;
  }

  .material-list li {
    flex-wrap: wrap;
  }
}
</style>
