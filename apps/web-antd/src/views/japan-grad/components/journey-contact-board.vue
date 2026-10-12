<script setup lang="ts">
import { computed, watch } from 'vue';
import { useEventListener, useIntervalFn } from '@vueuse/core';
import { useCommunicationsStore } from '../communications';
import ContactStageContent from './contact-stage-content.vue';
import { App, Button, Select } from 'ant-design-vue';
import type { LabTarget } from '../lab-targets';
import type { ContactStatus } from '../application-planning';
import {
  CONTACT_LABELS,
  CONTACT_OPTIONS,
  CONTACT_STATUSES,
  normalizedContact,
} from '../application-planning';
import { labPath } from '../lab-targets';
import { useExplorerStore } from '../explorer';
import type { Professor } from '../explorer';
import { vAccessibleSelect } from '../select-accessibility';
import ContactStatusBadge from './contact-status.vue';
const props = defineProps<{ targets: LabTarget[] }>();
const emit = defineEmits<{ manage: [id: string, professorId?: string] }>();
const store = useExplorerStore();
const { message } = App.useApp();
const sources = useCommunicationsStore();
const professorIds = computed(() =>
  props.targets.flatMap((t) => t.professors.map((p) => p.id)),
);
watch(
  () => professorIds.value.join('|'),
  () => {
    void sources.load(professorIds.value);
  },
  { immediate: true },
);
let refreshing = false;
async function refresh() {
  if (refreshing || document.visibilityState === 'hidden') return;
  refreshing = true;
  try {
    await store.refresh();
    await sources.load(professorIds.value);
  } catch (e) {
    message.error(e instanceof Error ? e.message : '关联资料更新失败。');
  } finally {
    refreshing = false;
  }
}
useIntervalFn(() => void refresh(), 15000);
useEventListener(window, 'focus', () => void refresh());
type BoardEntry = { target: LabTarget; person?: Professor; key: string };
const entries = computed<BoardEntry[]>(() =>
  props.targets.flatMap<BoardEntry>((target) =>
    target.professors.length
      ? target.professors.map((person) => ({ target, person, key: person.id }))
      : [{ target, person: undefined, key: target.lab.id }],
  ),
);
function stage(entry: BoardEntry) {
  return normalizedContact(entry.person?.contact).status;
}
async function change(entry: BoardEntry, value: unknown) {
  const person = entry.person;
  if (
    !person ||
    typeof value !== 'string' ||
    !CONTACT_STATUSES.includes(value as ContactStatus)
  )
    return;
  try {
    const current = normalizedContact(person.contact);
    const result = await store.updateContactExperience(
      person.id,
      current.experienceId,
      { status: value as ContactStatus },
      current,
    );
    if (result.experience.status !== value)
      message.info('面试前阶段已按这段经历的实际收发邮件更新。');
    await sources.load([person.id]);
  } catch (error) {
    message.error(
      error instanceof Error ? error.message : '更新联系状态失败。',
    );
  }
}
function drag(event: DragEvent, entry: BoardEntry) {
  if (store.saving) {
    event.preventDefault();
    return;
  }
  event.dataTransfer?.setData('text/plain', entry.key);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
}
function drop(event: DragEvent, status: ContactStatus) {
  const entry = entries.value.find(
    (item) => item.key === event.dataTransfer?.getData('text/plain'),
  );
  if (entry && !store.saving) void change(entry, status);
}
</script>
<template>
  <section class="journey-contact-board" aria-label="教授联络看板">
    <p class="planner-view-description">
      按每位老师的当前考学阶段显示对应资料。邮件往来会联动面试前状态，面试与后续进展由你确认；每段经历的完整记录持续保留。
    </p>
    <p v-if="sources.error" class="form-error" role="alert">
      {{ sources.error }}
      <Button size="small" @click="refresh">重试关联资料</Button>
    </p>
    <div class="contact-board-scroll">
      <div class="contact-board-columns">
        <section
          v-for="status in CONTACT_STATUSES"
          :key="status"
          class="contact-board-column"
          @dragover.prevent
          @drop.prevent="drop($event, status)"
        >
          <h2>
            {{ CONTACT_LABELS[status]
            }}<span>{{
              entries.filter((item) => stage(item) === status).length
            }}</span>
          </h2>
          <article
            v-for="entry in entries.filter((item) => stage(item) === status)"
            :key="entry.key"
            class="contact-board-card"
            :draggable="Boolean(entry.person) && !store.saving"
            @dragstart="drag($event, entry)"
          >
            <p>{{ entry.target.university.name }}</p>
            <RouterLink :to="labPath(entry.target)"
              ><h3>{{ entry.target.lab.name }}</h3></RouterLink
            ><span class="planner-muted">{{
              entry.person?.name || '尚未添加联系老师'
            }}</span
            ><ContactStatusBadge :contact="entry.person?.contact" compact />
            <ContactStageContent
              :target="entry.target"
              :professor-id="entry.person?.id"
            />
            <Select
              v-accessible-select
              :value="status"
              :options="CONTACT_OPTIONS"
              :disabled="!entry.person || store.saving"
              :aria-label="`${entry.target.lab.name}联系状态`"
              @change="change(entry, $event)"
            /><Button
              :disabled="store.saving"
              @click="emit('manage', entry.target.lab.id, entry.person?.id)"
              >查看整段考学经历</Button
            >
          </article>
          <p
            v-if="!entries.some((item) => stage(item) === status)"
            class="contact-board-empty"
          >
            暂无目标
          </p>
        </section>
      </div>
    </div>
  </section>
</template>
