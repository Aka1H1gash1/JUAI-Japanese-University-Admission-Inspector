import { requireValue } from './required-value';
// The local service ships the same PDF.js engine and worker; no CDN is required.
export type {
  PDFDocumentProxy,
  PDFPageProxy,
  RenderTask,
} from '../../../../../local-server/node_modules/pdfjs-dist/types/src/display/api';
export type { PageViewport } from '../../../../../local-server/node_modules/pdfjs-dist/types/src/display/page_viewport';
type PdfEngine =
  typeof import('../../../../../local-server/node_modules/pdfjs-dist/types/src/pdf');
const assetBase = '/api/japangrad/reader-assets';
let engine: Promise<PdfEngine> | undefined;
export function loadPdfEngine() {
  engine ??= import(/* @vite-ignore */ `${assetBase}/build/pdf.mjs`)
    .then((module) => {
      module.GlobalWorkerOptions.workerSrc = `${assetBase}/build/pdf.worker.mjs`;
      return module as PdfEngine;
    })
    .catch((error) => {
      engine = undefined;
      throw error;
    });
  return engine;
}
export const pdfAssetOptions = {
  cMapUrl: `${assetBase}/cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `${assetBase}/standard_fonts/`,
  wasmUrl: `${assetBase}/wasm/`,
  iccUrl: `${assetBase}/iccs/`,
  isEvalSupported: false,
  enableXfa: false,
  verbosity: 0,
};
export function normalizeSearch(text: string) {
  return text.normalize('NFKC').toLocaleLowerCase().replaceAll(/\s+/g, '');
}

// Preserve the character-to-DOM mapping rather than replacing PDF.js text spans.
export function matchingRects(layer: HTMLElement, query: string) {
  const needle = normalizeSearch(query);
  if (!needle) return [];
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
  const mapping: { node: Text; offset: number }[] = [];
  let value = '';
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent || '';
    for (let index = 0; index < text.length;) {
      const original = String.fromCodePoint(
        requireValue(text.codePointAt(index)),
      );
      const normalized = normalizeSearch(original);
      for (let i = 0; i < normalized.length; i++)
        mapping.push({ node: node as Text, offset: index });
      value += normalized;
      index += original.length;
    }
  }
  const matches: DOMRect[][] = [];
  let from = 0;
  while (matches.length < 100) {
    const start = value.indexOf(needle, from);
    if (start === -1) break;
    const a = mapping[start];
    const b = mapping[start + needle.length - 1];
    if (a && b) {
      const range = document.createRange();
      range.setStart(a.node, a.offset);
      const last = String.fromCodePoint(
        requireValue((b.node.textContent || '').codePointAt(b.offset)),
      );
      range.setEnd(b.node, b.offset + last.length);
      matches.push(
        [...range.getClientRects()].filter(
          (rect) => rect.width > 0 && rect.height > 0,
        ),
      );
    }
    from = start + needle.length;
  }
  return matches;
}
