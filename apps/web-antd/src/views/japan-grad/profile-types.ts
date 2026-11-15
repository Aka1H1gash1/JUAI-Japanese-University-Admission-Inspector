export interface LanguageRecord {
  id: string;
  type: string;
  result: string;
  date: string;
}

export interface Profile {
  languageRecords?: LanguageRecord[];
  displayName: string;
  email: string;
  school: string;
  major: string;
  education: string;
  language: string;
  interests: string;
  notes: string;
  admissionYear: number;
  identity: string;
}
