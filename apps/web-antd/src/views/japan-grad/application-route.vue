<script setup lang="ts">
import { useRoute } from 'vue-router';

import ApplicationWorkspace from './application-workspace.vue';
const route = useRoute();
</script>
<template><ApplicationWorkspace :key="String(route.params.labId)" /></template>
