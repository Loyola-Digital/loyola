import { create } from "zustand";
import { persist } from "zustand/middleware";

interface HiddenProjectsStore {
  hiddenIds: string[];
  showHidden: boolean;
  hide: (id: string) => void;
  show: (id: string) => void;
  toggle: (id: string) => void;
  clearAll: () => void;
  setShowHidden: (value: boolean) => void;
  toggleShowHidden: () => void;
  isHidden: (id: string) => boolean;
}

export const useHiddenProjectsStore = create<HiddenProjectsStore>()(
  persist(
    (set, get) => ({
      hiddenIds: [],
      showHidden: false,
      hide: (id) =>
        set((s) => ({
          hiddenIds: s.hiddenIds.includes(id) ? s.hiddenIds : [...s.hiddenIds, id],
        })),
      show: (id) =>
        set((s) => ({ hiddenIds: s.hiddenIds.filter((x) => x !== id) })),
      toggle: (id) =>
        set((s) => ({
          hiddenIds: s.hiddenIds.includes(id)
            ? s.hiddenIds.filter((x) => x !== id)
            : [...s.hiddenIds, id],
        })),
      clearAll: () => set({ hiddenIds: [] }),
      setShowHidden: (value) => set({ showHidden: value }),
      toggleShowHidden: () => set((s) => ({ showHidden: !s.showHidden })),
      isHidden: (id) => get().hiddenIds.includes(id),
    }),
    {
      name: "loyola:hidden-projects",
    },
  ),
);
