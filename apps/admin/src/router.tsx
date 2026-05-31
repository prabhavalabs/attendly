import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
  Outlet,
} from "@tanstack/react-router";

import { useAuthStore, checkPermission } from "@/lib/auth-store";
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

const studentsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/students",
  beforeLoad: guard("student.read"),
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

const classDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/classes/$id",
  beforeLoad: guard("class.read"),
  component: ClassDetailPage,
});

const timetableRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/timetable",
  beforeLoad: guard("timetable.read"),
  component: TimetablePage,
});

const sessionsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/sessions",
  beforeLoad: guard("session.read"),
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

const billingRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/billing",
  beforeLoad: guard("invoice.read"),
  component: BillingPage,
});

const reportsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/reports",
  beforeLoad: guard("report.read"),
  component: ReportsPage,
});

function placeholderRoute(path: string, name: string, perm?: string) {
  return createRoute({
    getParentRoute: () => appRoute,
    path,
    beforeLoad: perm ? guard(perm) : undefined,
    component: () => <Placeholder name={name} />,
  });
}

const moduleRoutes = [
  placeholderRoute("/notifications", "Notifications", "notification.send"),
  placeholderRoute("/settings", "Settings", "settings.read"),
];

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
