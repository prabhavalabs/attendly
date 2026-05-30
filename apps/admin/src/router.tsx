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

function placeholderRoute(path: string, name: string, perm?: string) {
  return createRoute({
    getParentRoute: () => appRoute,
    path,
    beforeLoad: perm ? guard(perm) : undefined,
    component: () => <Placeholder name={name} />,
  });
}

const moduleRoutes = [
  placeholderRoute("/classes", "Classes", "class.read"),
  placeholderRoute("/timetable", "Timetable", "timetable.read"),
  placeholderRoute("/sessions", "Sessions", "session.read"),
  placeholderRoute("/attendance", "Attendance", "attendance.record"),
  placeholderRoute("/billing", "Billing", "invoice.read"),
  placeholderRoute("/reports", "Reports", "report.read"),
  placeholderRoute("/notifications", "Notifications", "notification.send"),
  placeholderRoute("/settings", "Settings", "settings.read"),
];

const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([dashboardRoute, usersRoute, studentsRoute, studentDetailRoute, ...moduleRoutes]),
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
