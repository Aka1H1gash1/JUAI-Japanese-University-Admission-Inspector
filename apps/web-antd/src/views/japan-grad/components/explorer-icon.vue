<script setup lang="ts">
withDefaults(defineProps<{ name?: string }>(), { name: 'building' });

const paths: Record<string, string[]> = {
  building: [
    'M3 21h18',
    'M5 21V7l7-4 7 4v14',
    'M9 21v-4h6v4',
    'M8 9h1m6 0h1M8 13h1m6 0h1',
  ],
  book: [
    'M12 6c-3-2-6-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Z',
    'M12 6v14',
  ],
  user: ['M20 21v-2a7 7 0 0 0-14 0v2', 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z'],
  heart: [
    'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  ],
  plus: ['M12 5v14', 'M5 12h14'],
  arrow: ['M5 12h14', 'm12 5 7 7-7 7'],
  back: ['M19 12H5', 'm12 5-7 7 7 7'],
  chevron: ['m9 5 7 7-7 7'],
  search: ['M21 21l-5-5', 'M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z'],
  compare: ['M4 4h6v16H4Z', 'M14 4h6v16h-6Z', 'M7 8v8m10-8v8'],
  edit: ['m16 3 5 5-12 12-6 1 1-6Z', 'm14 5 5 5'],
  trash: ['M3 6h18', 'M5 6l1 15h12l1-15', 'M9 6V3h6v3', 'M10 10v7m4-7v7'],
  globe: [
    'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
    'M3 12h18',
    'M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z',
  ],
  pin: [
    'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z',
    'M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  ],
  link: ['M14 3h7v7', 'M10 14 21 3', 'M21 14v7H3V3h7'],
  close: ['m6 6 12 12', 'M6 18 18 6'],
  check: ['m5 12 4 4L19 6'],
  mail: ['M3 5h18v14H3Z', 'm3 5 9 8 9-8'],
};
</script>

<template>
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path
      v-for="(path, i) in paths[name] ?? paths.building"
      :key="i"
      :d="path"
    />
  </svg>
</template>
