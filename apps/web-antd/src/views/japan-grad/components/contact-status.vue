<script setup lang="ts">
import { computed } from 'vue';
import type { ProfessorContact } from '../application-planning';
import { CONTACT_LABELS, normalizedContact } from '../application-planning';
const props = defineProps<{ contact?: ProfessorContact; compact?: boolean }>();
const value = computed(() => normalizedContact(props.contact));
const step = computed(
  () =>
    ({
      not_contacted: 0,
      first_sent: 1,
      replied: 1,
      interview_scheduled: 2,
      consent: 3,
      closed: -1,
    })[value.value.status],
);
const shortDate = (date: string) =>
  date ? `${Number(date.slice(5, 7))}.${Number(date.slice(8, 10))}` : '';
</script>
<template>
  <div class="contact-status" :class="`contact-${value.status}`">
    <span class="contact-status-label"
      >{{ CONTACT_LABELS[value.status]
      }}<small v-if="value.status === 'first_sent' && value.firstSentDate"
        >（{{ shortDate(value.firstSentDate) }}）</small
      ><small v-if="value.status === 'consent' && value.consentDate"
        >（{{ shortDate(value.consentDate) }}）</small
      ></span
    >
    <ol v-if="!compact" class="contact-steps" aria-label="教授联络阶段">
      <li
        v-for="(label, index) in ['未联系', '首封', '面试', '内诺']"
        :key="label"
        :class="{ active: index <= step }"
        :aria-current="index === step ? 'step' : undefined"
      >
        {{ label }}
      </li>
    </ol>
  </div>
</template>
