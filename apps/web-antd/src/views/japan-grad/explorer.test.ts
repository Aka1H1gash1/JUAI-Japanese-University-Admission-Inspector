/* oxlint-disable typescript/no-non-null-assertion, unicorn/prefer-response-static-json -- The fixed fixtures contain a lab; Response construction also covers error statuses. */
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useExplorerStore } from './explorer';

const initial = () => ({
  version: 2,
  universities: [
    {
      id: 'u1',
      name: '大学',
      japaneseName: '',
      location: '',
      category: '国立',
      website: '',
      notes: '',
    },
  ],
  schools: [
    {
      id: 's1',
      universityId: 'u1',
      name: '研究科',
      japaneseName: '',
      research: '',
      website: '',
      notes: '',
    },
  ],
  majors: [
    {
      id: 'major1',
      schoolId: 's1',
      name: '专攻',
      japaneseName: '',
      research: '',
      website: '',
      notes: '',
    },
  ],
  professors: [],
  labs: [
    {
      id: 'lab1',
      majorId: 'major1',
      name: '研究室',
      japaneseName: '',
      research: '',
      website: '',
      notes: '',
      examNotes: '',
      applicationNotes: '',
      wantApply: false,
      tasks: [],
      timeline: { version: 3, events: [], hiddenSources: [] },
    },
  ],
});
function snapshot(data = initial(), revision = 1) {
  return { initialized: true, data, revision, workspace: '/tmp/test' };
}
function respond(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

describe('workspace mutations', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows optimistic edits during the request and rolls back on failure', async () => {
    let release!: (response: Response) => void;
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(respond(snapshot()))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            release = resolve;
          }),
      );
    vi.stubGlobal('fetch', fetch);
    const store = useExplorerStore();
    await store.load();
    const saving = store.toggleWantApply('lab1');
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(store.labs[0]!.wantApply).toBe(true);
    expect(store.saving).toBe(true);
    release(respond({ error: '写入失败' }, 500));
    await expect(saving).rejects.toThrow('写入失败');
    expect(store.labs[0]!.wantApply).toBe(false);
    expect(store.storageError).toBe('写入失败');
    expect(store.saving).toBe(false);
  });

  it('replays on the latest revision without duplicating new tasks or losing remote edits', async () => {
    const latest = initial();
    latest.labs[0]!.name = '其他页面的新名称';
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(respond(snapshot()))
      .mockResolvedValueOnce(respond({ error: '冲突' }, 409))
      .mockResolvedValueOnce(respond(snapshot(latest, 2)))
      .mockImplementationOnce((_url: string, options: RequestInit) => {
        const { data, revision } = JSON.parse(options.body as string);
        expect(revision).toBe(2);
        expect(data.labs[0].tasks).toHaveLength(1);
        expect(data.labs[0].name).toBe('其他页面的新名称');
        return Promise.resolve(respond(snapshot(data, 3)));
      });
    vi.stubGlobal('fetch', fetch);
    const store = useExplorerStore();
    await store.load();
    await store.saveLabTask('lab1', {
      id: '',
      kind: 'material',
      title: '成绩单',
      progress: 0,
      dueDate: '',
      notes: '',
    });
    expect(store.labs[0]!.tasks).toHaveLength(1);
    expect(store.storageError).toBe('');
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('retries a conflict only once and reports a failed refresh', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(respond(snapshot()))
      .mockResolvedValueOnce(respond({ error: '冲突' }, 409))
      .mockResolvedValueOnce(respond(snapshot(initial(), 2)))
      .mockResolvedValueOnce(respond({ error: '仍然冲突' }, 409));
    vi.stubGlobal('fetch', fetch);
    const store = useExplorerStore();
    await store.load();
    await expect(store.toggleWantApply('lab1')).rejects.toThrow('仍然冲突');
    expect(store.labs[0]!.wantApply).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(4);
    fetch
      .mockResolvedValueOnce(respond({ error: '冲突' }, 409))
      .mockRejectedValueOnce(new Error('服务离线'));
    await expect(store.toggleWantApply('lab1')).rejects.toThrow('服务离线');
    expect(store.storageError).toBe('服务离线');
    expect(store.saving).toBe(false);
  });

  it('preserves timeline versions when removing events', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(respond(snapshot()))
      .mockImplementationOnce((_url: string, options: RequestInit) => {
        const { data } = JSON.parse(options.body as string);
        expect(data.labs[0].timeline.version).toBe(3);
        return Promise.resolve(respond(snapshot(data, 2)));
      });
    vi.stubGlobal('fetch', fetch);
    const store = useExplorerStore();
    await store.load();
    await store.removeTimelineEvent('lab1', 'event1');
  });
});

it('sends only changed lab fields when row revisions are available', async () => {
  setActivePinia(createPinia());
  const original = { ...snapshot(), entityRevisions: { labs: { lab1: 7 } } };
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(respond(original))
    .mockImplementationOnce((url: string, options: RequestInit) => {
      expect(url).toBe('/api/japangrad/workspace/labs/lab1');
      expect(options.method).toBe('PATCH');
      expect(JSON.parse(options.body as string)).toEqual({
        revision: 7,
        patch: { wantApply: true },
      });
      const data = initial();
      data.labs[0]!.wantApply = true;
      return Promise.resolve(
        respond({
          ...snapshot(data, 2),
          entityRevisions: { labs: { lab1: 8 } },
        }),
      );
    });
  vi.stubGlobal('fetch', fetch);
  try {
    const store = useExplorerStore();
    await store.load();
    await store.toggleWantApply('lab1');
    expect(store.labs[0]!.wantApply).toBe(true);
    expect(store.storageError).toBe('');
  } finally {
    vi.unstubAllGlobals();
  }
});

it('replays an incremental task update using the latest row revision', async () => {
  setActivePinia(createPinia());
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      respond({ ...snapshot(), entityRevisions: { labs: { lab1: 7 } } }),
    )
    .mockResolvedValueOnce(respond({ error: '研究室已更新' }, 409))
    .mockResolvedValueOnce(
      respond({
        ...snapshot(initial(), 2),
        entityRevisions: { labs: { lab1: 9 } },
      }),
    )
    .mockImplementationOnce((url: string, options: RequestInit) => {
      expect(url).toBe('/api/japangrad/workspace/labs/lab1');
      const input = JSON.parse(options.body as string);
      expect(input.revision).toBe(9);
      expect(Object.keys(input.patch)).toEqual(['tasks']);
      expect(input.patch.tasks).toHaveLength(1);
      const data = initial();
      Object.assign(data.labs[0]!, input.patch);
      return Promise.resolve(
        respond({
          ...snapshot(data, 3),
          entityRevisions: { labs: { lab1: 10 } },
        }),
      );
    });
  vi.stubGlobal('fetch', fetch);
  try {
    const store = useExplorerStore();
    await store.load();
    await store.saveLabTask('lab1', {
      id: '',
      kind: 'material',
      title: '成绩单',
      progress: 0,
      dueDate: '',
      notes: '',
    });
    expect(store.labs[0]!.tasks).toHaveLength(1);
  } finally {
    vi.unstubAllGlobals();
  }
});
