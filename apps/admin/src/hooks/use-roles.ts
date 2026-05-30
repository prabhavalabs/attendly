import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Role,
  CreateRoleInput,
  UpdateRoleInput,
  PermissionGroup,
} from "@tuition/shared";
import { api } from "@/lib/api";

export function useRoles() {
  return useQuery({
    queryKey: ["roles"],
    queryFn: () => api.get<{ roles: Role[] }>("/api/roles").then((r) => r.roles),
  });
}

export function usePermissionCatalog() {
  return useQuery({
    queryKey: ["permissions"],
    queryFn: () =>
      api.get<{ groups: PermissionGroup[] }>("/api/permissions").then((r) => r.groups),
    staleTime: Infinity,
  });
}

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRoleInput) => api.post<Role>("/api/roles", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["roles"] }),
  });
}

export function useUpdateRole(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateRoleInput) => api.patch<Role>(`/api/roles/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["roles"] }),
  });
}

export function useDeleteRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ ok: true }>(`/api/roles/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["roles"] }),
  });
}
