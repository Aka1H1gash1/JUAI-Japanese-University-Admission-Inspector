<script setup lang="ts">
import ContactExperience from './contact-experience.vue';
defineProps<{
  professorId?: string;
  labId?: string;
  compact?: boolean;
  experienceId?: string;
}>();
const emit = defineEmits<{ saved: [] }>();
</script>
<template>
  <ContactExperience
    :professor-id="professorId"
    :lab-id="labId"
    :compact="compact"
    :initial-experience-id="experienceId"
    @saved="emit('saved')"
  />
</template>
