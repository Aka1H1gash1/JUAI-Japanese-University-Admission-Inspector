import type { ProfessorContact } from './application-planning';
import type { StoredDocument } from './documents';

import { ref } from 'vue';

import { defineStore } from 'pinia';

import { localApi } from './local-api';
export interface MailRecord {
  sender?: string;
  recipient?: string;
  id: string;
  professorId: string;
  experienceId: string;
  direction: 'received' | 'sent';
  subject: string;
  body: string;
  address: string;
  date: string;
  notes: string;
  nextAction: string;
  followUpDate: string;
  createdAt: string;
}
export const useCommunicationsStore = defineStore('juai-communications', () => {
  const documents = ref<Record<string, StoredDocument[]>>({});
  const errorMessage = ref('');
  const loading = ref(false);
  const mails = ref<Record<string, MailRecord[]>>({});
  const contactDrafts = ref<
    Record<
      string,
      { value: ProfessorContact; base: ProfessorContact; conflict: boolean }
    >
  >({});
  const requirements = ref<Record<string, Record<string, string>>>({});
  let requirementsRevision = -1;
  const generations = new Map<string, number>();
  async function load(ids: string[]) {
    const unique = [...new Set(ids)].filter(Boolean);
    if (unique.length === 0) return;
    const versions = new Map(
      unique.map((id) => {
        const next = (generations.get(id) ?? 0) + 1;
        generations.set(id, next);
        return [id, next];
      }),
    );
    loading.value = true;
    errorMessage.value = '';
    try {
      for (let start = 0; start < unique.length; start += 100) {
        const batch = unique.slice(start, start + 100);
        const data = await localApi<{
          messages: MailRecord[];
          documents: StoredDocument[];
          requirements: Record<string, Record<string, string>>;
          revision: number;
        }>(`/experience-library?professorIds=${batch.join(',')}`);
        if (data.revision >= requirementsRevision) {
          requirements.value = { ...requirements.value, ...data.requirements };
          requirementsRevision = data.revision;
        }
        for (const id of batch)
          if (generations.get(id) === versions.get(id)) {
            mails.value[id] = data.messages
              .filter((m) => m.professorId === id)
              .toSorted(
                (a, b) =>
                  a.date.localeCompare(b.date) ||
                  a.createdAt.localeCompare(b.createdAt) ||
                  a.id.localeCompare(b.id),
              );
            documents.value[id] = data.documents.filter(
              (d) => d.ownerId === id,
            );
          }
      }
    } catch (error) {
      errorMessage.value =
        error instanceof Error ? error.message : '关联资料读取失败。';
    } finally {
      loading.value = false;
    }
  }
  function forExperience(professorId: string, experienceId: string) {
    return (mails.value[professorId] ?? []).filter(
      (m) => m.experienceId === experienceId,
    );
  }
  function papers(professorId: string) {
    return (documents.value[professorId] ?? []).filter(
      (d) => d.kind === 'paper',
    );
  }
  function consentFiles(professorId: string, experienceId: string) {
    return (documents.value[professorId] ?? []).filter(
      (d) => d.kind === 'consent' && d.experienceId === experienceId,
    );
  }
  return {
    mails,
    documents,
    requirements,
    contactDrafts,
    error: errorMessage,
    loading,
    load,
    forExperience,
    papers,
    consentFiles,
  };
});
