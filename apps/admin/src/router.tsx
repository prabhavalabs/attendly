import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
  Outlet,
} from "@tanstack/react-router";

import type { StudentStatus } from "@tuition/shared";

import { useAuthStore, checkPermission } from "@/lib/auth-store";
import { asPage, asString } from "@/lib/url-search";
import { AppShell } from "@/components/layout/app-shell";
import { Placeholder } from "@/routes/placeholder";
import LoginPage from "@/routes/login";
import DashboardPage from "@/routes/dashboard";
import UsersPage from "@/routes/users/index";
import StudentsPage from "@/routes/students/index";
import StudentDetailPage from "@/routes/students/detail";
import ClassesPage from "@/routes/classes/index";
import ClassDetailPage from "@/routes/classes/detail";
import TimetablePage from "@/routes/timetable/index";
import SessionsPage from "@/routes/sessions/index";
import SessionRosterPage from "@/routes/sessions/roster";
import AttendancePage from "@/routes/attendance/index";
import BillingPage from "@/routes/billing/index";
import ReportsPage from "@/routes/reports/index";
import NotificationsPage from "@/routes/notifications/index";
import SettingsPage from "@/routes/settings/index";

const rootRoute = createRootRoute({ component: () => <Outlet /> });

/** Public login; bounce to the dashboard if already signed in. */
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  beforeLoad: () => {
    if (useAuthStore.getState().status === "authenticated") {
      throw redirect({ to: "/" });
    }
  },
  component: LoginPage,
});

/** Authenticated area — guarded; renders the app shell. */
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  beforeLoad: () => {
    if (useAuthStore.getState().status !== "authenticated") {
      throw redirect({ to: "/login" });
    }
  },
  component: AppShell,
});

function guard(perm: string) {
  return () => {
    if (!checkPermission(perm)) throw redirect({ to: "/" });
  };
}

const dashboardRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/",
  component: DashboardPage,
});

const usersRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/users",
  beforeLoad: guard("user.read"),
  component: UsersPage,
});

const STUDENT_STATUSES: StudentStatus[] = ["active", "inactive", "graduated", "withdrawn"];

export type StudentsSearch = { page?: number; q?: string; status?: StudentStatus };

const studentsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/students",
  beforeLoad: guard("student.read"),
  validateSearch: (s: Record<string, unknown>): StudentsSearch => {
    const out: StudentsSearch = {};
    if (STUDENT_STATUSES.includes(s.status as StudentStatus)) out.status = s.status as StudentStatus;
    const q = asString(s.q);
    if (q) out.q = q;
    const page = asPage(s.page);
    if (page > 1) out.page = page;
    return out;
  },
  component: StudentsPage,
});

const studentDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/students/$id",
  beforeLoad: guard("student.read"),
  component: StudentDetailPage,
});

const classesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/classes",
  beforeLoad: guard("class.read"),
  component: ClassesPage,
});

export type ClassDetailSearch = { tab?: "timetable"; page?: number };

const classDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/classes/$id",
  beforeLoad: guard("class.read"),
  validateSearch: (s: Record<string, unknown>): ClassDetailSearch => {
    const out: ClassDetailSearch = {};
    if (s.tab === "timetable") out.tab = "timetable";
    const page = asPage(s.page);
    if (page > 1) out.page = page;
    return out;
  },
  component: ClassDetailPage,
});

const timetableRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/timetable",
  beforeLoad: guard("timetable.read"),
  component: TimetablePage,
});

export type SessionsSearch = { from?: string; to?: string; class_id?: string; page?: number };

const sessionsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/sessions",
  beforeLoad: guard("session.read"),
  validateSearch: (s: Record<string, unknown>): SessionsSearch => {
    const out: SessionsSearch = {};
    const from = asString(s.from);
    if (from) out.from = from;
    const to = asString(s.to);
    if (to) out.to = to;
    const classId = asString(s.class_id);
    if (classId) out.class_id = classId;
    const page = asPage(s.page);
    if (page > 1) out.page = page;
    return out;
  },
  component: SessionsPage,
});

const sessionRosterRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/sessions/$id",
  beforeLoad: guard("session.read"),
  component: SessionRosterPage,
});

const attendanceRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/attendance",
  beforeLoad: guard("attendance.record"),
  component: AttendancePage,
});

export type BillingSearch = {
  tab?: "defaulters";
  page?: number;
  period?: string;
  status?: string;
  class_id?: string;
};

const billingRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/billing",
  beforeLoad: guard("invoice.read"),
  validateSearch: (s: Record<string, unknown>): BillingSearch => {
    const out: BillingSearch = {};
    if (s.tab === "defaulters") out.tab = "defaulters";
    const period = asString(s.period);
    if (period) out.period = period;
    const status = asString(s.status);
    if (status) out.status = status;
    const classId = asString(s.class_id);
    if (classId) out.class_id = classId;
    const page = asPage(s.page);
    if (page > 1) out.page = page;
    return out;
  },
  component: BillingPage,
});

export type ReportsSearch = {
  tab?: "revenue" | "defaulters";
  page?: number;
  from?: string;
  to?: string;
};

const reportsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/reports",
  beforeLoad: guard("report.read"),
  validateSearch: (s: Record<string, unknown>): ReportsSearch => {
    const out: ReportsSearch = {};
    if (s.tab === "revenue" || s.tab === "defaulters") out.tab = s.tab;
    const from = asString(s.from);
    if (from) out.from = from;
    const to = asString(s.to);
    if (to) out.to = to;
    const page = asPage(s.page);
    if (page > 1) out.page = page;
    return out;
  },
  component: ReportsPage,
});

const notificationsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/notifications",
  beforeLoad: guard("notification.send"),
  component: NotificationsPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/settings",
  beforeLoad: guard("settings.read"),
  component: SettingsPage,
});

function placeholderRoute(path: string, name: string, perm?: string) {
  return createRoute({
    getParentRoute: () => appRoute,
    path,
    beforeLoad: perm ? guard(perm) : undefined,
    component: () => <Placeholder name={name} />,
  });
}

const moduleRoutes: ReturnType<typeof placeholderRoute>[] = [];

const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([
    dashboardRoute,
    usersRoute,
    studentsRoute,
    studentDetailRoute,
    classesRoute,
    classDetailRoute,
    timetableRoute,
    sessionsRoute,
    sessionRosterRoute,
    attendanceRoute,
    billingRoute,
    reportsRoute,
    notificationsRoute,
    settingsRoute,
    ...moduleRoutes,
  ]),
]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
