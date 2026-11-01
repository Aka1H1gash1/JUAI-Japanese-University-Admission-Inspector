import type { InformationGap } from './overview-data';

export const REMINDER_OPTIONS = [
  { label: '入学金', value: '入学金' },
  { label: '年度学费', value: '年度学费' },
  { label: '房租', value: '房租' },
  { label: '生活费', value: '生活费' },
  { label: '出愿日期', value: '完整出愿日期' },
  { label: '出愿材料', value: '出愿材料' },
  { label: '考试记录与年份', value: '考试记录' },
  { label: '考试科目', value: '考试科目' },
  { label: '考试时间', value: '考试时间' },
  { label: '研究方向', value: '研究方向' },
  { label: '语言要求', value: '语言要求' },
  { label: '老师资料', value: '老师资料' },
  { label: '材料清单', value: '材料清单' },
];

export function filterInformationGaps(
  gaps: InformationGap[],
  selected: string[],
) {
  const enabled = new Set(selected);
  return gaps.flatMap((gap) => {
    const fields = gap.fields.filter((field) =>
      enabled.has(field.startsWith('新一年考试记录') ? '考试记录' : field),
    );
    // Recompute the destination after filtering: hidden teacher/material gaps
    // must not keep steering the user away from the remaining field.
    let path = gap.path;
    const editor = gap.editor;
    if (gap.id.startsWith('lab-')) {
      let tab = 'admissions';
      if (fields.includes('材料清单')) tab = 'materials';
      if (fields.includes('老师资料')) tab = 'teachers';
      path = `${path.split('?')[0]}?tab=${tab}`;
    }
    return fields.length > 0 ? [{ ...gap, fields, path, editor }] : [];
  });
}
