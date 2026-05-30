import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Lecturer, CreateLecturerInput, UpdateLecturerInput } from "@tuition/shared";
import { api } from "@/lib/api";

export function useLecturers() {
  return useQuery({
    queryKey: ["lecturers"],
    queryFn: () => api.get<{ lecturers: Lecturer[] }>("/api/lecturers").then((r) => r.lecturers),
  });
}

export function useCreateLecturer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLecturerInput) => api.post<Lecturer>("/api/lecturers", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lecturers"] }),
  });
}

export function useUpdateLecturer(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateLecturerInput) => api.patch<Lecturer>(`/api/lecturers/${id}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lecturers"] });
      qc.invalidateQueries({ queryKey: ["classes"] });
    },
  });
}

export function useDeleteLecturer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ ok: true }>(`/api/lecturers/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lecturers"] });
      qc.invalidateQueries({ queryKey: ["classes"] });
    },
  });
}
