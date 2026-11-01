import type { CollectionJob } from './collection-types';

import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { useCollectionJobsStore } from './collection-jobs';

const job = (status: CollectionJob['status']) =>
  ({ id: 'job1', status }) as CollectionJob;
const response = (status: CollectionJob['status']) =>
  new Response(JSON.stringify([job(status)]));
beforeEach(() => {
  setActivePinia(createPinia());
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('polls in the background, reports completion once, and stops cleanly', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(response('analyzing'))
    .mockImplementation(() => Promise.resolve(response('review')));
  vi.stubGlobal('fetch', fetch);
  const store = useCollectionJobsStore();
  store.start();
  store.start();
  await vi.advanceTimersByTimeAsync(0);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(store.running).toBe(1);
  await vi.advanceTimersByTimeAsync(3000);
  expect(store.running).toBe(0);
  expect(store.completed).toBe(1);
  await vi.advanceTimersByTimeAsync(20_000);
  expect(store.completed).toBe(1);
  store.stop();
  await vi.advanceTimersByTimeAsync(30_000);
  expect(fetch).toHaveBeenCalledTimes(3);
});

it('does not restart a timer after stopping an in-flight request', async () => {
  let release!: (response: Response) => void;
  const fetch = vi.fn().mockImplementation(
    () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
  );
  vi.stubGlobal('fetch', fetch);
  const store = useCollectionJobsStore();
  store.start();
  store.stop();
  release(response('analyzing'));
  await vi.advanceTimersByTimeAsync(60_000);
  expect(store.running).toBe(0);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it('immediately tracks new tasks and distinguishes failed tasks from success', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response('[]'))
    .mockResolvedValueOnce(response('failed'));
  vi.stubGlobal('fetch', fetch);
  const store = useCollectionJobsStore();
  store.start();
  await vi.advanceTimersByTimeAsync(0);
  store.track(job('preparing'));
  expect(store.running).toBe(1);
  await vi.advanceTimersByTimeAsync(0);
  expect(store.running).toBe(0);
  expect(store.completed).toBe(0);
  expect(store.ended).toBe(1);
  store.stop();
});
