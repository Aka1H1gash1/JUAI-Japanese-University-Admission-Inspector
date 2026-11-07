/* oxlint-disable eslint/no-control-regex -- Remove non-printable control bytes before writing PDF text. */
import type { ProfileReport } from './profile-report';

import { REPORT_DETAIL_LABELS } from './profile-report';
let fontBytes: Promise<Uint8Array> | undefined;
async function loadFont() {
  fontBytes ||= fetch(`${import.meta.env.BASE_URL}fonts/NotoSansSC-Regular.ttf`)
    .then(async (r) => {
      if (!r.ok) throw new Error('PDF字体加载失败，请重试。');
      return new Uint8Array(await r.arrayBuffer());
    })
    .catch((error) => {
      fontBytes = undefined;
      throw error;
    });
  return fontBytes;
}
/** A4, selectable CJK text, embedded CJK font, and measured page breaks. */
export async function createProfilePdf(
  report: ProfileReport,
  suppliedFont?: Uint8Array,
) {
  const [{ PDFDocument, rgb }, fontkit] = await Promise.all([
    import('pdf-lib'),
    import('@pdf-lib/fontkit'),
  ]);
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit.default);
  const font = await doc.embedFont(suppliedFont || (await loadFont()), {
    subset: false,
  });
  doc.setTitle(`JUAI · ${report.title}`);
  doc.setAuthor('JUAI');
  doc.setSubject('Japan University Admission-Inspector / Japan University AI');
  const valid = new Set(font.getCharacterSet());
  const clean = (value: string) =>
    [...value.replaceAll(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')]
      .map((c) => (c === '\n' || valid.has(c.codePointAt(0) ?? 0) ? c : '□'))
      .join('');
  const accent = rgb(0.76, 0.22, 0.19);
  const ink = rgb(0.08, 0.16, 0.26);
  const line = rgb(0.84, 0.88, 0.92);
  const muted = rgb(0.35, 0.43, 0.53);
  const bottom = 58;
  const height = 841.89;
  const margin = 44;
  const width = 595.28;
  let activeRecord = '';
  let page = doc.addPage([width, height]);
  let y = height - 44;
  function newPage() {
    page = doc.addPage([width, height]);
    y = height - 44;
    page.drawText(`JUAI  /  ${report.title}`, {
      x: margin,
      y,
      font,
      size: 9,
      color: muted,
    });
    y -= 18;
    if (activeRecord) {
      page.drawText(clean([...activeRecord].slice(0, 45).join('')), {
        x: margin,
        y,
        font,
        size: 8,
        color: muted,
      });
      y -= 18;
    } else y -= 10;
  }
  function ensure(space: number) {
    if (y - space < bottom) newPage();
  }
  function lines(value: string, size: number, max: number) {
    const out: string[] = [];
    for (const p of clean(value).split('\n')) {
      let buffer = '';
      for (const ch of p) {
        if (buffer && font.widthOfTextAtSize(buffer + ch, size) > max) {
          out.push(buffer);
          buffer = '';
        }
        buffer += ch;
      }
      out.push(buffer);
    }
    return out;
  }
  function paragraph(value: string, size = 10, color = ink, indent = 0) {
    for (const valueLine of lines(value, size, width - margin * 2 - indent)) {
      ensure(size * 1.8);
      page.drawText(valueLine, { x: margin + indent, y, font, size, color });
      y -= size * 1.8;
    }
  }
  page.drawText('JUAI', { x: margin, y, font, size: 26, color: ink });
  page.drawRectangle({
    x: margin + 79,
    y: y + 3,
    width: 6,
    height: 6,
    color: accent,
  });
  y -= 28;
  paragraph(
    'Japan University Admission-Inspector / Japan University AI',
    8,
    muted,
  );
  y -= 16;
  paragraph(report.title, 24);
  y -= 7;
  paragraph(
    `${report.records.length} 份档案  ·  ${report.date}（JST）  ·  ${REPORT_DETAIL_LABELS[report.detail]}`,
    9,
    muted,
  );
  y -= 12;
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 1,
    color: line,
  });
  y -= 26;
  const columnWidth = (width - margin * 2 - 24) / 2;
  const compact = (field: { value: number | string }) =>
    String(field.value).length <= 110 &&
    lines(String(field.value), 10, columnWidth).length <= 3;
  function drawFields(fields: { label: string; value: number | string }[]) {
    for (let i = 0; i < fields.length; i++) {
      const a = fields[i];
      if (!a) continue;
      const b = fields[i + 1];
      if (compact(a) && b && compact(b)) {
        const values: [string[], string[]] = [
          lines(String(a.value), 10, columnWidth),
          lines(String(b.value), 10, columnWidth),
        ];
        const needed =
          18 + Math.max(values[0].length, values[1].length) * 18 + 13;
        ensure(needed);
        for (const [col, field] of [a, b].entries()) {
          const x = margin + col * (columnWidth + 24);
          page.drawText(clean(field.label), {
            x,
            y,
            font,
            size: 8,
            color: muted,
          });
          for (const [lineIndex, valueLine] of (values[col] || []).entries())
            page.drawText(valueLine, {
              x,
              y: y - 17 - lineIndex * 18,
              font,
              size: 10,
              color: ink,
            });
        }
        y -= needed;
        i++;
      } else {
        ensure(43);
        paragraph(a.label, 8, muted);
        paragraph(String(a.value), 10, ink);
        y -= 10;
      }
    }
  }
  for (const [index, record] of report.records.entries()) {
    if (index % 3 === 0)
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    activeRecord = record.title;
    if (index && report.detail !== 'overview') newPage();
    else ensure(150);
    paragraph(`${String(index + 1).padStart(2, '0')}  ${record.title}`, 16);
    paragraph(record.subtitle, 9, muted);
    paragraph(record.stage, 9, accent);
    y -= 10;
    for (const section of record.sections) {
      ensure(70);
      page.drawRectangle({
        x: margin,
        y: y - 7,
        width: 3,
        height: 16,
        color: accent,
      });
      paragraph(section.title, 11, ink, 11);
      y -= 5;
      drawFields(section.rows);
      y -= 7;
    }
    if (y - 26 >= bottom)
      page.drawLine({
        start: { x: margin, y },
        end: { x: width - margin, y },
        thickness: 0.5,
        color: line,
      });
    y -= 24;
  }
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawLine({
      start: { x: margin, y: 43 },
      end: { x: width - margin, y: 43 },
      thickness: 0.5,
      color: line,
    });
    p.drawText(clean('JUAI · 根据已保存记录整理，未知信息请核对原文。'), {
      x: margin,
      y: 27,
      font,
      size: 7,
      color: muted,
    });
    const n = `${i + 1} / ${pages.length}`;
    p.drawText(n, {
      x: width - margin - font.widthOfTextAtSize(n, 8),
      y: 27,
      font,
      size: 8,
      color: muted,
    });
  });
  return doc.save();
}
