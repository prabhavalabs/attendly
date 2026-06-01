import { Page } from "@/components/layout/page";
import { UsersTab } from "@/components/users/users-tab";
import { RolesTab } from "@/components/roles/roles-tab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function UsersPage() {
  return (
    <Page
      title="Users & Roles"
      description="Manage staff accounts and the role-based permissions that govern the portal."
    >
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
    </Page>
  );
}
