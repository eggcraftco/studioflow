"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";

// Switching sections unmounts the old one, so an edit that was never saved is
// simply gone — no warning, no trace. Guarding that needs one thing the page
// did not have: a section that can say "I hold an edit nobody has stored yet".
//
// It has to be per-section and opt-in rather than one global flag, because the
// Settings page mixes three save models. Only sections with a draft plus a Save
// button register here. Controls that write the moment they change (auto-lock,
// the workflow template buttons, the browser upload-policy acceptance) never
// do — a flag they set would never be cleared by any Save, and every later
// section change would warn about nothing.

type DirtyMap = Record<string, boolean>;
type SaveHandler = () => Promise<void>;

type SettingsDirtyValue = {
  dirtySections: DirtyMap;
  setSectionDirty: (sectionId: string, dirty: boolean, save: SaveHandler | null) => void;
  saveHandlerFor: (sectionId: string) => SaveHandler | null;
};

const SettingsDirtyContext = createContext<SettingsDirtyValue>({
  dirtySections: {},
  setSectionDirty: () => {},
  saveHandlerFor: () => null
});

/**
 * Owns the dirty map. The Settings page calls this itself rather than wrapping
 * a provider component, because the page needs to read the map (for the sidebar
 * markers and the navigation guards) as well as provide it.
 */
export function useProvideSettingsDirty() {
  const [dirtySections, setDirtySections] = useState<DirtyMap>({});
  const saveHandlers = useRef<Record<string, SaveHandler | null>>({});

  const setSectionDirty = useCallback((sectionId: string, dirty: boolean, save: SaveHandler | null) => {
    saveHandlers.current[sectionId] = save;
    setDirtySections(previous => (previous[sectionId] === dirty ? previous : { ...previous, [sectionId]: dirty }));
  }, []);

  const saveHandlerFor = useCallback((sectionId: string) => saveHandlers.current[sectionId] ?? null, []);

  const value = useMemo(
    () => ({ dirtySections, setSectionDirty, saveHandlerFor }),
    [dirtySections, setSectionDirty, saveHandlerFor]
  );

  return value;
}

export function SettingsDirtyProvider({ value, children }: { value: SettingsDirtyValue; children: ReactNode }) {
  return <SettingsDirtyContext.Provider value={value}>{children}</SettingsDirtyContext.Provider>;
}

export function useSettingsDirty() {
  return useContext(SettingsDirtyContext);
}

// Key order is stable for a given draft shape, but sorting makes the comparison
// independent of how a section happens to build its object.
function stableSerialize(value: unknown): string {
  return JSON.stringify(value, (_key, raw) => {
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const source = raw as Record<string, unknown>;
      return Object.keys(source)
        .sort()
        .reduce<Record<string, unknown>>((sorted, key) => {
          sorted[key] = source[key];
          return sorted;
        }, {});
    }
    return raw;
  });
}

/**
 * Track one section's unsaved edits.
 *
 * `ready` must be false until the section's own async seeding has finished.
 * The baseline is captured the first time it turns true, so loading a section
 * — which for thirteen of them means a callable resolving after first paint —
 * is never mistaken for an edit. Sections that mint `crypto.randomUUID()` rows
 * as defaults are covered by the same rule: the baseline is the seeded draft,
 * not the stored document it can never equal.
 *
 * Call `markSaved()` after a save succeeds to re-baseline.
 */
export function useUnsavedGuard<T>(
  sectionId: string,
  value: T,
  ready: boolean,
  save?: SaveHandler
) {
  const { setSectionDirty } = useSettingsDirty();
  const baseline = useRef<string | null>(null);
  const serialized = useMemo(() => stableSerialize(value), [value]);
  const latest = useRef(serialized);
  latest.current = serialized;

  if (ready && baseline.current === null) baseline.current = serialized;
  if (!ready) baseline.current = null;

  const dirty = ready && baseline.current !== null && baseline.current !== serialized;

  const saveRef = useRef<SaveHandler | undefined>(save);
  saveRef.current = save;
  const stableSave = useCallback<SaveHandler>(async () => {
    if (saveRef.current) await saveRef.current();
  }, []);

  useEffect(() => {
    setSectionDirty(sectionId, dirty, save ? stableSave : null);
  }, [sectionId, dirty, save, stableSave, setSectionDirty]);

  useEffect(() => () => setSectionDirty(sectionId, false, null), [sectionId, setSectionDirty]);

  const markSaved = useCallback(() => {
    baseline.current = latest.current;
    setSectionDirty(sectionId, false, saveRef.current ? stableSave : null);
  }, [sectionId, setSectionDirty, stableSave]);

  return { dirty, markSaved };
}
