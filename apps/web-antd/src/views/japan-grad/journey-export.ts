import { strToU8, zipSync } from 'fflate';
import type { LabTarget } from './lab-targets';
import { targetExams } from './lab-targets';
import type {
  JourneyExportFieldId,
  JourneyExportOptions,
} from './journey-export-fields';
import { selectedExportFields } from './journey-export-fields';

type Cell =
  | string
  | number
  | { formula: string; value: number | '' }
  | { input: number }
  | { calculated: number };
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
          if (typeof cell === 'object' && 'calculated' in cell)
            return `<c r="${ref}" s="4"><v>${cell.calculated}</v></c>`;
          if (typeof cell === 'object')
            return `<c r="${ref}" s="4"${cell.value === '' ? ' t="str"' : ''}><f>${xml(cell.formula)}</f><v>${cell.value}</v></c>`;
          if (typeof cell === 'number')
            return `<c r="${ref}" s="2"><v>${cell}</v></c>`;
          return `<c r="${ref}" s="${index === 0 ? 1 : index % 2 ? 0 : 3}" t="inlineStr"><is><t xml:space="preserve">${xml(cell.length > 32767 ? cell.slice(0, 32000).replace(/[\uD800-\uDBFF]$/, '') + '\n…长文本已截取，请查看本地原记录。' : cell)}</t></is></c>`;
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
  options: JourneyExportOptions,
  exportedAt = new Date(),
) {
  const fields = selectedExportFields(options.fieldIds);
  if (!targets.length) throw new Error('请选择至少一个研究室。');
  if (!fields.length) throw new Error('请选择至少一个导出属性。');
  if (options.fieldIds.some((id) => !fields.some((field) => field.id === id)))
    throw new Error('导出属性已变化，请重新选择。');
  const uniqueTargets = [
    ...new Map(targets.map((t) => [t.lab.id, t])).values(),
  ];
  const date = exportedAt.toLocaleString('zh-CN', {
    hour12: false,
    timeZone: 'Asia/Tokyo',
  });
  const ref = (id: JourneyExportFieldId, row: number) => {
    const index = fields.findIndex((field) => field.id === id);
    return index < 0 ? undefined : `${column(index + 2)}${row}`;
  };
  function budgetFormula(
    id: JourneyExportFieldId,
    row: number,
  ): string | undefined {
    if (!['annualCost', 'firstYearCost', 'twoYearCost'].includes(id)) return;
    const inputs = ['annualTuition', 'monthlyRent', 'monthlyLiving'] as const;
    const annual = ref('annualCost', row);
    const admission = ref('admissionFee', row);
    const multiplier = id === 'twoYearCost' ? '2*' : '';
    if (id !== 'annualCost' && annual && admission)
      return `IF(COUNT(${admission},${annual})=2,${admission}+${multiplier}${annual},"")`;
    const cells = inputs.map((input) => ref(input, row));
    if (cells.some((cell) => !cell) || (id !== 'annualCost' && !admission))
      return;
    const [tuition, rent, living] = cells;
    const result = `${tuition}+12*SUM(${rent},${living})`;
    const all = id === 'annualCost' ? cells : [admission, ...cells];
    return `IF(COUNT(${all.join(',')})=${all.length},${id === 'annualCost' ? result : `${admission}+${multiplier}(${result})`},"")`;
  }
  const summary: Cell[][] = [
    ['大学', '研究室名称', ...fields.map((field) => field.label)],
    ...uniqueTargets.map((target, index) => [
      target.university.name,
      target.lab.name,
      ...fields.map((field): Cell => {
        const value = field.value(target, year);
        const formula = budgetFormula(field.id, index + 2);
        if (formula)
          return { formula, value: typeof value === 'number' ? value : '' };
        if (typeof value !== 'number') return value;
        if (field.calculated) return { calculated: value };
        return field.money ? value : { input: value };
      }),
    ]),
  ];
  const sheets: Sheet[] = [
    {
      name: '研究室对比',
      rows: summary,
      widths: [26, 28, ...fields.map((field) => field.width)],
    },
  ];
  const examFields = fields.filter((field) => field.examField);
  if (options.examDetails && examFields.length) {
    sheets.push({
      name: '考试明细',
      widths: [26, 28, 14, 22, ...examFields.map((field) => field.width)],
      rows: [
        [
          '大学',
          '研究室名称',
          '考试年份',
          '考试批次',
          ...examFields.map((field) => field.label),
        ],
        ...uniqueTargets.flatMap((target) =>
          targetExams(target, year).map((exam) => [
            target.university.name,
            target.lab.name,
            exam.year,
            exam.session,
            ...examFields.map((field) => exam[field.examField!] ?? ''),
          ]),
        ),
      ],
    });
  }
  const taskFields = fields.filter((field) => field.taskField);
  if (options.taskDetails && taskFields.length) {
    sheets.push({
      name: '材料与待办',
      widths: [26, 28, 36, ...taskFields.map((field) => field.width)],
      rows: [
        [
          '大学',
          '研究室名称',
          '项目',
          ...taskFields.map((field) => field.label),
        ],
        ...uniqueTargets.flatMap((target) =>
          (target.lab.tasks ?? []).map((task) => [
            target.university.name,
            target.lab.name,
            task.title,
            ...taskFields.map((field): Cell => {
              const value = task[field.taskField!];
              return field.taskField === 'kind'
                ? value === 'material'
                  ? '申请材料'
                  : '其他待办'
                : typeof value === 'number'
                  ? { input: value }
                  : value;
            }),
          ]),
        ),
      ],
    });
  }
  if (options.includeNotes)
    sheets.push({
      name: '导出说明',
      widths: [30, 95],
      rows: [
        ['项目', '说明'],
        ['导出时间（日本时间）', date],
        ['研究室数量', String(uniqueTargets.length)],
        ['所选属性', fields.map((field) => field.label).join('、')],
        [
          '考试年份',
          year === 'latest'
            ? '各专攻最新已记录年份（同年全部批次）'
            : year === 'all'
              ? '全部已记录年份'
              : `${year} 年（同年全部批次）`,
        ],
        [
          '数据来源',
          '本地工作区手动维护的资料。未勾选的属性不写入文件，也不写入隐藏列或其他工作表。大学与研究室名称固定用于识别记录。',
        ],
        ...(fields.some((field) => field.money)
          ? [
              [
                '费用口径',
                '金额单位为日元。年度开销 = 年度学费 + 12 ×（月房租 + 月生活费）；首年 = 入学金 + 年度开销；两年 = 入学金 + 2 × 年度开销。未知费用留空，零元显示为“-”。',
              ],
              [
                '费用公式',
                '已勾选合计所需的输入列时生成可重算公式；仅勾选合计时导出当前数值快照，不附带未选费用明细。蓝字为数字输入，黑字为合计。',
              ],
            ]
          : []),
        ...(fields.some((field) => field.id === 'languageRequirements')
          ? [
              [
                '语言要求',
                '优先使用研究室单独填写的要求，留空时参考所属专攻。未维护的要求留空。',
              ],
            ]
          : []),
        ...(fields.some((field) => field.group === '教授联络')
          ? [
              [
                '联络口径',
                '联络字段来自研究室主要联系老师；未设置时采用第一位老师。邮件草稿正文不包含在导出中。',
              ],
            ]
          : []),
      ],
    });
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

export function downloadJourneyWorkbook(
  targets: LabTarget[],
  year: string,
  options: JourneyExportOptions,
) {
  const bytes = createJourneyWorkbook(targets, year, options);
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
