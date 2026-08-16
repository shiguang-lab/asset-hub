import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeMode = "light" | "dark";

interface ThemeModeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

export const useThemeMode = create<ThemeModeState>()(
  persist(
    (set, get) => ({
      mode: "dark",
      setMode: (mode) => set({ mode }),
      toggle: () => set({ mode: get().mode === "dark" ? "light" : "dark" }),
    }),
    { name: "sg-theme-mode" },
  ),
);
