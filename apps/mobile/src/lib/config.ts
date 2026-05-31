/** Runtime configuration. The API base URL is injected via an EXPO_PUBLIC env. */
export const API_BASE_URL: string =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:8787";

/** Local DB / storage keys. */
export const DB_NAME = "attendly.db";
export const ACCESS_TOKEN_KEY = "attendly.access_token";
export const REFRESH_TOKEN_KEY = "attendly.refresh_token";
export const USER_KEY = "attendly.user";
export const BOOKMARK_KEY = "attendly.bookmark";
