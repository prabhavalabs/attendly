import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import type {
  StudentListResponse,
  StudentDetail,
  StudentStatus,
  CreateStudentInput,
  UpdateStudentInput,
  CreateGuardianInput,
  UpdateGuardianInput,
  StudentEnrollment,
} from "@tuition/shared";
import { api } from "@/lib/api";

export function useStudentEnrollments(id: string | undefined) {
  return useQuery({
    queryKey: ["student-enrollments", id],
    queryFn: () => api.get<{ enrollments: StudentEnrollment[] }>(`/api/students/${id}/enrollments`).then((r) => r.enrollments),
    enabled: !!id,
  });
}

export interface StudentListParams {
  q?: string;
  status?: StudentStatus;
  page: number;
  page_size: number;
}

export function useStudents(params: StudentListParams) {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.status) qs.set("status", params.status);
  qs.set("page", String(params.page));
  qs.set("page_size", String(params.page_size));
  return useQuery({
    queryKey: ["students", params],
    queryFn: () => api.get<StudentListResponse>(`/api/students?${qs.toString()}`),
    placeholderData: keepPreviousData,
  });
}

export function useStudent(id: string | undefined) {
  return useQuery({
    queryKey: ["student", id],
    queryFn: () => api.get<StudentDetail>(`/api/students/${id}`),
    enabled: !!id,
  });
}

export function useCreateStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateStudentInput) => api.post<StudentDetail>("/api/students", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["students"] }),
  });
}

export function useUpdateStudent(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateStudentInput) => api.patch<StudentDetail>(`/api/students/${id}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["students"] });
      qc.invalidateQueries({ queryKey: ["student", id] });
    },
  });
}

export function useDeleteStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ ok: true }>(`/api/students/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["students"] }),
  });
}

/* ---------------------------------- Cards -------------------------------- */

export function useIssueCard(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<StudentDetail>(`/api/students/${id}/card/issue`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["student", id] });
      qc.invalidateQueries({ queryKey: ["students"] });
    },
  });
}

export function useRevokeCard(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: "revoked" | "lost" = "revoked") =>
      api.post<StudentDetail>(`/api/students/${id}/card/revoke`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["student", id] });
      qc.invalidateQueries({ queryKey: ["students"] });
    },
  });
}

export function useUploadPhoto(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => api.upload<StudentDetail>(`/api/students/${id}/photo`, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["student", id] });
      qc.invalidateQueries({ queryKey: ["students"] });
      qc.invalidateQueries({ queryKey: ["photo", `/api/students/${id}/photo`] });
    },
  });
}

export function useRemovePhoto(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<StudentDetail>(`/api/students/${id}/photo`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["student", id] });
      qc.invalidateQueries({ queryKey: ["students"] });
    },
  });
}

/** Fetch the card PDF (authenticated) and open it in a new tab. */
export async function openCardPdf(id: string): Promise<void> {
  const blob = await api.blob(`/api/students/${id}/card.pdf`);
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/* -------------------------------- Guardians ------------------------------ */

export function useAddGuardian(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateGuardianInput) =>
      api.post<{ guardians: StudentDetail["guardians"] }>(`/api/students/${studentId}/guardians`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["student", studentId] }),
  });
}

export function useUpdateGuardian(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ gid, input }: { gid: string; input: UpdateGuardianInput }) =>
      api.patch<{ guardians: StudentDetail["guardians"] }>(
        `/api/students/${studentId}/guardians/${gid}`,
        input,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["student", studentId] }),
  });
}

export function useRemoveGuardian(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (gid: string) =>
      api.delete<{ guardians: StudentDetail["guardians"] }>(`/api/students/${studentId}/guardians/${gid}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["student", studentId] }),
  });
}
