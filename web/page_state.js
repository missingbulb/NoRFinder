// The page's state, the one place the shell's controls are drawn from: a control changes the state, and every
// control that shows a part of it redraws from it; no control reaches into another.
export function pageState(initial) {
  const value = { ...initial }, watchers = {};
  return {
    get: (key) => value[key],
    // the fields that changed, each one's watchers in the order they came
    set(patch) {
      const changed = Object.keys(patch).filter((k) => value[k] !== patch[k]);
      Object.assign(value, patch);
      for (const k of changed) for (const fn of [...(watchers[k] || [])]) fn(value[k]);
    },
    // fn(value) now and on every change; a signal ends the watch
    watch(key, fn, { signal } = {}) {
      if (signal?.aborted) return;
      (watchers[key] ||= []).push(fn);
      signal?.addEventListener("abort", () => { watchers[key] = watchers[key].filter((w) => w !== fn); });
      fn(value[key]);
    },
  };
}
