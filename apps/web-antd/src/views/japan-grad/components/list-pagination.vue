<script setup lang="ts">
import { Pagination } from 'ant-design-vue';

defineProps<{ total: number }>();
const page = defineModel<number>('page', { required: true });
const pageSize = defineModel<number>('pageSize', { required: true });
</script>

<template>
  <nav v-if="total" class="list-pagination" aria-label="列表分页">
    <span class="list-pagination-count" aria-live="polite">
      共 {{ total }} 条 · 第 {{ (page - 1) * pageSize + 1 }}–{{
        Math.min(page * pageSize, total)
      }}
      条
    </span>
    <Pagination
      v-model:current="page"
      v-model:page-size="pageSize"
      :total="total"
      :page-size-options="['12', '24', '48']"
      show-size-changer
      :show-quick-jumper="total > pageSize"
      size="small"
    />
  </nav>
</template>

<style scoped>
.list-pagination {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  padding: 14px 0;
}

.list-pagination-count {
  font-size: 11px;
  color: var(--jg-muted, #64748b);
}

@media (max-width: 600px) {
  .list-pagination {
    justify-content: center;
  }

  .list-pagination :deep(.ant-pagination-options) {
    display: inline-block;
    margin: 7px 0;
  }

  .list-pagination :deep(.ant-pagination-options-quick-jumper) {
    display: none;
  }
}
</style>
