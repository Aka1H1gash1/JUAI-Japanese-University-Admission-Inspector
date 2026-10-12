import { validPlannerDay, validPlannerMinute } from './planning-fields.mjs';
export const TIMELINE_LABELS = {
  contact: '首次联络',
  consent: '内诺',
  application: '出愿',
  exam: '考试',
  written: '笔试',
  interview: '面试',
  result: '放榜',
  custom: '自定义',
  teacher_interview: '教授面试',
  followup: '跟进教授',
  task: '材料 / 待办',
  sent: '首封邮件已发',
};
export function timelineError(value) {
  if (value === undefined) return '';
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !Array.isArray(value.events) ||
    value.events.length > 200 ||
    !Array.isArray(value.hiddenSources) ||
    value.hiddenSources.length > 500 ||
    value.hiddenSources.some(
      (source) => typeof source !== 'string' || !/^[\w-]{1,220}$/.test(source),
    )
  )
    return '每个研究室最多保存 200 个日程，隐藏来源格式不合法。';
  const ids = new Set(),
    replacements = new Set();
  for (const event of value.events) {
    if (
      !event ||
      typeof event.id !== 'string' ||
      !/^[\w-]{1,100}$/.test(event.id) ||
      ids.has(event.id) ||
      !Object.hasOwn(TIMELINE_LABELS, event.kind) ||
      typeof event.title !== 'string' ||
      !event.title.trim() ||
      event.title.length > 160 ||
      typeof event.notes !== 'string' ||
      event.notes.length > 4000 ||
      typeof event.complete !== 'boolean' ||
      (event.linkContact !== undefined &&
        typeof event.linkContact !== 'boolean') ||
      !validPlannerDay(event.start) ||
      !validPlannerDay(event.end) ||
      event.end < event.start ||
      typeof event.at !== 'string' ||
      typeof event.endAt !== 'string' ||
      typeof event.replaces !== 'string' ||
      (event.replaces &&
        (!/^[\w-]{1,220}$/.test(event.replaces) ||
          replacements.has(event.replaces)))
    )
      return '日程标题、类型、日期或备注格式错误。';
    if (
      (event.at &&
        (!validPlannerMinute(event.at) ||
          event.at.slice(0, 10) !== event.start)) ||
      (event.endAt &&
        (!event.at ||
          !validPlannerMinute(event.endAt) ||
          event.endAt.slice(0, 10) !== event.end ||
          event.endAt < event.at)) ||
      (event.at && event.end !== event.start && !event.endAt)
    )
      return '请填写有效的起止时间，结束时间不能早于开始时间。';
    ids.add(event.id);
    if (event.replaces) replacements.add(event.replaces);
  }
  return '';
}
