import type { ProfileReport } from './profile-report';

import { createTabularWorkbook } from './journey-export';
import { REPORT_DETAIL_LABELS } from './profile-report';

export function createProfileWorkbook(report: ProfileReport) {
  const sheets: {
    name: string;
    rows: (number | string)[][];
    widths: number[];
  }[] = [
    {
      name: report.title,
      rows: [report.columns, ...report.rows],
      widths: report.columns.map((_, i) => (i === 0 ? 28 : 30)),
    },
  ];
  if (report.detail !== 'overview') {
    for (const stage of new Set(report.records.map((r) => r.stage))) {
      const rows: (number | string)[][] = [
        ['档案', '内容块', '字段', '关键信息'],
      ];
      for (const r of report.records.filter((r) => r.stage === stage))
        for (const s of r.sections)
          for (const field of s.rows)
            rows.push([
              `${r.subtitle}\n${r.title}`,
              s.title,
              field.label,
              field.value,
            ]);
      sheets.push({
        name: stage === report.title ? '详细信息' : stage,
        rows,
        widths: [42, 20, 24, 76],
      });
    }
  }
  sheets.push({
    name: '导出说明',
    rows: [
      ['项目', '说明'],
      ['导出范围', report.title],
      ['导出日期（JST）', report.date],
      ['详细程度', REPORT_DETAIL_LABELS[report.detail]],
      ['档案数量', report.records.length],
      ['未知信息', '待确认表示尚无足够记录，不代表没有要求或没有外国人学生。'],
      [
        '阶段口径',
        '自动阶段参考研究室主要联系老师；导出用途可以手动选择，不改写原档案。',
      ],
      [
        '数据范围',
        '基于当前用户的已保存记录；不包含API密钥、邮件正文或完整备份。',
      ],
    ],
    widths: [26, 100],
  });
  return createTabularWorkbook(sheets, true);
}
export function downloadReport(
  bytes: Uint8Array,
  report: ProfileReport,
  format: 'pdf' | 'xlsx',
) {
  const blob = new Blob([new Uint8Array(bytes).buffer], {
    type:
      format === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `JUAI-${report.title}-${report.date}.${format}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
