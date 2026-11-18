import { create } from "zustand";

export type ThemeMode = "light" | "dark";

interface ThemeModeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

export const useThemeMode = create<ThemeModeState>()(() => ({
  mode: "dark",
  setMode: () => {},
  toggle: () => {},
}));
