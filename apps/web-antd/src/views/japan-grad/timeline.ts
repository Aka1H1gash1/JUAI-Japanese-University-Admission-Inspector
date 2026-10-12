import {
  TIMELINE_LABELS,
  timelineError,
} from '../../../../../local-server/timeline-fields.mjs';
export { TIMELINE_LABELS, timelineError };
export type TimelineKind = keyof typeof TIMELINE_LABELS;
export interface TimelineEntry {
  id: string;
  kind: TimelineKind;
  title: string;
  start: string;
  end: string;
  at: string;
  endAt: string;
  complete: boolean;
  notes: string;
  replaces: string;
}
export interface LabTimeline {
  events: TimelineEntry[];
  hiddenSources: string[];
}
export function emptyTimeline(): LabTimeline {
  return { events: [], hiddenSources: [] };
}
