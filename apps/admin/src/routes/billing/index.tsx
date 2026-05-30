import { PageHeader } from "@/components/common/page-header";
import { Can } from "@/components/auth/can";
import { InvoicesTab } from "@/components/billing/invoices-tab";
import { DefaultersTab } from "@/components/billing/defaulters-tab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function BillingPage() {
  return (
    <div className="p-6 md:p-8">
      <PageHeader title="Billing" description="Generate monthly invoices, record payments and track defaulters." />
      <Tabs defaultValue="invoices">
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
    </div>
  );
}
