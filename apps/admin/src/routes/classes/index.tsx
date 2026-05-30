import { PageHeader } from "@/components/common/page-header";
import { Can } from "@/components/auth/can";
import { ClassesGrid } from "@/components/classes/classes-grid";
import { LecturersTab } from "@/components/classes/lecturers-tab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function ClassesPage() {
  return (
    <div className="p-6 md:p-8">
      <PageHeader
        title="Classes"
        description="Manage classes, fees, lecturers and enrollments."
      />
      <Tabs defaultValue="classes">
        <TabsList>
          <TabsTrigger value="classes">Classes</TabsTrigger>
          <Can perm="lecturer.read" fallback={<span />}>
            <TabsTrigger value="lecturers">Lecturers</TabsTrigger>
          </Can>
        </TabsList>
        <TabsContent value="classes" className="mt-5">
          <ClassesGrid />
        </TabsContent>
        <TabsContent value="lecturers" className="mt-5">
          <LecturersTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
