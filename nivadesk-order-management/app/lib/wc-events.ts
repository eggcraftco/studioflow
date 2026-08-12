// React 18 does not attach JSX event props (onClick/onChange) to custom
// elements, so Polaris web components silently ignore them inside the embedded
// iframe. These ref helpers attach real DOM listeners instead — native events
// always fire on custom elements.
//
// The ref callback only runs when the element mounts, so handlers are swapped
// on re-attach to avoid duplicates; closures should read live data (form
// contents, refs) at event time rather than captured render state.

type AnyHandler = (event: Event) => void;

function wcOn(type: string, handler: AnyHandler) {
  return (el: Element | null) => {
    if (!el) return;
    const holder = el as Element & Record<string, AnyHandler | undefined>;
    const key = `__wc_${type}`;
    const previous = holder[key];
    if (previous) el.removeEventListener(type, previous);
    holder[key] = handler;
    el.addEventListener(type, handler);
  };
}

export const wcClick = (handler: AnyHandler) => wcOn("click", handler);
export const wcChange = (handler: AnyHandler) => wcOn("change", handler);
export const wcInput = (handler: AnyHandler) => wcOn("input", handler);
