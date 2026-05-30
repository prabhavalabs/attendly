/** Auth-related tunables. */

/** Access-token lifetime — short-lived (SRS §9). */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes

/** Refresh-session lifetime. */
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
