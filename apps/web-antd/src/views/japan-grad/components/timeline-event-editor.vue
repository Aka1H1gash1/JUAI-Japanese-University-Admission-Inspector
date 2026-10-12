<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { App, Button, Checkbox, Input, Modal, Select } from 'ant-design-vue';
import type { LabTarget } from '../lab-targets';
import type { PlannerEvent } from '../application-calendar';
import type { TimelineEntry, TimelineKind } from '../timeline';
import { TIMELINE_LABELS, timelineError } from '../timeline';
import { useExplorerStore } from '../explorer';
import { japanToday } from '../application-planning';
import { vAccessibleSelect } from '../select-accessibility';
const props = defineProps<{
  targets: LabTarget[];
  event?: PlannerEvent;
  labId?: string;
}>();
const open = defineModel<boolean>('open', { default: false });
const emit = defineEmits<{ saved: [date: string] }>();
const store = useExplorerStore(),
  { message, modal } = App.useApp();
const labId = ref(''),
  feedback = ref(''),
  startTime = ref(''),
  endTime = ref('');
const form = ref<TimelineEntry>({
  id: '',
  kind: 'contact',
  title: '',
  start: '',
  end: '',
  at: '',
  endAt: '',
  complete: false,
  notes: '',
  replaces: '',
});
const target = computed(() =>
  props.targets.find((t) => t.lab.id === labId.value),
);
const options = computed(() =>
  props.targets.map((t) => ({
    value: t.lab.id,
    label: `${t.university.name} / ${t.lab.name}`,
  })),
);
const original = computed(() =>
  props.event?.entryId
    ? target.value?.lab.timeline?.events.find(
        (e) => e.id === props.event!.entryId,
      )
    : undefined,
);
watch(open, (value) => {
  if (!value) return;
  const event = props.event;
  labId.value =
    event?.labId ||
    props.labId ||
    (props.targets.length === 1 ? props.targets[0]!.lab.id : '');
  const entry = event?.entryId
    ? props.targets
        .find((t) => t.lab.id === event.labId)
        ?.lab.timeline?.events.find((e) => e.id === event.entryId)
    : undefined;
  form.value = {
    id: entry?.id ?? '',
    kind: (event?.kind as TimelineKind) || 'contact',
    title: event?.title || TIMELINE_LABELS.contact,
    start: event?.start || japanToday(),
    end: event?.end || '',
    at: event?.at || '',
    endAt: event?.endAt || '',
    complete: event?.complete || false,
    notes: event?.details || '',
    replaces: entry?.replaces || (event?.imported ? event.source : ''),
  };
  startTime.value = form.value.at.slice(11, 16);
  endTime.value = form.value.endAt.slice(11, 16);
  feedback.value = '';
});
watch(
  () => form.value.kind,
  (value, previous) => {
    if (
      !props.event &&
      (!form.value.title || form.value.title === TIMELINE_LABELS[previous])
    )
      form.value.title = TIMELINE_LABELS[value];
  },
);
watch(
  () => form.value.start,
  (value, previous) => {
    if (!form.value.end || form.value.end === previous) form.value.end = value;
  },
);
async function save() {
  if (!target.value || store.saving) {
    feedback.value = '请选择研究室。';
    return;
  }
  const entry = {
    ...form.value,
    id: form.value.id || crypto.randomUUID(),
    end: form.value.end || form.value.start,
    at: startTime.value ? `${form.value.start}T${startTime.value}` : '',
    endAt: endTime.value
      ? `${form.value.end || form.value.start}T${endTime.value}`
      : '',
  };
  feedback.value = timelineError({ events: [entry], hiddenSources: [] });
  if (feedback.value) return;
  try {
    await store.saveTimelineEvent(labId.value, entry);
    open.value = false;
    emit('saved', entry.start);
    message.success('日程已保存');
  } catch (e) {
    feedback.value = e instanceof Error ? e.message : '保存失败。';
  }
}
function remove() {
  if (!props.event || !target.value || store.saving) return;
  const event = props.event;
  modal.confirm({
    title: `移除「${event.title}」？`,
    content:
      event.imported || original.value?.replaces
        ? '此日程会从该研究室的时间线中隐藏，可通过恢复来源日程重新显示。'
        : '这条手动日程将被移除。',
    okText: '移除',
    cancelText: '取消',
    async onOk() {
      await store.removeTimelineEvent(
        labId.value,
        event.entryId ?? '',
        event.imported ? event.source : '',
      );
      open.value = false;
      message.success('日程已移除');
    },
  });
}
</script>
<template>
  <Modal
    v-model:open="open"
    :title="event ? '编辑日程' : '新增日程'"
    :footer="null"
    :width="700"
    :mask-closable="!store.saving"
    :closable="!store.saving"
    :keyboard="!store.saving"
    ><form class="explorer-form" @submit.prevent="save">
      <p class="form-context">
        为研究室安排首次联系、内诺、出愿、考试与结果节点。日期与时间均按日本时间（JST）。
      </p>
      <div class="form-fields">
        <div class="field full">
          <label for="timeline-lab">研究室</label
          ><Select
            id="timeline-lab"
            v-accessible-select
            v-model:value="labId"
            :options="options"
            :disabled="!!event || store.saving"
            placeholder="选择研究室"
          />
        </div>
        <div class="field">
          <label for="timeline-kind">日程类型</label
          ><Select
            id="timeline-kind"
            v-accessible-select
            v-model:value="form.kind"
            :options="
              Object.entries(TIMELINE_LABELS).map(([value, label]) => ({
                value,
                label,
              }))
            "
            :disabled="store.saving"
          />
        </div>
        <div class="field">
          <label for="timeline-title">标题</label
          ><Input
            id="timeline-title"
            v-model:value="form.title"
            :maxlength="160"
            :disabled="store.saving"
            placeholder="如首次联系田中教授"
          />
        </div>
        <div class="field">
          <label for="timeline-start">{{
            form.kind === 'application' ? '出愿开始日期' : '开始 / 发生日期'
          }}</label
          ><Input
            id="timeline-start"
            v-model:value="form.start"
            type="date"
            min="1900-01-01"
            max="2200-12-31"
            :disabled="store.saving"
          />
        </div>
        <div class="field">
          <label for="timeline-end">{{
            form.kind === 'application'
              ? '出愿截止日期'
              : '结束日期（可留空，按同一天）'
          }}</label
          ><Input
            id="timeline-end"
            v-model:value="form.end"
            type="date"
            min="1900-01-01"
            max="2200-12-31"
            :disabled="store.saving"
          />
        </div>
        <div class="field">
          <label for="timeline-time">开始时间（可选）</label
          ><Input
            id="timeline-time"
            v-model:value="startTime"
            type="time"
            :disabled="store.saving"
          />
        </div>
        <div class="field">
          <label for="timeline-end-time">结束时间（可选）</label
          ><Input
            id="timeline-end-time"
            v-model:value="endTime"
            type="time"
            :disabled="store.saving"
          />
        </div>
        <div class="field full">
          <label for="timeline-notes">备注</label
          ><Input.TextArea
            id="timeline-notes"
            v-model:value="form.notes"
            :rows="3"
            :maxlength="4000"
            :disabled="store.saving"
            placeholder="记录教授姓名、考试科目、地点、材料或其他说明"
          />
        </div>
        <div class="field full">
          <Checkbox v-model:checked="form.complete" :disabled="store.saving"
            >已完成 / 已确认发生</Checkbox
          ><small>未勾选表示计划中的安排，可显示倒计时与日历提醒。</small>
        </div>
      </div>
      <p v-if="feedback" class="form-error" role="alert">{{ feedback }}</p>
      <footer class="form-footer">
        <Button v-if="event" danger :disabled="store.saving" @click="remove"
          >移除此日程</Button
        ><span>保存到当前研究室的个人日程</span
        ><Button :disabled="store.saving" @click="open = false">取消</Button
        ><Button type="primary" html-type="submit" :loading="store.saving"
          >保存日程</Button
        >
      </footer>
    </form></Modal
  >
</template>
<style scoped>
.field small {
  color: var(--jg-muted);
}
.explorer-form {
  max-height: 76vh;
  overflow-y: auto;
  padding-right: 6px;
}
</style>
