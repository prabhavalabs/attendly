import { useNavigate } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";

import { useDefaulters } from "@/hooks/use-billing";
import { useUrlSearch, asPage } from "@/lib/url-search";
import { formatLKR } from "@/lib/money";
import { UserAvatar } from "@/components/common/user-avatar";
import { Pager } from "@/components/common/pager";
import { Skeleton } from "@/components/ui/skeleton";

const PAGE_SIZE = 15;

export function DefaultersTab() {
  const navigate = useNavigate();
  const { search, setSearch } = useUrlSearch<{ page?: number }>();
  const page = asPage(search.page);
  const { data, isLoading } = useDefaulters({ page, page_size: PAGE_SIZE });

  if (isLoading) {
    return <div className="grid gap-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>;
  }

  const defaulters = data?.defaulters;

  if (!defaulters || defaulters.length === 0) {
    return (
      <div className="bg-card flex flex-col items-center gap-3 rounded-2xl border py-16 text-center" style={{ boxShadow: "var(--sh-flat)" }}>
        <div className="bg-ok-bg text-ok-ink grid size-12 place-items-center rounded-2xl"><CheckCircle2 className="size-6" /></div>
        <div>
          <div className="font-display font-semibold">No outstanding fees</div>
          <div className="text-muted-foreground text-sm">Everyone is paid up.</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="bg-card overflow-hidden rounded-2xl border" style={{ boxShadow: "var(--sh-flat)" }}>
        <ul className="divide-y">
          {defaulters.map((d) => (
            <li key={d.student.id}>
              <button
                type="button"
                className="hover:bg-muted/50 flex w-full items-center gap-3 px-5 py-3.5 text-left"
                onClick={() => void navigate({ to: "/students/$id", params: { id: d.student.id } })}
              >
                <UserAvatar name={d.student.full_name} seed={d.student.id} photoUrl={d.student.photo_url} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{d.student.full_name}</div>
                  <div className="text-muted-foreground tnum text-xs">
                    {d.student.reg_no} · {d.invoice_count} unpaid
                    {d.overdue_periods.length > 0 ? ` · overdue ${d.overdue_periods.join(", ")}` : ""}
                  </div>
                </div>
                <span className="tnum font-display font-bold" style={{ color: "var(--bad)" }}>
                  {formatLKR(d.outstanding_minor)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <Pager
        page={page}
        pageSize={PAGE_SIZE}
        total={data?.total ?? 0}
        noun="defaulter"
        onPageChange={(p) => setSearch({ page: p })}
      />
    </div>
  );
}
