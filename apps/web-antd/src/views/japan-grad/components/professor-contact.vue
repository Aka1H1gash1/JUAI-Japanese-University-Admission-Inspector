<script setup lang="ts">
import ContactExperience from './contact-experience.vue';
defineProps<{ professorId?: string; labId?: string }>();
const emit = defineEmits<{ saved: [] }>();
</script>
<template>
  <ContactExperience
    :professor-id="professorId"
    :lab-id="labId"
    @saved="emit('saved')"
  />
</template>
