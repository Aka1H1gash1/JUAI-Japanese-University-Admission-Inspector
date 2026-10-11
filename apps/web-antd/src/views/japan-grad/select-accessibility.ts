import type { Directive } from 'vue';

// Keep the installed Select component's behavior while exposing complete ARIA
// state on its actual focusable input. Closed dropdowns must not reference
// option nodes that have not been mounted.
interface SelectState {
  observer: MutationObserver;
  frame: number;
  references: Record<string, string>;
  sync: () => void;
}
const states = new WeakMap<HTMLElement, SelectState>();
const referenceAttributes = [
  'aria-controls',
  'aria-owns',
  'aria-activedescendant',
];

export const vAccessibleSelect: Directive<HTMLElement> = {
  mounted(element) {
    const references: Record<string, string> = {};
    const sync = () => {
      const input = element.querySelector<HTMLInputElement>(
        'input[role="combobox"]',
      );
      if (!input) return;
      const label =
        element.getAttribute('aria-label') ||
        element
          .closest('.field')
          ?.querySelector('label')
          ?.textContent?.trim() ||
        element.getAttribute('placeholder') ||
        '选择选项';
      if (input.getAttribute('aria-label') !== label)
        input.setAttribute('aria-label', label);
      const expanded = element.classList.contains('ant-select-open');
      if (input.getAttribute('aria-expanded') !== String(expanded))
        input.setAttribute('aria-expanded', String(expanded));
      for (const attribute of referenceAttributes) {
        const current = input.getAttribute(attribute);
        if (current) references[attribute] = current;
        const value = references[attribute];
        const valid =
          value &&
          value.split(/\s+/).every((id) => document.getElementById(id));
        const include =
          valid && (expanded || attribute !== 'aria-activedescendant');
        if (!include && input.hasAttribute(attribute))
          input.removeAttribute(attribute);
        else if (include && input.getAttribute(attribute) !== value)
          input.setAttribute(attribute, value);
      }
    };
    const state: SelectState = {
      observer: new MutationObserver(() => {
        sync();
        cancelAnimationFrame(state.frame);
        state.frame = requestAnimationFrame(sync);
      }),
      frame: 0,
      references,
      sync,
    };
    states.set(element, state);
    state.observer.observe(element, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        'class',
        'id',
        'aria-label',
        'aria-expanded',
        ...referenceAttributes,
      ],
    });
    sync();
  },
  updated(element) {
    states.get(element)?.sync();
  },
  unmounted(element) {
    const state = states.get(element);
    state?.observer.disconnect();
    if (state) cancelAnimationFrame(state.frame);
    states.delete(element);
  },
};
