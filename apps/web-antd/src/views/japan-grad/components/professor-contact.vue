<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { App, Button, Input, Select } from 'ant-design-vue';
import type {
  ContactStatus,
  ProfessorContact as ContactFields,
} from '../application-planning';
import {
  CONTACT_OPTIONS,
  CONTACT_STATUSES,
  contactWithStatus,
  emptyContact,
  firstMailTemplate,
  normalizedContact,
} from '../application-planning';
import { useExplorerStore } from '../explorer';
import { vAccessibleSelect } from '../select-accessibility';
import ContactStatusBadge from './contact-status.vue';
const props = defineProps<{ professorId?: string; labId?: string }>();
const emit = defineEmits<{ saved: [] }>();
const store = useExplorerStore();
const { message } = App.useApp();
const saving = ref(false);
const feedback = ref('');
const selectedId = ref('');
const drafts = ref<Record<string, ContactFields>>({});
const people = computed(() =>
  props.professorId
    ? store.professors.filter((item) => item.id === props.professorId)
    : store.professorsForLab(props.labId ?? ''),
);
const person = computed(() =>
  people.value.find((item) => item.id === selectedId.value),
);
const form = computed(() => drafts.value[selectedId.value] ?? emptyContact());
function prepare() {
  if (!people.value.some((item) => item.id === selectedId.value))
    selectedId.value =
      props.professorId ||
      store.labs.find((item) => item.id === props.labId)?.mainProfessorId ||
      people.value[0]?.id ||
      '';
  if (person.value && !drafts.value[person.value.id])
    drafts.value[person.value.id] = normalizedContact(person.value.contact);
}
watch([people, selectedId], prepare, { immediate: true });
function changeStatus(value: unknown) {
  if (
    typeof value === 'string' &&
    CONTACT_STATUSES.includes(value as ContactStatus)
  )
    Object.assign(
      form.value,
      contactWithStatus(form.value, value as ContactStatus),
    );
}
function insertTemplate() {
  if (!person.value) return;
  const template = firstMailTemplate(person.value.name);
  if (!form.value.draftSubject) form.value.draftSubject = template.subject;
  form.value.draftBody = [form.value.draftBody, template.body]
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
    message.success('草稿已复制，请在邮件客户端检查后发送。');
  } catch {
    message.error('复制失败，可以直接选择正文复制。');
  }
}
async function save() {
  if (!person.value || saving.value) return;
  saving.value = true;
  feedback.value = '';
  try {
    await store.saveProfessorContact(
      person.value.id,
      { ...form.value },
      props.labId,
    );
    message.success('教授联络记录已保存');
    emit('saved');
  } catch (error) {
    feedback.value = error instanceof Error ? error.message : '保存失败。';
  } finally {
    saving.value = false;
  }
}
</script>
<template>
  <form v-if="person" class="professor-contact-form" @submit.prevent="save">
    <div class="planner-contact-heading">
      <div>
        <h3>教授联络与第一封信</h3>
        <p>
          记录进展、回复要点与约定时间，点击保存后写入本地。以下日期、面试时间按日本时间（JST）填写。
        </p>
      </div>
      <ContactStatusBadge :contact="form" compact />
    </div>
    <div v-if="!professorId" class="field">
      <label :for="`contact-person-${labId}`">主要联系老师</label
      ><Select
        v-accessible-select
        :id="`contact-person-${labId}`"
        v-model:value="selectedId"
        :disabled="saving"
        :options="
          people.map((item) => ({
            label: [item.name, item.title].filter(Boolean).join(' · '),
            value: item.id,
          }))
        "
      />
    </div>
    <p class="planner-muted">
      {{ person.name }}<span v-if="person.email"> · {{ person.email }}</span>
    </p>
    <div class="planner-form-grid">
      <div class="field">
        <label :for="`contact-state-${person.id}`">联系状态</label
        ><Select
          v-accessible-select
          :id="`contact-state-${person.id}`"
          :value="form.status"
          :options="CONTACT_OPTIONS"
          :disabled="saving"
          @change="changeStatus"
        />
      </div>
      <div class="field">
        <label :for="`contact-planned-${person.id}`">计划首次联系</label
        ><Input
          :id="`contact-planned-${person.id}`"
          v-model:value="form.plannedDate"
          type="date"
          :disabled="saving"
        />
      </div>
      <div class="field">
        <label :for="`contact-sent-${person.id}`">首封发送日期</label
        ><Input
          :id="`contact-sent-${person.id}`"
          v-model:value="form.firstSentDate"
          type="date"
          :disabled="saving"
        />
      </div>
      <div class="field">
        <label :for="`contact-interview-${person.id}`"
          >教授面试约定（JST）</label
        ><Input
          :id="`contact-interview-${person.id}`"
          v-model:value="form.interviewAt"
          type="datetime-local"
          :disabled="saving"
        />
      </div>
      <div class="field">
        <label :for="`contact-consent-${person.id}`">内诺取得日期</label
        ><Input
          :id="`contact-consent-${person.id}`"
          v-model:value="form.consentDate"
          type="date"
          :disabled="saving"
        />
      </div>
      <div class="field">
        <label :for="`contact-followup-${person.id}`">下次跟进日期</label
        ><Input
          :id="`contact-followup-${person.id}`"
          v-model:value="form.followUpDate"
          type="date"
          :disabled="saving"
        />
      </div>
    </div>
    <div class="field">
      <label :for="`contact-reply-${person.id}`">教授回复要点</label
      ><Input.TextArea
        :id="`contact-reply-${person.id}`"
        v-model:value="form.replySummary"
        :rows="3"
        :maxlength="8000"
        :disabled="saving"
        placeholder="研究匹配、是否接收、追加材料、面试安排……"
      />
    </div>
    <div class="planner-inline-actions">
      <h4>第一封信草稿（第一通メール）</h4>
      <Button :disabled="saving" @click="insertTemplate">插入日文模板</Button
      ><Button :disabled="!form.draftBody || saving" @click="copyDraft"
        >复制草稿</Button
      >
    </div>
    <div class="field">
      <label :for="`contact-subject-${person.id}`">邮件主题</label
      ><Input
        :id="`contact-subject-${person.id}`"
        v-model:value="form.draftSubject"
        :maxlength="240"
        :disabled="saving"
      />
    </div>
    <div class="field">
      <label :for="`contact-body-${person.id}`">邮件正文</label
      ><Input.TextArea
        :id="`contact-body-${person.id}`"
        v-model:value="form.draftBody"
        :rows="10"
        :maxlength="20000"
        :disabled="saving"
        placeholder="模板中的方括号内容需要替换成自己的信息。草稿保存到本地，复制后由你自行发送。"
      />
    </div>
    <div class="field">
      <label :for="`contact-notes-${person.id}`">联络备注</label
      ><Input.TextArea
        :id="`contact-notes-${person.id}`"
        v-model:value="form.notes"
        :rows="2"
        :maxlength="4000"
        :disabled="saving"
      />
    </div>
    <p v-if="feedback" class="form-error" role="alert">{{ feedback }}</p>
    <div class="planner-form-footer">
      <span>保存当前老师记录；发送邮件后再更新状态。</span
      ><Button type="primary" html-type="submit" :loading="saving"
        >保存联络记录</Button
      >
    </div>
  </form>
  <div v-else class="collection-empty">
    <h3>尚未添加联系老师</h3>
    <p>先在研究室内添加老师，之后即可保存联络状态与邮件草稿。</p>
  </div>
</template>
