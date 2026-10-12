export type DocumentKind =
  | 'answer'
  | 'guidelines'
  | 'paper'
  | 'question'
  | 'consent';
export interface StoredDocument {
  experienceId?: string;
  signed?: boolean;
  signedDate?: string;
  id: string;
  ownerType: 'major' | 'professor';
  ownerId: string;
  kind: DocumentKind;
  year: number;
  title: string;
  filename: string;
  path: string;
  size: number;
  mimeType?: string;
  charset?: string;
  sha256?: string;
  questionId: string;
  notes: string;
  authors: string;
  venue: string;
  createdAt: string;
}
export const kindLabels: Record<DocumentKind, string> = {
  guidelines: '募集要项',
  question: '过去问',
  answer: '对应答案',
  paper: '论文',
  consent: '内诺文件',
};
export function fileUrl(id: string) {
  return `/api/japangrad/documents/${encodeURIComponent(id)}/file`;
}
export function fileSize(size: number) {
  return size >= 1024 * 1024
    ? `${(size / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.ceil(size / 1024)} KB`;
}

export const supportedFileAccept = '.pdf,.doc,.docx,.md,.txt';
export function fileFormat(filename: string) {
  return filename.split('.').at(-1)?.toUpperCase() || '文件';
}
export function isWord(document: StoredDocument) {
  return /\.docx?$/i.test(document.filename);
}
export function requiresDownload(document: StoredDocument) {
  return isWord(document) || document.charset === 'unknown';
}
export function readerLabel(document: StoredDocument) {
  if (isWord(document)) return '下载 Word 文件';
  if (document.charset === 'unknown') return '下载文本文件';
  if (fileFormat(document.filename) === 'PDF') return '用浏览器打开 PDF';
  return '浏览器阅读文本';
}
