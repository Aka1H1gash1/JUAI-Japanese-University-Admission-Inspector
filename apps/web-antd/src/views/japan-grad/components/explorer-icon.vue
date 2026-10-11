<script setup lang="ts">
import { computed } from 'vue';
import {
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  BookOpen,
  Building2,
  CalendarDays,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  FolderOpen,
  Globe,
  HardDrive,
  Heart,
  House,
  LayoutGrid,
  Mail,
  MapPin,
  Menu,
  Monitor,
  MoonStar,
  Pencil,
  Plus,
  Search,
  Sun,
  Trash2,
  Upload,
  UserRound,
  Download,
  X,
} from '@vben/icons';

const props = withDefaults(defineProps<{ name?: string }>(), {
  name: 'building',
});
const icons = {
  building: Building2,
  book: BookOpen,
  user: UserRound,
  heart: Heart,
  plus: Plus,
  arrow: ArrowRight,
  back: ArrowLeft,
  chevron: ChevronRight,
  search: Search,
  compare: ArrowRightLeft,
  edit: Pencil,
  trash: Trash2,
  globe: Globe,
  pin: MapPin,
  link: ExternalLink,
  close: X,
  check: Check,
  mail: Mail,
  home: House,
  calendar: CalendarDays,
  upload: Upload,
  grid: LayoutGrid,
  folder: FolderOpen,
  drive: HardDrive,
  menu: Menu,
  sun: Sun,
  moon: MoonStar,
  system: Monitor,
  copy: Copy,
  export: Download,
};
const icon = computed(
  () => icons[props.name as keyof typeof icons] ?? Building2,
);
</script>

<template>
  <component :is="icon" :size="20" :stroke-width="1.65" aria-hidden="true" />
</template>
