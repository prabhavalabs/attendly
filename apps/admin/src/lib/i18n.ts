/**
 * Lightweight i18n (SRS NFR-8). English + Sinhala UI strings, switched by the
 * EN/සිං toggle (ui-store language). Add keys here and use `useT()` in components.
 * Mixed scripts stay aligned via the Noto Sans Sinhala fallback in the theme.
 */
import { useUiStore } from "./ui-store";

type Entry = { en: string; si: string };

const DICT = {
  // Navigation (Sinhala terms from the design system)
  "nav.dashboard": { en: "Dashboard", si: "උපකරණ පුවරුව" },
  "nav.students": { en: "Students", si: "සිසුන්" },
  "nav.classes": { en: "Classes", si: "පන්ති" },
  "nav.timetable": { en: "Timetable", si: "කාලසටහන" },
  "nav.sessions": { en: "Sessions", si: "සැසි" },
  "nav.attendance": { en: "Attendance", si: "පැමිණීම" },
  "nav.billing": { en: "Billing", si: "ගෙවීම්" },
  "nav.reports": { en: "Reports", si: "වාර්තා" },
  "nav.notifications": { en: "Notifications", si: "දැනුම්දීම්" },
  "nav.users": { en: "Users & Roles", si: "පරිශීලකයින්" },
  "nav.settings": { en: "Settings", si: "සැකසුම්" },
  "group.operations": { en: "Operations", si: "මෙහෙයුම්" },
  "group.administration": { en: "Administration", si: "පරිපාලනය" },

  // Shell
  "shell.search": { en: "Search students, pages…", si: "සිසුන්, පිටු සොයන්න…" },
  "shell.notifications": { en: "Notifications", si: "දැනුම්දීම්" },

  // Dashboard
  "dash.welcome": { en: "Welcome back", si: "නැවත සාදරයෙන් පිළිගනිමු" },
  "dash.subtitle": { en: "Here's the shape of your class at a glance.", si: "ඔබේ පන්තියේ වත්මන් තත්ත්වය එක් බැල්මකින්." },
  "dash.activeStudents": { en: "Active students", si: "ක්‍රියාකාරී සිසුන්" },
  "dash.todaySessions": { en: "Today's sessions", si: "අද සැසි" },
  "dash.outstanding": { en: "Outstanding fees", si: "හිඟ ගෙවීම්" },
  "dash.attendanceRate": { en: "Attendance rate", si: "පැමිණීමේ අනුපාතය" },
  "dash.enrolledTerm": { en: "Enrolled this term", si: "මෙම වාරයේ ලියාපදිංචි" },
  "dash.acrossClasses": { en: "Across all classes", si: "සියලු පන්ති හරහා" },
  "dash.awaitingCollection": { en: "Awaiting collection", si: "එකතු කිරීමට ඇත" },
  "dash.rolling30": { en: "Rolling 30 days", si: "පසුගිය දින 30" },
  "dash.todayHeading": { en: "Today's sessions", si: "අද සැසි" },
  "dash.noSessionsToday": { en: "No sessions scheduled today.", si: "අද කිසිදු සැසියක් නියමිත නැත." },
  "dash.topDefaulters": { en: "Top defaulters", si: "ප්‍රධාන හිඟකරුවන්" },
  "dash.allPaid": { en: "Everyone's paid up.", si: "සියල්ලෝම ගෙවා ඇත." },
  "dash.recentActivity": { en: "Recent activity", si: "මෑත ක්‍රියාකාරකම්" },

  // Login
  "login.welcome": { en: "Welcome back", si: "නැවත සාදරයෙන් පිළිගනිමු" },
  "login.subtitle": { en: "Sign in to the attendly admin portal.", si: "attendly පරිපාලන පෝට්ලයට පිවිසෙන්න." },
  "login.email": { en: "Email", si: "විද්‍යුත් තැපෑල" },
  "login.password": { en: "Password", si: "මුරපදය" },
  "login.signIn": { en: "Sign in", si: "පිවිසෙන්න" },
  "login.signingIn": { en: "Signing in…", si: "පිවිසෙමින්…" },
  "login.footer": { en: "attendly — attendance, billing & notifications.", si: "attendly — පැමිණීම, ගෙවීම් සහ දැනුම්දීම්." },
} satisfies Record<string, Entry>;

export type I18nKey = keyof typeof DICT;
export type Language = "en" | "si";

export function translate(key: I18nKey, lang: Language): string {
  return DICT[key][lang];
}

/** Hook returning a translator bound to the current language. */
export function useT(): (key: I18nKey) => string {
  const lang = useUiStore((s) => s.language);
  return (key) => DICT[key][lang];
}
