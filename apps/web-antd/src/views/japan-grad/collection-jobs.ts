import type { CollectionJob } from './collection-types';

import { ref } from 'vue';

import { defineStore } from 'pinia';

import { localApi } from './local-api';

const RUNNING = new Set(['analyzing', 'collecting', 'preparing']);

export const useCollectionJobsStore = defineStore(
  'japangrad-collection-jobs',
  () => {
    const running = ref(0);
    const completed = ref(0);
    const ended = ref(0);
    let active = false;
    let generation = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tracked = new Set<string>();

    async function tick(token: number) {
      try {
        const jobs = await localApi<CollectionJob[]>('/collection/jobs');
        if (!active || token !== generation) return;
        for (const job of jobs) {
          if (tracked.has(job.id) && !RUNNING.has(job.status)) {
            if (job.status === 'review' || job.status === 'applied')
              completed.value++;
            else ended.value++;
            tracked.delete(job.id);
          }
          if (RUNNING.has(job.status)) tracked.add(job.id);
        }
        running.value = jobs.filter((job) => RUNNING.has(job.status)).length;
      } catch {
        // A navigation badge should not interrupt work when the service is unavailable.
      }
      if (active && token === generation)
        timer = setTimeout(
          () => void tick(token),
          running.value > 0 ? 3000 : 20_000,
        );
    }

    function start() {
      if (active) return;
      active = true;
      void tick(++generation);
    }
    function stop() {
      active = false;
      generation++;
      clearTimeout(timer);
      timer = undefined;
      tracked.clear();
    }
    function track(job: CollectionJob) {
      if (RUNNING.has(job.status) && !tracked.has(job.id)) {
        tracked.add(job.id);
        running.value++;
      }
      // Refresh immediately even when the previous idle interval was 20 seconds.
      if (active) {
        clearTimeout(timer);
        void tick(++generation);
      }
    }
    return { running, completed, ended, start, stop, track };
  },
);
