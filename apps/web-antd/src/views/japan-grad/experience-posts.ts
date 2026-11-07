export interface ExperiencePost {
  id: string;
  schoolId: string;
  majorId: string;
  title: string;
  url: string;
  author: string;
  language: string;
  year: string;
  notes: string;
  origin: 'manual' | 'search';
  version: number;
}
export interface ExperienceSearch {
  status?: 'complete' | 'failed' | 'searching';
  query: string;
  provider?: string;
  error?: string;
  results: { title: string; url: string; snippet: string }[];
}
