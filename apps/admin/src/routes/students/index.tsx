import { useState } from "react";
import { Plus } from "lucide-react";

import { Page } from "@/components/layout/page";
import { Can } from "@/components/auth/can";
import { Button } from "@/components/ui/button";
import { StudentsList } from "@/components/students/students-list";
import { StudentDialog } from "@/components/students/student-dialog";

export default function StudentsPage() {
  const [addOpen, setAddOpen] = useState(false);
  return (
    <Page
      title="Students"
      description="Register students, manage profiles and guardians, and issue ID cards."
      actions={
        <Can perm="student.create">
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="size-4" />
            Register student
          </Button>
        </Can>
      }
    >
      <StudentsList />
      <StudentDialog open={addOpen} onOpenChange={setAddOpen} />
    </Page>
  );
}
