/**
 * Auth store (Zustand). Holds tokens + the current user, and drives login,
 * logout, token refresh and first-load bootstrap. Tokens are persisted to
 * localStorage so a reload keeps the session.
 *
 * RBAC gating in the UI is cosmetic only — the server is authoritative (SRS §7.1).
 */
import { create } from "zustand";
import { hasPermission as evalPermission, type Me, type LoginResponse, type AuthTokens } from "@tuition/shared";
import { api, configureApi, ApiError } from "./api";

const STORAGE_KEY = "attendly.auth";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface PersistedTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

interface AuthState {
  status: AuthStatus;
  user: Me | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: string | null;
  permissions: Set<string>;

  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  tryRefresh: () => Promise<boolean>;
}

function loadTokens(): PersistedTokens | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PersistedTokens) : null;
  } catch {
    return null;
  }
}

function saveTokens(t: AuthTokens): void {
  const persisted: PersistedTokens = {
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    expiresAt: t.expires_at,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
}

function clearTokens(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: "loading",
  user: null,
  accessToken: null,
  refreshToken: null,
  expiresAt: null,
  permissions: new Set<string>(),

  async bootstrap() {
    const tokens = loadTokens();
    if (!tokens) {
      set({ status: "unauthenticated" });
      return;
    }
    set({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
    });
    try {
      const user = await api.get<Me>("/api/auth/me");
      set({ status: "authenticated", user, permissions: new Set(user.permissions) });
    } catch {
      // /api already attempted a refresh; if we're here the session is dead.
      clearTokens();
      set({
        status: "unauthenticated",
        user: null,
        accessToken: null,
        refreshToken: null,
        expiresAt: null,
        permissions: new Set<string>(),
      });
    }
  },

  async login(email, password) {
    const res = await api.post<LoginResponse>(
      "/api/auth/login",
      { email, password },
      { auth: false },
    );
    saveTokens(res.tokens);
    set({
      status: "authenticated",
      user: res.user,
      accessToken: res.tokens.access_token,
      refreshToken: res.tokens.refresh_token,
      expiresAt: res.tokens.expires_at,
      permissions: new Set(res.user.permissions),
    });
  },

  async logout() {
    const refreshToken = get().refreshToken;
    if (refreshToken) {
      try {
        await api.post("/api/auth/logout", { refresh_token: refreshToken });
      } catch {
        // best-effort; clear locally regardless
      }
    }
    clearTokens();
    set({
      status: "unauthenticated",
      user: null,
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      permissions: new Set<string>(),
    });
  },

  async tryRefresh() {
    const refreshToken = get().refreshToken;
    if (!refreshToken) return false;
    try {
      const res = await api.post<LoginResponse>(
        "/api/auth/refresh",
        { refresh_token: refreshToken },
        { auth: false, _retry: false },
      );
      saveTokens(res.tokens);
      set({
        status: "authenticated",
        user: res.user,
        accessToken: res.tokens.access_token,
        refreshToken: res.tokens.refresh_token,
        expiresAt: res.tokens.expires_at,
        permissions: new Set(res.user.permissions),
      });
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status >= 500) return false; // transient
      return false;
    }
  },
}));

// Wire the API client to the store (token getter + refresh + auth-lost).
configureApi({
  getAccessToken: () => useAuthStore.getState().accessToken,
  refresh: () => useAuthStore.getState().tryRefresh(),
  onAuthLost: () => {
    clearTokens();
    useAuthStore.setState({
      status: "unauthenticated",
      user: null,
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      permissions: new Set<string>(),
    });
  },
});

/** Reactive permission check for UI gating. */
export function usePermission(permission: string): boolean {
  return useAuthStore((s) => evalPermission(s.permissions, permission));
}

/** Non-reactive permission check (for router guards / event handlers). */
export function checkPermission(permission: string): boolean {
  return evalPermission(useAuthStore.getState().permissions, permission);
}
