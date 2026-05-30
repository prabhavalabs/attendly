import { PageHeader } from "@/components/common/page-header";
import { UsersTab } from "@/components/users/users-tab";
import { RolesTab } from "@/components/roles/roles-tab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function UsersPage() {
  return (
    <div className="p-6 md:p-8">
      <PageHeader
        title="Users & Roles"
        description="Manage staff accounts and the role-based permissions that govern the portal."
      />
      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
        </TabsList>
        <TabsContent value="users" className="mt-5">
          <UsersTab />
        </TabsContent>
        <TabsContent value="roles" className="mt-5">
          <RolesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
