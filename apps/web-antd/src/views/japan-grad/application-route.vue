<script setup lang="ts">
import { useRoute } from 'vue-router';

import ApplicationWorkspace from './application-flow-prototype.vue';
const route = useRoute();
</script>
<template>
  <ApplicationWorkspace formal :key="String(route.params.labId)" />
</template>
