/* eslint-disable vue/one-component-per-file, vue/require-prop-types -- Lightweight DOM controls isolate the review protocol from Ant Design internals. */
import type { Component } from 'vue';

import { createApp, h, nextTick } from 'vue';

import { describe, expect, it, vi } from 'vitest';

import Review from './collection-review.vue';
const flushPromises = async () => {
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
};
function mount(
  component: Component,
  options: { props: Record<string, unknown> },
) {
  const root = document.createElement('div');
  document.body.append(root);
  const app = createApp({ render: () => h(component, options.props) });
  app.mount(root);
  return {
    findAll: (selector: string) =>
      [...root.querySelectorAll(selector)].map((element) => ({
        text: () => element.textContent?.trim(),
        trigger: async (_event: string) => {
          (element as HTMLElement).click();
          await nextTick();
        },
      })),
    text: () => root.textContent ?? '',
    unmount: () => {
      app.unmount();
      root.remove();
    },
  };
}

const mocks = vi.hoisted(() => ({ api: vi.fn(), refresh: vi.fn() }));
vi.mock('../local-api', () => ({
  localApi: mocks.api,
  jsonOptions: (method: string, body: unknown) => ({
    method,
    body: JSON.stringify(body),
  }),
}));
vi.mock('../explorer', () => ({
  useExplorerStore: () => ({
    universities: [{ id: 'u1', name: '已有大学', notes: '保留说明' }],
    schools: [],
    majors: [],
    labs: [],
    professors: [],
    refresh: mocks.refresh,
  }),
}));
vi.mock('ant-design-vue', async () => {
  const { defineComponent, h } = await import('vue');
  const field = (tag: string) =>
    defineComponent({
      props: ['value', 'checked', 'disabled', 'options'],
      emits: ['update:value', 'update:checked', 'change'],
      setup:
        (props, { emit, slots, attrs }) =>
        () =>
          h(
            tag,
            {
              ...attrs,
              value: props.value,
              checked: props.checked,
              disabled: props.disabled,
              onChange: (event: Event) => {
                const target = event.target as HTMLInputElement;
                emit('update:value', target.value);
                emit('update:checked', target.checked);
                emit('change', event);
              },
            },
            tag === 'select'
              ? props.options?.map((o: { value: string; label: string }) =>
                  h('option', { value: o.value }, o.label),
                )
              : slots.default?.(),
          ),
    });
  const input = field('input');
  return {
    App: { useApp: () => ({ message: { info: vi.fn(), success: vi.fn() } }) },
    Button: field('button'),
    Checkbox: field('input'),
    Select: field('select'),
    Input: Object.assign(input, { TextArea: field('textarea') }),
    Modal: defineComponent({
      props: ['open'],
      setup:
        (props, { slots }) =>
        () =>
          props.open ? h('div', slots.default?.()) : null,
    }),
  };
});

const props = (existing = true) => ({
  detail: {
    revision: 4,
    matches: {
      university: existing ? ['u1'] : [],
      school: [],
      major: [],
      lab: [],
      professor: [],
    },
    job: {
      id: 'job1',
      ruleVersion: 3,
      importPolicy: 'create_only',
      requestedKind: 'university',
      urls: ['https://example.edu'],
      draft: {
        subject: { kind: 'university' },
        university: [
          {
            field: 'name',
            value: existing ? '已有大学' : '新大学',
            evidence: [],
          },
          { field: 'notes', value: '来源说明', evidence: [] },
        ],
        school: [],
        major: [],
        lab: [],
        professor: [],
        documents: [],
        exams: [],
        warnings: [],
      },
    },
  },
  config: {
    fieldDefinitions: {
      university: [
        ['name', '名称', 4000],
        ['notes', '说明', 4000],
      ],
      school: [],
      major: [],
      lab: [],
      professor: [],
    },
    examFields: [],
  },
});

describe('create-only collection review', () => {
  it('keeps an existing principal read-only and sends ID-only links to the server preview', async () => {
    mocks.api.mockResolvedValue({
      state: 'ready',
      planId: 'p',
      planHash: 'h',
      baseRevision: 4,
      counts: { createdEntities: 0, linkedEntities: 1 },
      operations: [{ kind: 'university', name: '已有大学', action: 'linked' }],
      resources: {},
    });
    const wrapper = mount(Review, { props: props() });
    expect(wrapper.findAll('textarea')).toHaveLength(0);
    expect(wrapper.text()).toContain('当前资料保持不变');
    expect(wrapper.text()).not.toContain('确认替换');
    await wrapper
      .findAll('button')
      .find((b) => b.text() === '确认新增')
      ?.trigger('click');
    await flushPromises();
    const lastCall = mocks.api.mock.calls.at(-1);
    expect(lastCall).toBeDefined();
    if (!lastCall) throw new Error('Preview request was not sent');
    const [route, request] = lastCall;
    expect(route).toContain('/import-plan');
    expect(JSON.parse(request.body).entities.university).toEqual({
      action: 'link',
      id: 'u1',
    });
    wrapper.unmount();
  });
  it('offers evidence-backed detailed fields on a newly created ancestor', () => {
    const wrapper = mount(Review, { props: props(false) });
    expect(wrapper.findAll('textarea')).toHaveLength(2);
    expect(wrapper.text()).not.toContain('当前资料保持不变');
    wrapper.unmount();
  });
});
