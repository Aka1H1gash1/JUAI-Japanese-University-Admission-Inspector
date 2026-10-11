<script setup lang="ts">
import { App, Button, Select } from 'ant-design-vue';
import type { LabTarget } from '../lab-targets';
import type { ContactStatus } from '../application-planning';
import {
  CONTACT_LABELS,
  CONTACT_OPTIONS,
  CONTACT_STATUSES,
  contactWithStatus,
  normalizedContact,
  primaryProfessor,
} from '../application-planning';
import { labPath } from '../lab-targets';
import { useExplorerStore } from '../explorer';
import { vAccessibleSelect } from '../select-accessibility';
import ContactStatusBadge from './contact-status.vue';
const props = defineProps<{ targets: LabTarget[] }>();
const emit = defineEmits<{ manage: [id: string] }>();
const store = useExplorerStore();
const { message } = App.useApp();
function stage(target: LabTarget) {
  return normalizedContact(primaryProfessor(target)?.contact).status;
}
async function change(target: LabTarget, value: unknown) {
  const person = primaryProfessor(target);
  if (
    !person ||
    typeof value !== 'string' ||
    !CONTACT_STATUSES.includes(value as ContactStatus)
  )
    return;
  try {
    await store.saveProfessorContact(
      person.id,
      contactWithStatus(
        normalizedContact(person.contact),
        value as ContactStatus,
      ),
      target.lab.id,
    );
  } catch (error) {
    message.error(
      error instanceof Error ? error.message : '更新联系状态失败。',
    );
  }
}
function drag(event: DragEvent, target: LabTarget) {
  if (store.saving) {
    event.preventDefault();
    return;
  }
  event.dataTransfer?.setData('text/plain', target.lab.id);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
}
function drop(event: DragEvent, status: ContactStatus) {
  const target = props.targets.find(
    (item) => item.lab.id === event.dataTransfer?.getData('text/plain'),
  );
  if (target && !store.saving) void change(target, status);
}
</script>
<template>
  <section class="journey-contact-board" aria-label="教授联络看板">
    <p class="planner-view-description">
      按研究室的主要联系老师分列。可拖动卡片或用下拉框更新状态，点「联络与草稿」记录邮件和面试。
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
              targets.filter((item) => stage(item) === status).length
            }}</span>
          </h2>
          <article
            v-for="target in targets.filter((item) => stage(item) === status)"
            :key="target.lab.id"
            class="contact-board-card"
            :draggable="Boolean(primaryProfessor(target)) && !store.saving"
            @dragstart="drag($event, target)"
          >
            <p>{{ target.university.name }}</p>
            <RouterLink :to="labPath(target)"
              ><h3>{{ target.lab.name }}</h3></RouterLink
            ><span class="planner-muted">{{
              primaryProfessor(target)?.name || '尚未添加联系老师'
            }}</span
            ><ContactStatusBadge
              :contact="primaryProfessor(target)?.contact"
              compact
            /><span
              v-if="primaryProfessor(target)?.contact?.interviewAt"
              class="planner-muted"
              >面试
              {{
                primaryProfessor(target)?.contact?.interviewAt.replace('T', ' ')
              }}
              JST</span
            ><Select
              v-accessible-select
              :value="status"
              :options="CONTACT_OPTIONS"
              :disabled="!primaryProfessor(target) || store.saving"
              :aria-label="`${target.lab.name}联系状态`"
              @change="change(target, $event)"
            /><Button
              :disabled="store.saving"
              @click="emit('manage', target.lab.id)"
              >联络与草稿</Button
            >
          </article>
          <p
            v-if="!targets.some((item) => stage(item) === status)"
            class="contact-board-empty"
          >
            暂无目标
          </p>
        </section>
      </div>
    </div>
  </section>
</template>
