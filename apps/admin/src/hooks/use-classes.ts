import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import type {
  Class,
  CreateClassInput,
  UpdateClassInput,
  Enrollment,
  CreateEnrollmentInput,
  UpdateEnrollmentInput,
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

export interface EnrollmentListResult {
  enrollments: Enrollment[];
  total: number;
  page: number;
  page_size: number;
}

export function useEnrollments(classId: string | undefined, page = 1, pageSize = 20) {
  const qs = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  return useQuery({
    queryKey: ["enrollments", classId, page, pageSize],
    queryFn: () => api.get<EnrollmentListResult>(`/api/classes/${classId}/enrollments?${qs.toString()}`),
    enabled: !!classId,
    placeholderData: keepPreviousData,
  });
}

/**
 * The set of student ids already enrolled in a class — used by the enroll
 * dialog to mark search results as "Enrolled". Server caps page_size at 100
 * (classes are capacity-bound, so this covers the roster); the enroll endpoint
 * still rejects true duplicates with 409, so an over-large roster is safe.
 */
export function useEnrolledStudentIds(classId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["enrollment-ids", classId],
    queryFn: () =>
      api
        .get<{ enrollments: Enrollment[] }>(`/api/classes/${classId}/enrollments?page_size=100`)
        .then((r) => new Set(r.enrollments.map((e) => e.student.id))),
    enabled: !!classId && enabled,
  });
}

export function useEnroll(classId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEnrollmentInput) =>
      api.post<{ enrollments: Enrollment[] }>(`/api/classes/${classId}/enrollments`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["enrollments", classId] });
      qc.invalidateQueries({ queryKey: ["enrollment-ids", classId] });
      qc.invalidateQueries({ queryKey: ["class", classId] });
      qc.invalidateQueries({ queryKey: ["classes"] });
    },
  });
}

export function useUpdateEnrollment(classId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ eid, input }: { eid: string; input: UpdateEnrollmentInput }) =>
      api.patch<{ enrollments: Enrollment[] }>(`/api/classes/${classId}/enrollments/${eid}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["enrollments", classId] });
      qc.invalidateQueries({ queryKey: ["class", classId] });
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
      qc.invalidateQueries({ queryKey: ["enrollment-ids", classId] });
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
