import { strToU8, zipSync } from 'fflate';
import type { LabTarget } from './lab-targets';
import { recurringBudget, targetExams, targetExamText } from './lab-targets';
import { universityGeography } from './japan-geography';
import {
  CONTACT_LABELS,
  normalizedContact,
  primaryProfessor,
} from './application-planning';
import {
  dormitoryLabel,
  universityBudgetTotals,
  universityFees,
} from './university-fees';

type Cell =
  | string
  | number
  | { formula: string; value: number | '' }
  | { input: number };
interface Sheet {
  name: string;
  rows: Cell[][];
  widths: number[];
}
const xml = (value: unknown) =>
  String(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
function column(index: number): string {
  let result = '';
  for (let value = index + 1; value; value = Math.floor((value - 1) / 26))
    result = String.fromCharCode(65 + ((value - 1) % 26)) + result;
  return result;
}
function worksheet(sheet: Sheet) {
  const last = `${column(sheet.rows[0]!.length - 1)}${sheet.rows.length}`;
  const frozenColumns = sheet.widths.length > 2 ? 2 : 0;
  const rows = sheet.rows
    .map((row, index) => {
      const height =
        index === 0
          ? 34
          : Math.min(
              120,
              Math.max(
                36,
                ...row.map((cell) =>
                  typeof cell === 'string' ? cell.split('\n').length * 16 : 36,
                ),
              ),
            );
      return `<row r="${index + 1}" ht="${height}" customHeight="1">${row
        .map((cell, col) => {
          const ref = `${column(col)}${index + 1}`;
          if (typeof cell === 'object' && 'input' in cell)
            return `<c r="${ref}" s="5"><v>${cell.input}</v></c>`;
          if (typeof cell === 'object')
            return `<c r="${ref}" s="4"${cell.value === '' ? ' t="str"' : ''}><f>${xml(cell.formula)}</f><v>${cell.value}</v></c>`;
          if (typeof cell === 'number')
            return `<c r="${ref}" s="2"><v>${cell}</v></c>`;
          return `<c r="${ref}" s="${index === 0 ? 1 : index % 2 ? 0 : 3}" t="inlineStr"><is><t xml:space="preserve">${xml(cell.length > 32767 ? cell.slice(0, 32000).replace(/[\uD800-\uDBFF]$/, '') + '\n…长文本已截取，请查看历年考试明细或本地原记录。' : cell)}</t></is></c>`;
        })
        .join('')}</row>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${last}"/><sheetViews><sheetView workbookViewId="0"><pane xSplit="${frozenColumns}" ySplit="1" topLeftCell="${frozenColumns ? 'C2' : 'A2'}" activePane="${frozenColumns ? 'bottomRight' : 'bottomLeft'}" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="36"/><cols>${sheet.widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('')}</cols><sheetData>${rows}</sheetData><autoFilter ref="A1:${last}"/><pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/></worksheet>`;
}

const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0;(#,##0);&quot;-&quot;"/></numFmts><fonts count="3"><font><sz val="11"/><color rgb="FF000000"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font><font><sz val="11"/><color rgb="FF0000FF"/><name val="Arial"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFB65335"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF2F4F7"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom><color rgb="FFDCE1E8"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="164" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf><xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

export function createJourneyWorkbook(
  targets: LabTarget[],
  year: string,
  exportedAt = new Date(),
) {
  const date = exportedAt.toLocaleString('zh-CN', { hour12: false });
  const headers = [
    '研究室名称',
    '大学',
    '研究科',
    '专攻',
    '研究室研究方向',
    '老师',
    'QS 排名',
    'QS 榜单年份',
    '所在地域',
    '都道府县',
    '具体所在地',
    '大学类型',
    '年度开销（日元，不含入学金）',
    '首年总费用（日元）',
    '两年总费用（日元）',
    '入学金（日元）',
    '年度学费（日元）',
    '月房租（日元）',
    '月生活费（日元，不含房租）',
    '预算完整性',
    '寮申请',
    '寮说明',
    '考试年份 / 批次',
    '考试科目',
    '笔试时间',
    '面试时间',
    '结果发布时间',
    '原考试时间（旧记录）',
    '出愿开始',
    '出愿截止',
    '出愿所需材料',
    '研究室考试特殊说明',
    '研究室出愿特殊说明',
    '考试年度备注',
    '研究室官网',
    '大学官网',
    '费用备注',
    '个人备注',
    '导出时间',
    '主要联系老师',
    '联系状态',
    '首封发送日期',
    '教授面试约定（JST）',
    '下次跟进',
    '教授回复要点',
    '材料 / 待办逐项进度',
  ];
  const summary: Cell[][] = [headers];
  const materials: Cell[][] = [
    [
      '大学',
      '研究科',
      '专攻',
      '研究室',
      '项目',
      '类型',
      '准备进度（%）',
      '截止日期（JST）',
      '备注',
    ],
  ];
  const exams: Cell[][] = [
    [
      '研究室名称',
      '大学',
      '研究科',
      '专攻',
      '考试年份',
      '考试批次',
      '考试科目',
      '笔试时间',
      '面试时间',
      '结果发布时间',
      '原考试时间（旧记录）',
      '年度备注',
      '来源链接',
      '研究室考试特殊说明',
    ],
  ];
  const amount = (value: string): Cell => (value === '' ? '' : Number(value));
  targets.forEach((target, index) => {
    const { lab, university, school, major, professors } = target;
    const geography = universityGeography(university);
    const fees = universityFees(university);
    const annual = recurringBudget(university);
    const budget = universityBudgetTotals(university);
    const row = index + 2;
    const person = primaryProfessor(target);
    const contact = normalizedContact(person?.contact);
    summary.push([
      lab.name,
      university.name,
      school.name,
      major.name,
      lab.research,
      professors
        .map((item) => [item.name, item.title].filter(Boolean).join(' · '))
        .join('\n'),
      university.qsRank,
      university.qsYear,
      geography.region,
      geography.prefecture,
      university.location,
      university.category,
      {
        formula: `IF(COUNT(Q${row}:S${row})=3,Q${row}+12*SUM(R${row}:S${row}),"")`,
        value: annual.complete ? (annual.value ?? '') : '',
      },
      {
        formula: `IF(COUNT(P${row}:S${row})=4,P${row}+M${row},"")`,
        value: budget.complete ? Number(budget.firstYear) : '',
      },
      {
        formula: `IF(COUNT(P${row}:S${row})=4,P${row}+2*M${row},"")`,
        value: budget.complete ? Number(budget.twoYears) : '',
      },
      amount(fees.admissionFee),
      amount(fees.annualTuition),
      amount(university.monthlyRent),
      amount(university.monthlyLivingExpenses),
      budget.complete
        ? '已填写完整'
        : `待补充：${budget.missingFields.join('、')}；缺项的总费用留空`,
      dormitoryLabel(university.dormitoryStatus),
      university.dormitoryNotes,
      targetExams(target, year)
        .map((item) => [item.year, item.session].filter(Boolean).join(' / '))
        .join('\n'),
      targetExamText(target, 'subjects', year),
      targetExamText(target, 'writtenDate', year),
      targetExamText(target, 'interviewDate', year),
      targetExamText(target, 'resultDate', year),
      targetExamText(target, 'examDate', year),
      major.applicationStart,
      major.applicationEnd,
      major.applicationMaterials,
      lab.examNotes,
      lab.applicationNotes,
      targetExams(target, year)
        .filter((item) => item.notes)
        .map((item) => `${item.year} ${item.session}：${item.notes}`)
        .join('\n'),
      lab.website,
      university.website,
      university.feeNotes,
      lab.notes,
      date,
      person?.name ?? '',
      person ? CONTACT_LABELS[contact.status] : '',
      contact.firstSentDate,
      contact.interviewAt.replace('T', ' '),
      contact.followUpDate,
      contact.replySummary,
      (lab.tasks ?? [])
        .map(
          (task) =>
            `${task.title} · ${task.progress}%${task.dueDate ? ` · 截止 ${task.dueDate}` : ''}`,
        )
        .join('\n'),
    ]);
    for (const task of lab.tasks ?? [])
      materials.push([
        university.name,
        school.name,
        major.name,
        lab.name,
        task.title,
        task.kind === 'material' ? '申请材料' : '其他待办',
        { input: task.progress },
        task.dueDate,
        task.notes,
      ]);
    for (const record of major.examHistory.toSorted(
      (a, b) =>
        b.year.localeCompare(a.year) || a.session.localeCompare(b.session),
    ))
      exams.push([
        lab.name,
        university.name,
        school.name,
        major.name,
        record.year,
        record.session,
        record.subjects,
        record.writtenDate,
        record.interviewDate,
        record.resultDate,
        record.examDate,
        record.notes,
        record.sourceUrl,
        lab.examNotes,
      ]);
  });
  const sheets: Sheet[] = [
    {
      name: '研究室对比',
      rows: summary,
      widths: headers.map((_, index) =>
        [4, 5, 23, 30, 31, 32, 33, 37].includes(index)
          ? 40
          : index < 4
            ? 24
            : 22,
      ),
    },
    {
      name: '历年考试',
      rows: exams,
      widths: exams[0]!.map((_, index) =>
        [6, 11, 12, 13].includes(index) ? 40 : 24,
      ),
    },
    {
      name: '材料与待办',
      rows: materials,
      widths: [24, 24, 24, 24, 36, 16, 18, 22, 48],
    },
    {
      name: '字段说明',
      widths: [30, 95],
      rows: [
        ['项目', '说明'],
        [
          '联络与材料',
          '联系状态与日期来自研究室主要联系老师；材料与待办明细保留各项目进度与截止日期。未设主要老师时采用该研究室第一位老师。草稿正文不包含在清单导出中。',
        ],
        ['导出时间', date],
        [
          '导出范围',
          `${targets.length} 个研究室；对比表考试年份：${year === 'latest' ? '每个研究室所属专攻的最新已记录年份' : year}`,
        ],
        [
          '资料来源',
          'JapanGrad 本地工作区中手动维护的大学、研究科、专攻、研究室与老师资料；不是实时招生数据。',
        ],
        [
          '年度开销',
          '年度学费 + 12 ×（月房租 + 月生活费），不含一次性入学金。金额均为日元。',
        ],
        [
          '首年 / 两年总费用',
          '首年 = 入学金 + 年度开销；两年 = 入学金 + 2 × 年度开销。入学金只计算一次。',
        ],
        [
          '缺失费用',
          '未知输入保留空白。所需输入缺失时，对应费用合计也留空，并在预算完整性列标出待补充项；零元是已知金额，显示为“-”。',
        ],
        [
          '费用公式',
          'M、N、O 列为可重新计算的 Excel 公式；P 至 S 列为可编辑的费用输入。蓝字表示费用输入，黑字表示计算结果。',
        ],
        [
          '考试信息',
          '考试时间、科目、年度备注和出愿信息来自研究室所属专攻；研究室的特殊要求另列。未记录考试时留空。',
        ],
        [
          '考试年份',
          '对比表使用所选年份，并保留同年度全部批次；历年考试表包含所有已记录年份，不受对比年份筛选影响。',
        ],
        [
          '共同专攻',
          '不同研究室可共享同一专攻的考试信息；历年考试表按研究室分别列出，便于筛选。',
        ],
        [
          'QS 排名',
          '使用大学中保存的排名及榜单年份，支持排名区间；未填写时留空。',
        ],
      ],
    },
  ];
  const files: Record<string, Uint8Array> = {};
  const put = (name: string, content: string) => {
    files[name] = strToU8(content);
  };
  put(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
  );
  put(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  );
  put(
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${sheets.map((sheet, index) => `<sheet name="${sheet.name}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`,
  );
  put(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  );
  put('xl/styles.xml', styles);
  sheets.forEach((sheet, index) =>
    put(`xl/worksheets/sheet${index + 1}.xml`, worksheet(sheet)),
  );
  return zipSync(files, { level: 6 });
}

export function downloadJourneyWorkbook(targets: LabTarget[], year: string) {
  if (!targets.length) throw new Error('请先标记想考的研究室。');
  const bytes = createJourneyWorkbook(targets, year);
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(bytes).buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  );
  const link = document.createElement('a');
  const now = new Date();
  link.href = url;
  link.download = `修考之路-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}.xlsx`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
