/** Shared Worker types: bindings, Hono context variables, auth principal. */

export interface Env {
  DB: D1Database;
  ASSETS: R2Bucket;
  // Secrets (wrangler secret put / .dev.vars)
  JWT_SECRET: string;
  ENCRYPTION_KEY: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  // Optional config (plain vars)
  SETUP_TOKEN?: string;
  /** Comma-separated allowed CORS origins; defaults to localhost dev ports. */
  CORS_ORIGINS?: string;
}

/** A D1 Sessions-API session (reads→replica, writes→primary). */
export type Db = ReturnType<D1Database["withSession"]>;

/** The authenticated principal, resolved once per request from the JWT + DB. */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  status: "active" | "suspended";
  roles: { id: string; key: string; label: string }[];
  /** Flattened, de-duplicated permission keys (may include `*`). */
  permissions: Set<string>;
}

/** Hono context variables set by middleware. */
export interface Variables {
  db: Db;
  user: AuthUser;
}

export interface AppContext {
  Bindings: Env;
  Variables: Variables;
}
