/** Lightweight UI/session state (language, etc.). Full i18n lands in M7. */
import { create } from "zustand";

export type Language = "en" | "si";

interface UiState {
  language: Language;
  setLanguage: (lang: Language) => void;
}

const LANG_KEY = "classdesk.lang";

export const useUiStore = create<UiState>((set) => ({
  language: ((): Language => {
    const v = localStorage.getItem(LANG_KEY);
    return v === "si" ? "si" : "en";
  })(),
  setLanguage: (language) => {
    localStorage.setItem(LANG_KEY, language);
    set({ language });
  },
}));
