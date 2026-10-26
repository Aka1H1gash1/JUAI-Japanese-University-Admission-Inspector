<script setup lang="ts">
import type {
  ProfessorContact as ContactRecord,
  ContactStatus,
} from '../application-planning';

import { computed, ref, watch } from 'vue';

import { useEventListener, useIntervalFn } from '@vueuse/core';
import { App, Button, Input, Modal, Select } from 'ant-design-vue';
import { storeToRefs } from 'pinia';

import {
  CONTACT_EDITABLE_FIELDS,
  CONTACT_LABELS,
  CONTACT_OPTIONS,
  CONTACT_RESULT_LABELS,
  CONTACT_STATUSES,
  emptyContact,
  firstMailTemplate,
  normalizedContact,
} from '../application-planning';
import { useCommunicationsStore } from '../communications';
import { fileUrl } from '../documents';
import { useExplorerStore } from '../explorer';
import { labContext, labPath } from '../lab-targets';
import { requireValue } from '../required-value';
import { vAccessibleSelect } from '../select-accessibility';
import ConsentFiles from './consent-files.vue';
import ContactStatusBadge from './contact-status.vue';
import ProfessorMail from './professor-mail.vue';
const props = defineProps<{ professorId?: string; labId?: string }>();
const emit = defineEmits<{ saved: [] }>();
const sources = useCommunicationsStore();
const store = useExplorerStore();
const { message } = App.useApp();
const busy = ref(false);
const experienceId = ref('');
const feedback = ref('');
const newOpen = ref(false);
const newTitle = ref('');
const personId = ref('');
const viewStage = ref<ContactStatus>('not_contacted');
const { contactDrafts: drafts } = storeToRefs(sources);
const people = computed(() =>
  props.professorId
    ? store.professors.filter((p) => p.id === props.professorId)
    : store.professorsForLab(props.labId || ''),
);
const person = computed(() =>
  people.value.find((p) => p.id === personId.value),
);
const experiences = computed(() =>
  person.value
    ? [
        normalizedContact(person.value.contact),
        ...(person.value.contactHistory ?? []).map((item) =>
          normalizedContact(item),
        ),
      ]
    : [],
);
const live = computed(() =>
  experiences.value.find((c) => c.experienceId === experienceId.value),
);
const draft = computed(() => drafts.value[experienceId.value]);
const form = computed(() => draft.value?.value ?? emptyContact());
const dirty = computed(
  () =>
    !!draft.value &&
    CONTACT_EDITABLE_FIELDS.some(
      (key) =>
        JSON.stringify(form.value[key]) !==
        JSON.stringify(requireValue(draft.value).base[key]),
    ),
);
const mailRows = computed(() =>
  person.value
    ? sources.forExperience(person.value.id, experienceId.value)
    : [],
);
const firstMail = computed(() =>
  mailRows.value.find((m) => m.direction === 'sent'),
);
const received = computed(() =>
  mailRows.value.filter((m) => m.direction === 'received'),
);
const consentMail = computed(() =>
  received.value.find((m) => m.id === form.value.consentEmailId),
);
const resultMail = computed(() =>
  received.value.find((m) => m.id === form.value.resultEmailId),
);
const paperRows = computed(() =>
  person.value ? sources.papers(person.value.id) : [],
);
const target = computed(() =>
  person.value?.labId ? labContext(store, person.value.labId) : undefined,
);
const commonLanguage = computed(
  () =>
    target.value?.lab.languageRequirements?.trim() ||
    target.value?.major.languageRequirements ||
    '',
);
const commonRequirements = computed(() => {
  const fields = sources.requirements[person.value?.majorId || ''] ?? {};
  return [
    commonLanguage.value ? `语言要求：${commonLanguage.value}` : '',
    target.value?.major.applicationMaterials
      ? `材料要求：${target.value.major.applicationMaterials}`
      : '',
    target.value?.lab.applicationNotes
      ? `研究室要求：${target.value.lab.applicationNotes}`
      : '',
    fields.eligibility ? `申请资格：${fields.eligibility}` : '',
    fields.professorContactRequirement
      ? `事前联络要求：${fields.professorContactRequirement}`
      : '',
    fields.submissionMethod ? `提交方式：${fields.submissionMethod}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
});
const profilePath = computed(() =>
  person.value && target.value
    ? `${labPath(target.value)}/professors/${person.value.id}`
    : '/japan-grad/universities',
);
const emailOptions = computed(() => [
  { value: '', label: '手动保存原文 / 尚未选择' },
  ...received.value.map((m) => ({
    value: m.id,
    label: `${m.date.replace('T', ' ')} · ${m.subject}`,
  })),
]);
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}
function prepare() {
  if (!people.value.some((p) => p.id === personId.value))
    personId.value =
      props.professorId ||
      store.labs.find((l) => l.id === props.labId)?.mainProfessorId ||
      people.value[0]?.id ||
      '';
  if (!experiences.value.some((c) => c.experienceId === experienceId.value))
    experienceId.value = person.value?.contact?.experienceId || '';
  const current = live.value;
  if (!current?.experienceId) return;
  const old = drafts.value[current.experienceId];
  if (!old) {
    drafts.value[current.experienceId] = {
      value: clone(current),
      base: clone(current),
      conflict: false,
    };
    viewStage.value = current.status;
    return;
  }
  if (old.base.version !== current.version) {
    const changed = CONTACT_EDITABLE_FIELDS.filter(
      (key) => JSON.stringify(old.value[key]) !== JSON.stringify(old.base[key]),
    );
    if (
      changed.some(
        (key) => JSON.stringify(old.base[key]) !== JSON.stringify(current[key]),
      )
    ) {
      old.conflict = true;
      return;
    }
    const next = clone(current);
    for (const key of changed)
      Object.assign(next, { [key]: clone(old.value[key]) });
    drafts.value[current.experienceId] = {
      value: next,
      base: clone(current),
      conflict: false,
    };
    if (changed.length === 0) viewStage.value = current.status;
  }
}
watch(
  () => [
    people.value.map((p) => p.id).join('|'),
    personId.value,
    experienceId.value,
    experiences.value.map((c) => `${c.experienceId}:${c.version}`).join('|'),
  ],
  prepare,
  { immediate: true },
);
watch(experienceId, () => {
  viewStage.value = live.value?.status || 'not_contacted';
  feedback.value = '';
});
watch(
  personId,
  (id) => {
    if (id) void sources.load([id]);
  },
  { immediate: true },
);
let refreshing = false;
async function refreshSources() {
  if (refreshing || !person.value || document.visibilityState === 'hidden')
    return;
  refreshing = true;
  try {
    await store.refresh();
    await sources.load([person.value.id]);
  } catch (error) {
    feedback.value =
      error instanceof Error ? error.message : '关联资料更新失败。';
  } finally {
    refreshing = false;
  }
}
useIntervalFn(() => void refreshSources(), 15_000);
useEventListener(window, 'focus', () => void refreshSources());
function reload() {
  if (!live.value) return;
  drafts.value[experienceId.value] = {
    value: clone(live.value),
    base: clone(live.value),
    conflict: false,
  };
  viewStage.value = live.value.status;
  feedback.value = '';
}
function setStage(value: unknown) {
  if (
    typeof value === 'string' &&
    CONTACT_STATUSES.includes(value as ContactStatus)
  ) {
    form.value.status = value as ContactStatus;
    viewStage.value = value as ContactStatus;
  }
}
function dateValue(actual = false) {
  return actual
    ? form.value.actualInterviewDate ||
        form.value.actualInterviewAt.slice(0, 10)
    : form.value.interviewDate || form.value.interviewAt.slice(0, 10);
}
function timeValue(actual = false) {
  return (actual ? form.value.actualInterviewAt : form.value.interviewAt).slice(
    11,
    16,
  );
}
function setInterviewDate(value: string, actual = false) {
  const time = timeValue(actual);
  if (actual) {
    form.value.actualInterviewDate = value;
    form.value.actualInterviewAt = value && time ? `${value}T${time}` : '';
  } else {
    form.value.interviewDate = value;
    form.value.interviewAt = value && time ? `${value}T${time}` : '';
  }
}
function setInterviewTime(value: string, actual = false) {
  const day = dateValue(actual);
  if (value && !day) {
    feedback.value = '请先填写面试日期。';
    return;
  }
  if (actual) {
    form.value.actualInterviewDate = day;
    form.value.actualInterviewAt = day && value ? `${day}T${value}` : '';
  } else {
    form.value.interviewDate = day;
    form.value.interviewAt = day && value ? `${day}T${value}` : '';
  }
}
function chooseMail(id: unknown, result = false) {
  if (typeof id !== 'string') return;
  const mail = received.value.find((m) => m.id === id);
  if (result) {
    form.value.resultEmailId = id;
    if (mail && !form.value.resultDate)
      form.value.resultDate = mail.date.slice(0, 10);
  } else {
    form.value.consentEmailId = id;
    if (mail && !form.value.consentDate)
      form.value.consentDate = mail.date.slice(0, 10);
  }
}
function addQuestion() {
  if (form.value.interviewQA.length < 30)
    form.value.interviewQA.push({
      id: crypto.randomUUID(),
      question: '',
      answer: '',
    });
}
function template() {
  const value = firstMailTemplate(person.value?.name || '');
  if (!form.value.draftSubject) form.value.draftSubject = value.subject;
  form.value.draftBody = [form.value.draftBody, value.body]
    .filter(Boolean)
    .join('\n\n');
}
async function copyDraft() {
  try {
    await navigator.clipboard.writeText(
      [form.value.draftSubject, form.value.draftBody]
        .filter(Boolean)
        .join('\n\n'),
    );
    message.success('草稿已复制，请自行检查后发送。');
  } catch {
    feedback.value = '复制未完成，可以直接选择文字复制。';
  }
}
async function save(stage?: ContactStatus) {
  if (!person.value || !live.value || !draft.value || busy.value) return;
  if (stage) form.value.status = stage;
  busy.value = true;
  feedback.value = '';
  try {
    const next = clone(form.value);
    next.interviewQA = next.interviewQA
      .filter((q) => q.question.trim() || q.answer.trim())
      .map((q) => ({ ...q, question: q.question.trim() }));
    const patch = Object.fromEntries(
      CONTACT_EDITABLE_FIELDS.filter(
        (key) =>
          JSON.stringify(next[key]) !==
          JSON.stringify(requireValue(draft.value).base[key]),
      ).map((key) => [key, next[key]]),
    ) as Partial<ContactRecord>;
    const result = await store.updateContactExperience(
      person.value.id,
      experienceId.value,
      patch,
      draft.value.base,
      person.value.contact?.experienceId === experienceId.value &&
        !props.professorId
        ? props.labId
        : '',
    );
    drafts.value[experienceId.value] = {
      value: clone(result.experience),
      base: clone(result.experience),
      conflict: false,
    };
    viewStage.value = result.experience.status;
    await sources.load([person.value.id]);
    message.success('考学记录已保存');
    emit('saved');
  } catch (error) {
    feedback.value = error instanceof Error ? error.message : '保存失败。';
  } finally {
    busy.value = false;
  }
}
function newExperience() {
  newTitle.value = `${person.value?.name || ''} · 新的考学经历`;
  newOpen.value = true;
}
async function create() {
  if (!person.value || busy.value) return;
  busy.value = true;
  feedback.value = '';
  try {
    const result = await store.createContactExperience(
      person.value.id,
      newTitle.value,
      props.professorId ? undefined : props.labId,
    );
    experienceId.value = result.experience.experienceId;
    newOpen.value = false;
    await sources.load([person.value.id]);
    message.success('已建立新的经历，上一段记录已保留。');
  } catch (error) {
    feedback.value = error instanceof Error ? error.message : '新建失败。';
  } finally {
    busy.value = false;
  }
}
function summary(status: ContactStatus) {
  const c = form.value;
  return {
    not_contacted:
      person.value?.research || target.value?.lab.research || '研究方向待补充',
    first_sent:
      firstMail.value?.subject || c.draftSubject || '尚无首封邮件记录',
    replied: `${mailRows.value.length} 封来往信件`,
    interview_scheduled: (
      c.interviewAt ||
      c.interviewDate ||
      '预约时间待填写'
    ).replace('T', ' '),
    interview_completed: `${(c.actualInterviewAt || c.actualInterviewDate || '实际面试时间待填写').replace('T', ' ')} · ${c.interviewQA.length} 条问答`,
    consent: `${c.consentDate || '日期待填写'} · ${consentMail.value?.subject || (c.consentOriginal ? '已保存原文' : '原文待关联')}`,
    closed: `${CONTACT_RESULT_LABELS[c.finalResult]}${c.resultDate ? ` · ${c.resultDate}` : ''}`,
  }[status];
}
</script>
<template>
  <section v-if="person && live && draft" class="contact-experience">
    <header class="experience-heading">
      <div>
        <h3>{{ form.experienceTitle || `${person.name} · 考学经历` }}</h3>
        <p>
          {{ target?.university.name }} · {{ target?.lab.name }} ·
          {{ person.name }}
        </p>
      </div>
      <ContactStatusBadge :contact="live" compact />
    </header>
    <div class="experience-selectors">
      <label v-if="!professorId">联系老师<Select
          v-accessible-select
          v-model:value="personId"
          :options="people.map((p) => ({ value: p.id, label: p.name }))"
          :disabled="busy || store.saving"
/></label><label>考学经历<Select
          v-accessible-select
          v-model:value="experienceId"
          :options="
            experiences.map((c) => ({
              value: c.experienceId,
              label: `${c.experienceTitle}${c.experienceId === person!.contact?.experienceId ? '（当前）' : '（历史）'}`,
            }))
          "
          :disabled="busy || store.saving"
/></label><Button :disabled="busy || store.saving || dirty" @click="newExperience">
        新建一段经历
      </Button>
    </div>
    <div class="experience-base">
      <label>经历名称<Input
          v-model:value="form.experienceTitle"
          :maxlength="160"
          :disabled="busy"
/></label><label>当前阶段<Select
          v-accessible-select
          :value="form.status"
          :options="CONTACT_OPTIONS"
          :disabled="busy"
          @change="setStage"
      /></label>
    </div>
    <p v-if="sources.error" class="form-error" role="alert">
      {{ sources.error }}
      <Button size="small" @click="refreshSources">重试关联资料</Button>
    </p>
    <p v-if="draft.conflict" class="form-error">
      这段记录有新的修改。你的填写已保留，请核对后重新读取。<Button
        size="small"
        @click="reload"
      >
        重新读取记录
      </Button>
    </p>
    <nav class="experience-stage-tabs" aria-label="查看不同阶段的记录">
      <button
        v-for="status in CONTACT_STATUSES"
        :key="status"
        type="button"
        :class="{
          'is-selected': viewStage === status,
          'is-current': form.status === status,
        }"
        :aria-pressed="viewStage === status"
        @click="viewStage = status"
      >
        {{ CONTACT_LABELS[status] }}
      </button>
    </nav>
    <header class="experience-section-heading">
      <h4>{{ CONTACT_LABELS[viewStage] }} · 阶段内容</h4>
      <Button
        v-if="viewStage !== form.status"
        type="link"
        size="small"
        :disabled="busy"
        @click="setStage(viewStage)"
      >
        设为当前阶段
      </Button>
    </header>
    <table class="experience-stage-table">
      <tbody>
        <template v-if="viewStage === 'not_contacted'">
          <tr>
            <th scope="row">研究方向</th>
            <td>
              <p>
                {{
                  person.research || target?.lab.research || '尚未填写研究方向'
                }}
              </p>
              <RouterLink :to="`${profilePath}?tab=profile`">
                查看老师资料 →
              </RouterLink>
            </td>
          </tr>
          <tr>
            <th scope="row">老师论文</th>
            <td>
              <ul v-if="paperRows.length" class="experience-paper-list">
                <li v-for="paper in paperRows" :key="paper.id">
                  <a
                    :href="fileUrl(paper.id)"
                    target="_blank"
                    rel="noopener noreferrer"
                    >{{ paper.title }} ↗</a><small>{{ paper.year }} 年{{
                      paper.venue ? ` · ${paper.venue}` : ''
                    }}</small>
                </li>
              </ul>
              <p v-else class="planner-muted">尚未归档论文</p>
              <RouterLink :to="`${profilePath}?tab=papers`">
                进入老师论文库 →
              </RouterLink>
            </td>
          </tr>
          <tr>
            <th scope="row">共同报考要求</th>
            <td>
              <p>{{ commonRequirements || '尚未填写语言或研究室出愿要求' }}</p>
            </td>
          </tr>
          <tr>
            <th scope="row">教授联络要求</th>
            <td>
              <Input.TextArea
                v-model:value="form.requirements"
                :rows="4"
                :maxlength="8000"
                :disabled="busy"
                placeholder="事前联络方式、研究匹配、材料或老师的具体要求"
              />
            </td>
          </tr>
          <tr>
            <th scope="row">计划首次联络</th>
            <td>
              <Input
                v-model:value="form.plannedDate"
                type="date"
                :disabled="busy"
              />
            </td>
          </tr>
        </template>
        <template v-if="viewStage === 'first_sent'">
          <tr>
            <th scope="row">首封发送日期</th>
            <td>
              <Input
                v-model:value="form.firstSentDate"
                type="date"
                :disabled="busy"
              /><small>默认读取已归档首封日期，也可手动修正。</small>
            </td>
          </tr>
          <tr>
            <th scope="row">已发第一封原文</th>
            <td v-if="firstMail">
              <strong>{{ firstMail.subject }}</strong><small>{{ firstMail.date.replace('T', ' ') }} · 原邮件记录时间</small>
              <pre class="experience-original">{{ firstMail.body }}</pre>
            </td>
            <td v-else>
              <p class="planner-muted">
                尚未在“邮件往来”保存已发送邮件。下方为草稿，未作为已发送原文。
              </p>
            </td>
          </tr>
        </template>
        <template v-if="viewStage === 'replied'">
          <tr>
            <th scope="row">来往信件</th>
            <td>
              <p>
                {{ mailRows.length }} 封 · 已发
                {{ mailRows.filter((m) => m.direction === 'sent').length }} 封 /
                收到 {{ received.length }} 封
              </p>
              <ProfessorMail
                :professor-id="person.id"
                :email="person.email"
                :experience-id="experienceId"
              />
            </td>
          </tr>
          <tr>
            <th scope="row">回复要点</th>
            <td>
              <Input.TextArea
                v-model:value="form.replySummary"
                :rows="4"
                :maxlength="8000"
                :disabled="busy"
                placeholder="整理教授回复与后续需要处理的事项；邮件原文保持关联显示。"
              />
            </td>
          </tr>
        </template>
        <template
          v-if="
            viewStage === 'interview_scheduled' ||
            viewStage === 'interview_completed'
          "
        >
          <tr>
            <th scope="row">预约面试时间</th>
            <td>
              <div class="experience-date-inputs">
                <Input
                  :value="dateValue()"
                  type="date"
                  :disabled="busy"
                  aria-label="预约面试日期"
                  @change="
                    setInterviewDate(($event.target as HTMLInputElement).value)
                  "
                /><Input
                  :value="timeValue()"
                  type="time"
                  :disabled="busy"
                  aria-label="预约面试时间"
                  @change="
                    setInterviewTime(($event.target as HTMLInputElement).value)
                  "
                />
              </div>
              <small>日本时间（JST），不知道具体时刻时可仅填写日期。</small>
            </td>
          </tr>
          <tr>
            <th scope="row">面试准备</th>
            <td>
              <Input.TextArea
                v-model:value="form.interviewPreparation"
                :rows="6"
                :maxlength="12000"
                :disabled="busy"
                placeholder="研究计划、自我介绍、论文阅读、预想问题与准备材料……"
              />
            </td>
          </tr>
        </template>
        <template v-if="viewStage === 'interview_completed'">
          <tr>
            <th scope="row">实际面试时间</th>
            <td>
              <div class="experience-date-inputs">
                <Input
                  :value="dateValue(true)"
                  type="date"
                  :disabled="busy"
                  aria-label="实际面试日期"
                  @change="
                    setInterviewDate(
                      ($event.target as HTMLInputElement).value,
                      true,
                    )
                  "
                /><Input
                  :value="timeValue(true)"
                  type="time"
                  :disabled="busy"
                  aria-label="实际面试时间"
                  @change="
                    setInterviewTime(
                      ($event.target as HTMLInputElement).value,
                      true,
                    )
                  "
                />
              </div>
              <Button
                size="small"
                type="link"
                :disabled="busy"
                @click="
                  setInterviewDate(dateValue(), true);
                  setInterviewTime(timeValue(), true);
                "
              >
                使用预约时间
              </Button>
            </td>
          </tr>
          <tr>
            <th scope="row">问题与回答</th>
            <td>
              <article
                v-for="(entry, index) in form.interviewQA"
                :key="entry.id"
                class="experience-qa"
              >
                <header>
                  <strong>问题 {{ index + 1 }}</strong><Button
                    size="small"
                    type="text"
                    danger
                    :disabled="busy"
                    @click="
                      form.interviewQA = form.interviewQA.filter(
                        (q) => q.id !== entry.id,
                      )
                    "
                  >
                    移除
                  </Button>
                </header>
                <Input.TextArea
                  v-model:value="entry.question"
                  :rows="2"
                  :maxlength="2000"
                  :disabled="busy"
                  placeholder="面试问了什么？"
                  :aria-label="`面试问题 ${index + 1}`"
                /><Input.TextArea
                  v-model:value="entry.answer"
                  :rows="3"
                  :maxlength="6000"
                  :disabled="busy"
                  placeholder="我的回答与后续改进"
                  :aria-label="`面试回答 ${index + 1}`"
                />
              </article>
              <Button
                :disabled="busy || form.interviewQA.length >= 30"
                @click="addQuestion"
              >
                新增问答（{{ form.interviewQA.length }}/30）
              </Button>
            </td>
          </tr>
          <tr>
            <th scope="row">面试复盘</th>
            <td>
              <Input.TextArea
                v-model:value="form.interviewNotes"
                :rows="4"
                :maxlength="8000"
                :disabled="busy"
                placeholder="教授反馈、需要补充的资料、自己的复盘……"
              />
            </td>
          </tr>
        </template>
        <template v-if="viewStage === 'consent'">
          <tr>
            <th scope="row">内诺确认日期</th>
            <td>
              <Input
                v-model:value="form.consentDate"
                type="date"
                :disabled="busy"
              />
            </td>
          </tr>
          <tr>
            <th scope="row">内诺邮件原文</th>
            <td>
              <Select
                v-accessible-select
                :value="form.consentEmailId"
                :options="emailOptions"
                :disabled="busy"
                aria-label="选择内诺邮件"
                @change="chooseMail($event)"
              /><template v-if="consentMail">
                <strong>{{ consentMail.subject }}</strong><small>{{ consentMail.date.replace('T', ' ') }} ·
                  来自老师邮件往来</small>
                <pre class="experience-original">{{
                  consentMail.body
                }}</pre>
</template><template v-else>
                <small v-if="form.consentSourceNote">{{
                  form.consentSourceNote
                }}</small><Input.TextArea
                  v-model:value="form.consentOriginal"
                  :rows="7"
                  :maxlength="100000"
                  :disabled="busy"
                  placeholder="也可手动保存内诺邮件原文；已归档的来信可直接在上方关联。"
                />
              </template>
            </td>
          </tr>
          <tr>
            <th scope="row">签署的内诺文件</th>
            <td>
              <ConsentFiles
                :professor-id="person.id"
                :experience-id="experienceId"
              />
            </td>
          </tr>
        </template>
        <template v-if="viewStage === 'closed'">
          <tr>
            <th scope="row">最终结果</th>
            <td>
              <Select
                v-accessible-select
                v-model:value="form.finalResult"
                :options="
                  Object.entries(CONTACT_RESULT_LABELS).map(
                    ([value, label]) => ({ value, label }),
                  )
                "
                :disabled="busy"
                aria-label="最终考学结果"
              />
            </td>
          </tr>
          <tr>
            <th scope="row">结果日期</th>
            <td>
              <Input
                v-model:value="form.resultDate"
                type="date"
                :disabled="busy"
              />
            </td>
          </tr>
          <tr>
            <th scope="row">结果说明</th>
            <td>
              <Input.TextArea
                v-model:value="form.resultNotes"
                :rows="5"
                :maxlength="8000"
                :disabled="busy"
                placeholder="结果、结束原因及这段经历的总结"
              />
            </td>
          </tr>
          <tr>
            <th scope="row">结果邮件原文</th>
            <td>
              <Select
                v-accessible-select
                :value="form.resultEmailId"
                :options="emailOptions"
                :disabled="busy"
                aria-label="选择结果邮件"
                @change="chooseMail($event, true)"
              /><template v-if="resultMail">
                <strong>{{ resultMail.subject }}</strong>
                <pre class="experience-original">{{
                  resultMail.body
                }}</pre>
</template><template v-else>
                <small v-if="form.resultSourceNote">{{
                  form.resultSourceNote
                }}</small><Input.TextArea
                  v-model:value="form.resultOriginal"
                  :rows="5"
                  :maxlength="100000"
                  :disabled="busy"
                  placeholder="可选，手动保存结果邮件原文"
                />
              </template>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
    <details
      v-if="['not_contacted', 'first_sent'].includes(viewStage)"
      class="experience-extra"
    >
      <summary>第一封信草稿</summary>
      <div class="experience-draft-actions">
        <Button size="small" :disabled="busy" @click="template">
          插入日文模板
</Button><Button
          size="small"
          :disabled="busy || !form.draftBody"
          @click="copyDraft"
        >
          复制草稿
        </Button>
      </div>
      <Input
        v-model:value="form.draftSubject"
        :maxlength="240"
        :disabled="busy"
        placeholder="邮件主题"
        aria-label="第一封信草稿主题"
      /><Input.TextArea
        v-model:value="form.draftBody"
        :rows="9"
        :maxlength="20000"
        :disabled="busy"
        placeholder="第一封信草稿正文"
        aria-label="第一封信草稿正文"
      />
    </details>
    <details v-if="viewStage !== 'replied'" class="experience-extra">
      <summary>邮件往来 · {{ mailRows.length }} 封（自动关联）</summary>
      <ProfessorMail
        :professor-id="person.id"
        :email="person.email"
        :experience-id="experienceId"
      />
    </details>
    <div class="experience-followup">
      <label>下次跟进日期<Input
          v-model:value="form.followUpDate"
          type="date"
          :disabled="busy"
/></label><label>联络备注<Input.TextArea
          v-model:value="form.notes"
          :rows="2"
          :maxlength="4000"
          :disabled="busy"
      /></label>
    </div>
    <details class="experience-extra">
      <summary>完整经历总表</summary>
      <div class="experience-overview-scroll">
        <table class="experience-overview">
          <thead>
            <tr>
              <th>阶段</th>
              <th>主要记录</th>
              <th>查看</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="status in CONTACT_STATUSES" :key="status">
              <th scope="row">{{ CONTACT_LABELS[status] }}</th>
              <td>{{ summary(status) }}</td>
              <td>
                <Button size="small" type="link" @click="viewStage = status">
                  查看阶段
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <ol v-if="live.stageHistory.length" class="experience-stage-history">
        <li v-for="entry in live.stageHistory" :key="entry.id">
          <time>{{ new Date(entry.at).toLocaleString() }}</time><span>{{ CONTACT_LABELS[entry.status] }} · {{ entry.description }}</span>
        </li>
      </ol>
    </details>
    <p v-if="feedback" class="form-error" role="alert">{{ feedback }}</p>
    <footer class="experience-footer">
      <span>{{
        dirty ? '有未保存的修改' : '各阶段记录保留在同一段经历中'
      }}</span><Button
        v-if="viewStage === 'interview_scheduled'"
        :loading="busy"
        @click="save('interview_scheduled')"
      >
        保存面试预约
</Button><Button
        v-if="viewStage === 'interview_completed'"
        :loading="busy"
        @click="save('interview_completed')"
      >
        记录面试完成
</Button><Button
        v-if="viewStage === 'consent'"
        :loading="busy"
        @click="save('consent')"
      >
        确认内诺并保存
</Button><Button
        v-if="viewStage === 'closed'"
        :loading="busy"
        @click="save('closed')"
      >
        保存结果并结束经历
</Button><Button type="primary" :loading="busy || store.saving" @click="save()">
        保存整段经历
      </Button>
    </footer>
    <Modal
      v-model:open="newOpen"
      title="新建一段考学经历"
      :footer="null"
      :width="540"
      :closable="!busy"
      :mask-closable="!busy"
    >
      <p class="form-context">
        上一段经历、邮件和文件会保留，新经历从未联系开始。
      </p>
      <Input
        v-model:value="newTitle"
        :maxlength="160"
        aria-label="新考学经历名称"
      />
      <p v-if="feedback" class="form-error">{{ feedback }}</p>
      <div class="form-footer">
        <Button :disabled="busy" @click="newOpen = false">取消</Button><Button type="primary" :loading="busy" @click="create">
          建立新经历
        </Button>
      </div>
    </Modal>
  </section>
  <div v-else class="collection-empty">
    <h3>尚未添加联系老师</h3>
    <p>先在研究室添加老师，即可建立连续的考学记录。</p>
  </div>
</template>
<style scoped>
.contact-experience {
  min-width: 0;
}

.experience-heading {
  display: flex;
  gap: 16px;
  align-items: start;
  justify-content: space-between;
  margin-bottom: 20px;
}

.experience-heading h3 {
  margin: 0;
  font-size: 19px;
}

.experience-heading p {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--jg-muted);
}

.experience-selectors,
.experience-base {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr)) auto;
  gap: 14px;
  align-items: end;
  margin: 16px 0;
}

.experience-base {
  grid-template-columns: minmax(0, 1.5fr) minmax(180px, 1fr);
}

.experience-selectors label,
.experience-base label,
.experience-followup label {
  display: grid;
  gap: 7px;
  font-size: 13px;
  color: var(--jg-secondary);
}

.experience-stage-tabs {
  display: flex;
  gap: 8px;
  padding: 12px 0 18px;
  overflow-x: auto;
  border-bottom: 1px solid var(--jg-line);
}

.experience-stage-tabs button {
  padding: 8px 12px;
  color: var(--jg-secondary);
  white-space: nowrap;
  cursor: pointer;
  background: var(--jg-surface);
  border: 1px solid var(--jg-line);
  border-radius: 6px;
}

.experience-stage-tabs button.is-current::before {
  display: inline-block;
  width: 5px;
  height: 5px;
  margin-right: 6px;
  content: '';
  background: var(--jg-accent);
  border-radius: 50%;
}

.experience-stage-tabs button.is-selected {
  color: var(--jg-accent-text);
  background: var(--jg-accent-soft);
  border-color: var(--jg-accent-line);
}

.experience-section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 18px 0;
}

.experience-section-heading h4 {
  margin: 0;
  font-size: 15px;
}

.experience-stage-table,
.experience-overview {
  width: 100%;
  overflow: hidden;
  border-spacing: 0;
  border-collapse: separate;
  border: 1px solid var(--jg-line);
  border-radius: 8px;
}

.experience-stage-table th,
.experience-stage-table td,
.experience-overview th,
.experience-overview td {
  padding: 16px;
  vertical-align: top;
  text-align: left;
  border-bottom: 1px solid var(--jg-line);
}

.experience-stage-table tbody > tr:last-child > *,
.experience-overview tbody > tr:last-child > * {
  border-bottom: 0;
}

.experience-stage-table th {
  width: 160px;
  font-size: 13px;
  font-weight: 500;
  color: var(--jg-secondary);
  background: var(--jg-subtle);
}

.experience-stage-table td {
  min-width: 0;
  background: var(--jg-surface);
}

.experience-stage-table p,
.experience-overview td {
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.experience-stage-table td > .ant-select {
  width: 100%;
  margin-bottom: 14px;
}

.experience-stage-table td > small,
.experience-paper-list small {
  display: block;
  margin-top: 7px;
  font-size: 12px;
  color: var(--jg-muted);
}

.experience-stage-table a {
  color: var(--jg-accent-text);
}

.experience-original {
  max-height: 340px;
  padding: 16px;
  margin: 14px 0 0;
  overflow: auto;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.8;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  background: var(--jg-subtle);
  border-radius: 6px;
}

.experience-paper-list {
  display: grid;
  gap: 12px;
  padding-left: 18px;
}

.experience-date-inputs {
  display: flex;
  gap: 12px;
}

.experience-date-inputs > * {
  max-width: 240px;
}

.experience-qa {
  padding-bottom: 16px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--jg-line);
}

.experience-qa header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}

.experience-qa textarea + textarea {
  margin-top: 8px;
}

.experience-extra {
  padding: 14px 16px;
  margin: 18px 0;
  border: 1px solid var(--jg-line);
  border-radius: 8px;
}

.experience-extra summary {
  font-size: 13px;
  color: var(--jg-secondary);
  cursor: pointer;
}

.experience-extra[open] > summary {
  margin-bottom: 18px;
}

.experience-draft-actions {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
}

.experience-extra > textarea {
  margin-top: 12px;
}

.experience-followup {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 16px;
  margin: 20px 0;
}

.experience-overview-scroll {
  overflow-x: auto;
}

.experience-overview {
  min-width: 550px;
  font-size: 13px;
}

.experience-overview th {
  font-weight: 500;
  background: var(--jg-subtle);
}

.experience-stage-history {
  display: grid;
  gap: 12px;
  padding-left: 20px;
  margin-top: 20px;
  font-size: 12px;
  color: var(--jg-muted);
}

.experience-stage-history time {
  margin-right: 12px;
}

.experience-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  justify-content: flex-end;
  padding-top: 18px;
  border-top: 1px solid var(--jg-line);
}

.experience-footer > span {
  margin-right: auto;
  font-size: 12px;
  color: var(--jg-muted);
}

@media (max-width: 760px) {
  .experience-selectors,
  .experience-base,
  .experience-followup {
    grid-template-columns: minmax(0, 1fr);
  }

  .experience-stage-table,
  .experience-stage-table tbody,
  .experience-stage-table tr,
  .experience-stage-table th,
  .experience-stage-table td {
    display: block;
    width: 100%;
  }

  .experience-stage-table th {
    padding-bottom: 10px;
    border-bottom: 0;
  }

  .experience-date-inputs {
    flex-wrap: wrap;
  }

  .experience-heading {
    flex-direction: column;
  }
}
</style>
