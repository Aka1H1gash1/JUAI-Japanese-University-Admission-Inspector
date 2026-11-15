<script setup lang="ts">
import ExplorerIcon from '../components/explorer-icon.vue';
defineProps<{
  items: {
    id: string;
    title: string;
    to: string;
    subtitle?: string;
    meta?: string;
  }[];
}>();
</script>
<template>
  <ul class="juai-entity-links">
    <li v-for="item in items" :key="item.id">
      <RouterLink :to="item.to">
        <div>
          <strong>{{ item.title }}</strong>
          <p v-if="item.subtitle">{{ item.subtitle }}</p>
        </div>
        <span v-if="item.meta">{{ item.meta }}</span><ExplorerIcon name="arrow" />
      </RouterLink>
    </li>
  </ul>
</template>
<style scoped>
.juai-entity-links {
  display: grid;
  gap: 0;
  padding: 0;
  margin: 0;
  list-style: none;
}

.juai-entity-links li + li {
  border-top: 1px solid var(--jg-line);
}

.juai-entity-links a {
  display: flex;
  gap: 20px;
  align-items: center;
  padding: 18px 0;
}

.juai-entity-links a > div {
  flex: 1;
  min-width: 0;
}

.juai-entity-links strong {
  font-size: 15px;
  font-weight: 600;
}

.juai-entity-links p {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--jg-secondary);
  overflow-wrap: anywhere;
}

.juai-entity-links a > span {
  max-width: 40%;
  font-size: 11px;
  color: var(--jg-muted);
}

.juai-entity-links svg {
  width: 16px;
  height: 16px;
  color: var(--jg-muted);
}

.juai-entity-links a:hover strong {
  color: var(--jg-accent-text);
}

@media (max-width: 600px) {
  .juai-entity-links a {
    flex-wrap: wrap;
    gap: 8px 12px;
  }

  .juai-entity-links a > div {
    flex-basis: calc(100% - 32px);
  }

  .juai-entity-links a > span {
    max-width: none;
  }
}
</style>
