import { parentPort, workerData } from 'node:worker_threads';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

async function parse() {
  const { content, extension, imagePage } = workerData;
  if (extension === '.doc')
    throw new Error('旧 DOC 请先转换为 DOCX 或 PDF 后分析。原文件仍可下载。');
  if (extension === '.docx') {
    const mammoth = await import('mammoth');
    const { value } = await mammoth.extractRawText({
      buffer: Buffer.from(content),
    });
    if (value.length > 2_000_000)
      throw new Error('文档文字过多，请拆分后分析。');
    return {
      pages: [
        {
          page: 1,
          text: value,
          locator: 'DOCX 全文（页码不代表 Word 排版页码）',
        },
      ],
      warnings: ['DOCX 按全文定位，请结合原文段落核对；不生成排版页码。'],
    };
  }
  if (extension !== '.pdf') {
    const data = Buffer.from(content);
    const bom = data.subarray(0, 2).toString('hex');
    let value;
    if (bom === 'fffe')
      value = new TextDecoder('utf-16le', { fatal: true }).decode(data);
    else if (bom === 'feff')
      value = new TextDecoder('utf-16be', { fatal: true }).decode(data);
    else value = new TextDecoder('utf-8', { fatal: true }).decode(data);
    if (value.length > 2_000_000)
      throw new Error('文档文字过多，请拆分后分析。');
    const lines = value.split(/\r?\n/);
    const pages = [];
    for (let start = 0; start < lines.length; start += 100)
      pages.push({
        page: pages.length + 1,
        text: lines.slice(start, start + 100).join('\n'),
        locator: `第 ${start + 1}–${Math.min(start + 100, lines.length)} 行`,
      });
    return { pages, warnings: [] };
  }
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const assets = path.dirname(
    fileURLToPath(import.meta.resolve('pdfjs-dist/package.json')),
  );
  const task = pdfjs.getDocument({
    data: new Uint8Array(content),
    isEvalSupported: false,
    enableXfa: false,
    useSystemFonts: false,
    standardFontDataUrl: path.join(assets, 'standard_fonts/'),
    cMapUrl: path.join(assets, 'cmaps/'),
    cMapPacked: true,
    verbosity: 0,
  });
  const pdf = await task.promise;
  try {
    if (pdf.numPages > 300) throw new Error('最多分析 300 页，请拆分后上传。');
    if (imagePage) {
      if (
        !Number.isInteger(imagePage) ||
        imagePage < 1 ||
        imagePage > pdf.numPages
      )
        throw new Error('页码超出文件范围。');
      const { createCanvas } = await import('@napi-rs/canvas');
      const page = await pdf.getPage(imagePage);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(1.5, 2000 / Math.max(base.width, base.height));
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(
        Math.ceil(viewport.width),
        Math.ceil(viewport.height),
      );
      await page.render({
        canvasContext: canvas.getContext('2d'),
        canvas,
        viewport,
      }).promise;
      return { image: canvas.toBuffer('image/png').toString('base64') };
    }
    const pages = [];
    let characters = 0;
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const items = (await page.getTextContent()).items;
      let value = '',
        lastY;
      for (const item of items) {
        if (!('str' in item)) continue;
        const y = item.transform?.[5];
        if (
          lastY !== undefined &&
          Math.abs(y - lastY) > 3 &&
          value &&
          !value.endsWith('\n')
        )
          value += '\n';
        value += item.str + (item.hasEOL ? '\n' : ' ');
        lastY = y;
      }
      characters += value.length;
      if (characters > 2_000_000)
        throw new Error('文档文字过多，请拆分后分析。');
      pages.push({
        page: number,
        text: value.trim(),
        locator: `PDF 文件第 ${number} 页`,
      });
      page.cleanup();
    }
    const empty = pages
      .filter((page) => page.text.replace(/\s/g, '').length < 20)
      .map((page) => page.page);
    return {
      pages,
      warnings: empty.length
        ? [
            `第 ${empty.join('、')} 页文字不足，可能为扫描页或图表；请使用 Agent 的页面图像分析能力或人工核对。`,
          ]
        : [],
    };
  } finally {
    await pdf.destroy();
  }
}
parse()
  .then((result) => parentPort.postMessage({ result }))
  .catch((error) =>
    parentPort.postMessage({ error: error.message || '文档解析失败。' }),
  );
