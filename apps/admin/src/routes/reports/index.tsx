import { useMemo, useState } from "react";
import { Download } from "lucide-react";

import { useAttendanceReport, useRevenueReport, downloadReportCsv } from "@/hooks/use-reports";
import { formatLKR } from "@/lib/money";
import { PageHeader } from "@/components/common/page-header";
import { Can } from "@/components/auth/can";
import { ClassChip } from "@/components/classes/band";
import { DefaultersTab } from "@/components/billing/defaulters-tab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const iso = (d: Date) => d.toISOString().slice(0, 10);

function pct(rate: number | null): string {
  return rate == null ? "—" : `${Math.round(rate * 100)}%`;
}

function AttendanceReport() {
  const today = useMemo(() => new Date(), []);
  const [from, setFrom] = useState(iso(new Date(today.getTime() - 30 * 86_400_000)));
  const [to, setTo] = useState(iso(today));
  const { data: rows, isLoading } = useAttendanceReport({ from, to });

  return (
    <div>
      <div className="bg-card mb-4 flex flex-wrap items-end gap-3 rounded-2xl border p-4" style={{ boxShadow: "var(--sh-flat)" }}>
        <div className="grid gap-1.5"><Label className="text-xs">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" /></div>
        <div className="grid gap-1.5"><Label className="text-xs">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" /></div>
        <div className="ml-auto">
          <Can perm="report.export">
            <Button variant="outline" onClick={() => void downloadReportCsv(`/api/reports/attendance?from=${from}&to=${to}&format=csv`, "attendance.csv")}>
              <Download className="size-4" /> Export CSV
            </Button>
          </Can>
        </div>
      </div>
      <div className="bg-card overflow-hidden rounded-2xl border" style={{ boxShadow: "var(--sh-flat)" }}>
        <Table>
          <TableHeader>
            <TableRow><TableHead>Class</TableHead><TableHead>Sessions</TableHead><TableHead>Present</TableHead><TableHead>Expected</TableHead><TableHead>Rate</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}><TableCell><Skeleton className="h-4 w-40" /></TableCell><TableCell><Skeleton className="h-4 w-10" /></TableCell><TableCell><Skeleton className="h-4 w-10" /></TableCell><TableCell><Skeleton className="h-4 w-10" /></TableCell><TableCell><Skeleton className="h-4 w-12" /></TableCell></TableRow>
              ))
            ) : (rows ?? []).length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-muted-foreground py-10 text-center text-sm">No classes.</TableCell></TableRow>
            ) : (
              rows!.map((r) => (
                <TableRow key={r.class_id}>
                  <TableCell><span className="flex items-center gap-2"><ClassChip band={r.band} code={r.code} /><span className="text-sm font-medium">{r.class_name}</span></span></TableCell>
                  <TableCell className="tnum">{r.sessions}</TableCell>
                  <TableCell className="tnum">{r.present}</TableCell>
                  <TableCell className="tnum text-muted-foreground">{r.expected}</TableCell>
                  <TableCell className="tnum font-semibold">{pct(r.rate)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function RevenueReport() {
  const { data: rows, isLoading } = useRevenueReport();
  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Can perm="report.export">
          <Button variant="outline" onClick={() => void downloadReportCsv("/api/reports/revenue?format=csv", "revenue.csv")}>
            <Download className="size-4" /> Export CSV
          </Button>
        </Can>
      </div>
      <div className="bg-card overflow-hidden rounded-2xl border" style={{ boxShadow: "var(--sh-flat)" }}>
        <Table>
          <TableHeader>
            <TableRow><TableHead>Period</TableHead><TableHead>Billed</TableHead><TableHead>Collected</TableHead><TableHead>Collection</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}><TableCell><Skeleton className="h-4 w-20" /></TableCell><TableCell><Skeleton className="h-4 w-24" /></TableCell><TableCell><Skeleton className="h-4 w-24" /></TableCell><TableCell><Skeleton className="h-4 w-12" /></TableCell></TableRow>
              ))
            ) : (rows ?? []).length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-muted-foreground py-10 text-center text-sm">No invoices yet.</TableCell></TableRow>
            ) : (
              rows!.map((r) => (
                <TableRow key={r.period}>
                  <TableCell className="tnum font-semibold">{r.period}</TableCell>
                  <TableCell className="tnum">{formatLKR(r.billed_minor)}</TableCell>
                  <TableCell className="tnum">{formatLKR(r.collected_minor)}</TableCell>
                  <TableCell className="tnum font-semibold">{r.billed_minor > 0 ? `${Math.round((r.collected_minor / r.billed_minor) * 100)}%` : "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  return (
    <div className="p-6 md:p-8">
      <PageHeader title="Reports" description="Attendance, revenue and defaulters — view and export." />
      <Tabs defaultValue="attendance">
        <TabsList>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="defaulters">Defaulters</TabsTrigger>
        </TabsList>
        <TabsContent value="attendance" className="mt-5"><AttendanceReport /></TabsContent>
        <TabsContent value="revenue" className="mt-5"><RevenueReport /></TabsContent>
        <TabsContent value="defaulters" className="mt-5">
          <div className="mb-4 flex justify-end">
            <Can perm="report.export">
              <Button variant="outline" onClick={() => void downloadReportCsv("/api/reports/defaulters?format=csv", "defaulters.csv")}>
                <Download className="size-4" /> Export CSV
              </Button>
            </Can>
          </div>
          <DefaultersTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
