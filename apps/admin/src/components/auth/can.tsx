/** Cosmetic UI permission gate. The server is always authoritative (SRS §7.1). */
import type { ReactNode } from "react";
import { usePermission } from "@/lib/auth-store";

export function Can({
  perm,
  children,
  fallback = null,
}: {
  perm: string;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const allowed = usePermission(perm);
  return <>{allowed ? children : fallback}</>;
}
