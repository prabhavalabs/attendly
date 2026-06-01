import { Page } from "@/components/layout/page";
import { Can } from "@/components/auth/can";
import { InvoicesTab } from "@/components/billing/invoices-tab";
import { DefaultersTab } from "@/components/billing/defaulters-tab";
import { useUrlSearch } from "@/lib/url-search";
import type { BillingSearch } from "@/router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function BillingPage() {
  const { search, setSearch } = useUrlSearch<BillingSearch>();
  const tab = search.tab === "defaulters" ? "defaulters" : "invoices";

  return (
    <Page title="Billing" description="Generate monthly invoices, record payments and track defaulters.">
      <Tabs
        value={tab}
        onValueChange={(v) => setSearch({ tab: v === "defaulters" ? "defaulters" : undefined, page: 1 })}
      >
        <TabsList>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <Can perm="report.read" fallback={<span />}>
            <TabsTrigger value="defaulters">Defaulters</TabsTrigger>
          </Can>
        </TabsList>
        <TabsContent value="invoices" className="mt-5">
          <InvoicesTab />
        </TabsContent>
        <TabsContent value="defaulters" className="mt-5">
          <DefaultersTab />
        </TabsContent>
      </Tabs>
    </Page>
  );
}
