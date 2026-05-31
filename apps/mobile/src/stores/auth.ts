/**
 * Auth store (zustand). Holds the current user + tokens in memory and mirrors
 * tokens to secure storage. Wires the API client's token getter / refresh /
 * auth-lost hooks via configureApi.
 */
import { create } from "zustand";
import type { Me, LoginResponse, AuthTokens } from "@tuition/shared";
import { api, configureApi, hydrateBookmark, ApiError } from "@/lib/api";
import { getItem, setItem, removeItem } from "@/lib/secure";
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, USER_KEY } from "@/lib/config";

type Status = "loading" | "authed" | "anon";

interface AuthState {
  status: Status;
  user: Me | null;
  accessToken: string | null;
  refreshToken: string | null;
  hydrate: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

async function persist(tokens: AuthTokens, user: Me): Promise<void> {
  await Promise.all([
    setItem(ACCESS_TOKEN_KEY, tokens.access_token),
    setItem(REFRESH_TOKEN_KEY, tokens.refresh_token),
    setItem(USER_KEY, JSON.stringify(user)),
  ]);
}

export const useAuth = create<AuthState>((set, get) => ({
  status: "loading",
  user: null,
  accessToken: null,
  refreshToken: null,

  hydrate: async () => {
    await hydrateBookmark();
    const [access, refresh, userJson] = await Promise.all([
      getItem(ACCESS_TOKEN_KEY),
      getItem(REFRESH_TOKEN_KEY),
      getItem(USER_KEY),
    ]);
    if (!access || !refresh) {
      set({ status: "anon" });
      return;
    }
    const cachedUser = userJson ? (JSON.parse(userJson) as Me) : null;
    set({ accessToken: access, refreshToken: refresh, user: cachedUser, status: cachedUser ? "authed" : "loading" });
    // Validate / refresh the session in the background.
    try {
      const me = await api.get<Me>("/api/auth/me");
      set({ user: me, status: "authed" });
      await setItem(USER_KEY, JSON.stringify(me));
    } catch (err) {
      // 401 already triggered a refresh attempt inside the client; if we still
      // failed, drop to anon. Network errors keep the cached (offline) session.
      if (err instanceof ApiError && err.status === 401) {
        set({ status: "anon", user: null, accessToken: null, refreshToken: null });
      } else if (!get().user) {
        set({ status: "anon" });
      } else {
        set({ status: "authed" });
      }
    }
  },

  login: async (email, password) => {
    const res = await api.post<LoginResponse>("/api/auth/login", { email, password }, { auth: false });
    await persist(res.tokens, res.user);
    set({ status: "authed", user: res.user, accessToken: res.tokens.access_token, refreshToken: res.tokens.refresh_token });
  },

  logout: async () => {
    const refresh = get().refreshToken;
    if (refresh) {
      try {
        await api.post("/api/auth/logout", { refresh_token: refresh });
      } catch {
        // best-effort
      }
    }
    await Promise.all([removeItem(ACCESS_TOKEN_KEY), removeItem(REFRESH_TOKEN_KEY), removeItem(USER_KEY)]);
    set({ status: "anon", user: null, accessToken: null, refreshToken: null });
  },
}));

/** Internal: rotate the refresh token. Returns true on success. */
async function doRefresh(): Promise<boolean> {
  const refresh = useAuth.getState().refreshToken;
  if (!refresh) return false;
  try {
    const res = await api.post<LoginResponse>("/api/auth/refresh", { refresh_token: refresh }, { auth: false });
    await persist(res.tokens, res.user);
    useAuth.setState({
      user: res.user,
      accessToken: res.tokens.access_token,
      refreshToken: res.tokens.refresh_token,
      status: "authed",
    });
    return true;
  } catch {
    return false;
  }
}

// Wire the API client to the store (token getter, refresh, auth-lost).
configureApi({
  getAccessToken: () => useAuth.getState().accessToken,
  refresh: doRefresh,
  onAuthLost: () => {
    void Promise.all([removeItem(ACCESS_TOKEN_KEY), removeItem(REFRESH_TOKEN_KEY), removeItem(USER_KEY)]);
    useAuth.setState({ status: "anon", user: null, accessToken: null, refreshToken: null });
  },
});

/** Permission check against the flattened permission set (cosmetic; server-authoritative). */
export function useHasPermission(perm: string): boolean {
  return useAuth((s) => {
    const perms = s.user?.permissions ?? [];
    return perms.includes("*") || perms.includes(perm);
  });
}
