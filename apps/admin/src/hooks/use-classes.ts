import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Class,
  CreateClassInput,
  UpdateClassInput,
  Enrollment,
  CreateEnrollmentInput,
  TimetableSlot,
  CreateTimetableSlotInput,
} from "@tuition/shared";
import { api } from "@/lib/api";

type ClassDetail = Class & { timetable: TimetableSlot[] };

export function useClasses() {
  return useQuery({
    queryKey: ["classes"],
    queryFn: () => api.get<{ classes: Class[] }>("/api/classes").then((r) => r.classes),
  });
}

export function useClass(id: string | undefined) {
  return useQuery({
    queryKey: ["class", id],
    queryFn: () => api.get<ClassDetail>(`/api/classes/${id}`),
    enabled: !!id,
  });
}

export function useCreateClass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateClassInput) => api.post<Class>("/api/classes", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["classes"] }),
  });
}

export function useUpdateClass(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateClassInput) => api.patch<Class>(`/api/classes/${id}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["classes"] });
      qc.invalidateQueries({ queryKey: ["class", id] });
    },
  });
}

export function useDeleteClass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ ok: true }>(`/api/classes/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["classes"] }),
  });
}

/* ------------------------------ Enrollments ------------------------------ */

export function useEnrollments(classId: string | undefined) {
  return useQuery({
    queryKey: ["enrollments", classId],
    queryFn: () => api.get<{ enrollments: Enrollment[] }>(`/api/classes/${classId}/enrollments`).then((r) => r.enrollments),
    enabled: !!classId,
  });
}

export function useEnroll(classId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEnrollmentInput) =>
      api.post<{ enrollments: Enrollment[] }>(`/api/classes/${classId}/enrollments`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["enrollments", classId] });
      qc.invalidateQueries({ queryKey: ["class", classId] });
      qc.invalidateQueries({ queryKey: ["classes"] });
    },
  });
}

export function useUnenroll(classId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (enrollmentId: string) =>
      api.delete<{ enrollments: Enrollment[] }>(`/api/classes/${classId}/enrollments/${enrollmentId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["enrollments", classId] });
      qc.invalidateQueries({ queryKey: ["class", classId] });
      qc.invalidateQueries({ queryKey: ["classes"] });
    },
  });
}

/* ------------------------------- Timetable ------------------------------- */

export function useAddSlot(classId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTimetableSlotInput) =>
      api.post<{ timetable: TimetableSlot[] }>(`/api/classes/${classId}/timetable`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["class", classId] }),
  });
}

export function useRemoveSlot(classId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slotId: string) =>
      api.delete<{ timetable: TimetableSlot[] }>(`/api/classes/${classId}/timetable/${slotId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["class", classId] }),
  });
}
