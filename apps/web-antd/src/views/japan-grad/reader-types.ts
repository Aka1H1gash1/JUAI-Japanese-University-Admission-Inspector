import type { StoredDocument } from './documents';

export type NoteColor = 'blue' | 'green' | 'rose' | 'yellow';
export interface ReaderSource {
  id: string;
  documentId: string;
  sha256: string;
  title: string;
  page: number;
  locator: string;
  quote: string;
  matched: boolean;
}
export interface ReaderAssistantContext {
  documentId: string;
  sha256: string;
  title: string;
  page: number;
}
export interface AssistantNoteDraft {
  title: string;
  body: string;
  sources: ReaderSource[];
}
export interface DocumentAnchor {
  type: 'pdf' | 'text';
  page: number;
  quote: string;
  prefix: string;
  suffix: string;
  rects: number[][];
  version: 1;
}
export interface ReaderAnnotation {
  id: string;
  documentId: string;
  sha256: string;
  kind: 'highlight' | 'note';
  title: string;
  body: string;
  color: NoteColor;
  anchor: DocumentAnchor | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
}
export interface ReadingPosition {
  sha256: string;
  page: number;
  offset: number;
  zoom: string;
  rotation: number;
  updatedAt?: string;
}
export interface ReaderContext {
  document: StoredDocument;
  sha256: string;
  context: {
    university: string;
    major: string;
    owner: string;
    parentPath: string;
    parentLabel: string;
  };
  state: null | ReadingPosition;
  annotations: ReaderAnnotation[];
  related?: {
    id: string;
    title: string;
    kind: StoredDocument['kind'];
    year: number;
  }[];
}
export interface ReaderSelection {
  anchor: DocumentAnchor;
  x: number;
  y: number;
}
export interface TextDocument {
  sha256: string;
  pages: { page: number; text: string; locator: string }[];
  warnings: string[];
}
export const NOTE_COLORS: { value: NoteColor; label: string }[] = [
  { value: 'yellow', label: '黄色' },
  { value: 'green', label: '绿色' },
  { value: 'blue', label: '蓝色' },
  { value: 'rose', label: '粉色' },
];
