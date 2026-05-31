/**
 * @tuition/shared
 *
 * Shared contracts imported by the API Worker and both clients (admin + mobile):
 *   - Zod schemas for request/response validation
 *   - The permission catalog (resource.action)
 *   - Default role -> permission mappings (seeded on first boot)
 *   - RBAC evaluation helpers
 *
 * See SRS §7.1 (RBAC) and Appendix 15.1 (permission catalog).
 */

export * from "./permissions";
export * from "./roles";
export * from "./rbac";
export * from "./auth";
export * from "./students";
export * from "./classes";
export * from "./checkin";
export * from "./billing";
export * from "./reports";
export * from "./settings";
export * from "./notifications";
