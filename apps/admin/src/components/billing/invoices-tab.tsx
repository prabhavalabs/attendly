import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { MoreHorizontal, Plus, Receipt, CreditCard, Ban } from "lucide-react";
import type { Invoice } from "@tuition/shared";

import { useInvoices } from "@/hooks/use-billing";
import { useClasses } from "@/hooks/use-classes";
import { useUrlSearch, asPage, asString } from "@/lib/url-search";
import type { BillingSearch } from "@/router";
import { formatLKR } from "@/lib/money";
import { Can } from "@/components/auth/can";
import { UserAvatar } from "@/components/common/user-avatar";
import { Pager } from "@/components/common/pager";
import { InvoiceStatusBadge } from "@/components/billing/invoice-status";
import { GenerateInvoicesDialog } from "@/components/billing/generate-invoices-dialog";
import { PaymentDialog } from "@/components/billing/payment-dialog";
import { WaiveDialog } from "@/components/billing/waive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ALL = "__all__";
const PAGE_SIZE = 15;
const STATUS_ITEMS = [
  { value: ALL, label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "partial", label: "Partial" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
  { value: "waived", label: "Waived" },
];

export function InvoicesTab() {
  const navigate = useNavigate();
  const today = useMemo(() => new Date().toISOString().slice(0, 7), []);
  const { search, setSearch } = useUrlSearch<BillingSearch>();

  const period = asString(search.period) || today;
  const status = asString(search.status) || ALL;
  const classId = asString(search.class_id) || ALL;
  const page = asPage(search.page);

  const [genOpen, setGenOpen] = useState(false);
  const [paying, setPaying] = useState<Invoice | null>(null);
  const [waiving, setWaiving] = useState<Invoice | null>(null);

  const { data: classes } = useClasses();
  const { data, isLoading } = useInvoices({
    period: period || undefined,
    status: status === ALL ? undefined : status,
    class_id: classId === ALL ? undefined : classId,
    page,
    page_size: PAGE_SIZE,
  });
  const invoices = data?.invoices;

  const classItems = [{ value: ALL, label: "All classes" }, ...(classes ?? []).map((c) => ({ value: c.id, label: c.name }))];

  return (
    <div>
      <div className="bg-card mb-4 flex flex-wrap items-end gap-3 rounded-2xl border p-4" style={{ boxShadow: "var(--sh-flat)" }}>
        <div className="grid gap-1.5">
          <Label className="text-xs">Month</Label>
          <Input type="month" value={period} onChange={(e) => setSearch({ period: e.target.value || undefined, page: 1 })} className="w-40" />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Status</Label>
          <Select value={status} onValueChange={(v) => setSearch({ status: !v || v === ALL ? undefined : v, page: 1 })} items={STATUS_ITEMS}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>{STATUS_ITEMS.map((it) => <SelectItem key={it.value} value={it.value}>{it.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Class</Label>
          <Select value={classId} onValueChange={(v) => setSearch({ class_id: !v || v === ALL ? undefined : v, page: 1 })} items={classItems}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>{classItems.map((it) => <SelectItem key={it.value} value={it.value}>{it.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="ml-auto">
          <Can perm="invoice.manage">
            <Button onClick={() => setGenOpen(true)}><Plus className="size-4" /> Generate</Button>
          </Can>
        </div>
      </div>

      <div className="bg-card overflow-hidden rounded-2xl border" style={{ boxShadow: "var(--sh-flat)" }}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead>Class</TableHead>
              <TableHead>Period</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Outstanding</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><div className="flex items-center gap-3"><Skeleton className="size-8 rounded-full" /><Skeleton className="h-4 w-32" /></div></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                  <TableCell />
                </TableRow>
              ))
            ) : invoices && invoices.length > 0 ? (
              invoices.map((inv) => {
                const closed = inv.status === "paid" || inv.status === "waived";
                return (
                  <TableRow key={inv.id}>
                    <TableCell>
                      <button type="button" className="flex items-center gap-3 text-left" onClick={() => void navigate({ to: "/students/$id", params: { id: inv.student_id } })}>
                        <UserAvatar name={inv.student_name} seed={inv.student_id} size={32} />
                        <div className="min-w-0">
                          <div className="font-semibold">{inv.student_name}</div>
                          <div className="text-muted-foreground tnum text-xs">{inv.reg_no}</div>
                        </div>
                      </button>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{inv.class_name}</TableCell>
                    <TableCell className="tnum text-muted-foreground">{inv.period}</TableCell>
                    <TableCell className="tnum">{formatLKR(inv.amount_minor)}</TableCell>
                    <TableCell className="tnum font-semibold">{closed || inv.outstanding_minor <= 0 ? "—" : formatLKR(inv.outstanding_minor)}</TableCell>
                    <TableCell><InvoiceStatusBadge status={inv.status} /></TableCell>
                    <TableCell>
                      {!closed ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Actions"><MoreHorizontal className="size-4" /></Button>} />
                          <DropdownMenuContent align="end">
                            <Can perm="payment.record">
                              <DropdownMenuItem onClick={() => setPaying(inv)}><CreditCard className="size-4" /> Record payment</DropdownMenuItem>
                            </Can>
                            <Can perm="invoice.manage">
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setWaiving(inv)}><Ban className="size-4" /> Waive</DropdownMenuItem>
                            </Can>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={7}>
                  <div className="flex flex-col items-center gap-3 py-12 text-center">
                    <div className="bg-accent text-primary grid size-12 place-items-center rounded-2xl"><Receipt className="size-6" /></div>
                    <div>
                      <div className="font-display font-semibold">No invoices for {period || "this filter"}</div>
                      <div className="text-muted-foreground text-sm">Generate invoices for the month to get started.</div>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {!isLoading ? (
        <Pager
          page={page}
          pageSize={PAGE_SIZE}
          total={data?.total ?? 0}
          noun="invoice"
          onPageChange={(p) => setSearch({ page: p })}
        />
      ) : null}

      <GenerateInvoicesDialog open={genOpen} onOpenChange={setGenOpen} defaultPeriod={period || today} />
      <PaymentDialog invoice={paying} open={!!paying} onOpenChange={(o) => !o && setPaying(null)} />
      <WaiveDialog invoice={waiving} open={!!waiving} onOpenChange={(o) => !o && setWaiving(null)} />
    </div>
  );
}
