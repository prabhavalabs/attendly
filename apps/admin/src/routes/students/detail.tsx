import { useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import {
  ChevronLeft,
  Pencil,
  Printer,
  CreditCard,
  MoreHorizontal,
  Plus,
  Phone,
  Mail,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import type { Guardian } from "@tuition/shared";

import {
  useStudent,
  useIssueCard,
  useRevokeCard,
  useRemoveGuardian,
  openCardPdf,
} from "@/hooks/use-students";
import { formatDate } from "@/lib/format";
import { Can } from "@/components/auth/can";
import { UserAvatar } from "@/components/common/user-avatar";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { StudentStatusBadge, CardStatusBadge } from "@/components/students/student-status";
import { StudentDialog } from "@/components/students/student-dialog";
import { GuardianDialog } from "@/components/students/guardian-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const REL_LABELS: Record<Guardian["relationship"], string> = {
  mother: "Mother",
  father: "Father",
  guardian: "Guardian",
  sibling: "Sibling",
  other: "Other",
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card rounded-[var(--radius-md)] border p-4" style={{ boxShadow: "var(--sh-flat)" }}>
      <div className="text-muted-foreground mb-1.5 text-xs font-semibold">{label}</div>
      <div className="font-display text-lg font-bold tracking-tight">{value}</div>
    </div>
  );
}

function ProfileRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between gap-4 border-b py-3 last:border-b-0">
      <span className="text-muted-foreground text-sm font-semibold">{label}</span>
      <span className="text-sm font-medium">{value && value.trim() !== "" ? value : "—"}</span>
    </div>
  );
}

export default function StudentDetailPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const { data: student, isLoading, isError } = useStudent(id);

  const issueCard = useIssueCard(id);
  const revokeCard = useRevokeCard(id);
  const removeGuardian = useRemoveGuardian(id);

  const [editOpen, setEditOpen] = useState(false);
  const [guardianAdd, setGuardianAdd] = useState(false);
  const [guardianEdit, setGuardianEdit] = useState<Guardian | null>(null);
  const [guardianRemove, setGuardianRemove] = useState<Guardian | null>(null);
  const [cardAction, setCardAction] = useState<null | "reissue" | "revoke">(null);

  if (isLoading) {
    return (
      <div className="p-6 md:p-8">
        <Skeleton className="mb-4 h-4 w-24" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }
  if (isError || !student) {
    return (
      <div className="p-6 md:p-8">
        <Link to="/students" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
          <ChevronLeft className="size-4" /> Students
        </Link>
        <div className="text-muted-foreground mt-10 text-center text-sm">Student not found.</div>
      </div>
    );
  }

  async function confirmCardAction() {
    if (cardAction === "reissue") {
      await issueCard.mutateAsync();
      toast.success("New card issued — the previous card no longer works.");
    } else if (cardAction === "revoke") {
      await revokeCard.mutateAsync("revoked");
      toast.success("Card revoked.");
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-6 md:p-8">
      <Link to="/students" className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm">
        <ChevronLeft className="size-4" /> Students
      </Link>

      {/* Hero — the card motif */}
      <div
        className="bg-card relative mb-5 overflow-hidden rounded-2xl border p-6"
        style={{ boxShadow: "var(--sh-card)" }}
      >
        <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: "var(--brand-600)" }} aria-hidden />
        <div className="flex flex-wrap items-start justify-between gap-4 pl-2">
          <div className="flex items-center gap-4">
            <UserAvatar name={student.full_name} seed={student.id} photoUrl={student.photo_url} size={68} />
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight">{student.full_name}</h2>
              <div className="text-muted-foreground tnum mt-0.5 text-sm">
                {student.reg_no} · Joined {formatDate(student.created_at)}
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <StudentStatusBadge status={student.status} />
                <CardStatusBadge status={student.card_status} />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Can perm="student.update">
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil className="size-4" /> Edit
              </Button>
            </Can>
            <Can perm="card.issue">
              <Button variant="outline" size="sm" onClick={() => void openCardPdf(student.id)}>
                <Printer className="size-4" /> Print card
              </Button>
            </Can>
            <Can perm="card.issue">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button variant="outline" size="icon-sm" aria-label="Card actions">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  }
                />
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setCardAction("reissue")}>
                    <CreditCard className="size-4" /> Reissue card
                  </DropdownMenuItem>
                  <Can perm="card.revoke">
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setCardAction("revoke")}
                    >
                      Revoke card
                    </DropdownMenuItem>
                  </Can>
                </DropdownMenuContent>
              </DropdownMenu>
            </Can>
          </div>
        </div>
      </div>

      {/* Mini-stats */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Reg no" value={student.reg_no} />
        <Stat label="Card issued" value={formatDate(student.card_issued_at)} />
        <Stat label="Guardians" value={String(student.guardians.length)} />
        <Stat label="Phone" value={student.phone ?? "—"} />
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="guardians">Guardians ({student.guardians.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-5">
          <div className="bg-card rounded-2xl border px-5 py-1" style={{ boxShadow: "var(--sh-flat)" }}>
            <ProfileRow label="Full name" value={student.full_name} />
            <ProfileRow label="Phone" value={student.phone} />
            <ProfileRow label="Email" value={student.email} />
            <ProfileRow label="Date of birth" value={student.date_of_birth} />
            <ProfileRow label="Address" value={student.address} />
            <ProfileRow label="Notes" value={student.notes} />
          </div>
        </TabsContent>

        <TabsContent value="guardians" className="mt-5">
          <div className="mb-3 flex justify-end">
            <Can perm="student.update">
              <Button size="sm" onClick={() => setGuardianAdd(true)}>
                <Plus className="size-4" /> Add guardian
              </Button>
            </Can>
          </div>
          {student.guardians.length === 0 ? (
            <div className="bg-card flex flex-col items-center gap-3 rounded-2xl border py-12 text-center" style={{ boxShadow: "var(--sh-flat)" }}>
              <div className="bg-accent text-primary grid size-12 place-items-center rounded-2xl">
                <UserPlus className="size-6" />
              </div>
              <div className="text-muted-foreground text-sm">No guardians added yet.</div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {student.guardians.map((g) => (
                <div key={g.id} className="bg-card rounded-2xl border p-4" style={{ boxShadow: "var(--sh-flat)" }}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-display font-semibold">{g.name}</div>
                      <div className="text-muted-foreground text-xs">
                        {REL_LABELS[g.relationship]}
                        {g.is_primary ? " · Primary" : ""}
                      </div>
                    </div>
                    <Can perm="student.update">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button variant="ghost" size="icon-sm" aria-label="Guardian actions">
                              <MoreHorizontal className="size-4" />
                            </Button>
                          }
                        />
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setGuardianEdit(g)}>Edit</DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setGuardianRemove(g)}
                          >
                            Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </Can>
                  </div>
                  <div className="mt-3 grid gap-1.5 text-sm">
                    <span className="flex items-center gap-2">
                      <Phone className="text-muted-foreground size-3.5" />
                      <span className="tnum">{g.phone}</span>
                    </span>
                    {g.email ? (
                      <span className="flex items-center gap-2">
                        <Mail className="text-muted-foreground size-3.5" />
                        <span className="truncate">{g.email}</span>
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <StudentDialog open={editOpen} onOpenChange={setEditOpen} student={student} />
      <GuardianDialog studentId={id} open={guardianAdd} onOpenChange={setGuardianAdd} />
      <GuardianDialog
        studentId={id}
        open={!!guardianEdit}
        onOpenChange={(o) => !o && setGuardianEdit(null)}
        guardian={guardianEdit}
      />
      <ConfirmDialog
        open={!!guardianRemove}
        onOpenChange={(o) => !o && setGuardianRemove(null)}
        title={`Remove ${guardianRemove?.name ?? "guardian"}?`}
        description="This unlinks the guardian from this student."
        confirmLabel="Remove"
        destructive
        onConfirm={async () => {
          if (!guardianRemove) return;
          await removeGuardian.mutateAsync(guardianRemove.id);
          toast.success("Guardian removed");
        }}
      />
      <ConfirmDialog
        open={!!cardAction}
        onOpenChange={(o) => !o && setCardAction(null)}
        title={cardAction === "revoke" ? "Revoke this card?" : "Reissue the card?"}
        description={
          cardAction === "revoke"
            ? "The current card token stops working immediately. Issue a new card to restore access."
            : "A fresh card token is generated. The previously printed card will stop working — print the new one."
        }
        confirmLabel={cardAction === "revoke" ? "Revoke card" : "Reissue card"}
        destructive={cardAction === "revoke"}
        onConfirm={confirmCardAction}
      />
    </div>
  );
}
