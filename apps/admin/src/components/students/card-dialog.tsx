import { Printer } from "lucide-react";

import { useSettings } from "@/hooks/use-settings";
import { useCardQr, openCardPdf } from "@/hooks/use-students";
import { Can } from "@/components/auth/can";
import { StudentCard } from "./student-card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Modal showing the hi-res student ID card, with a print-to-PDF action. */
export function CardDialog({
  studentId,
  fullName,
  regNo,
  cardStatus,
  open,
  onOpenChange,
}: {
  studentId: string;
  fullName: string;
  regNo: string;
  cardStatus: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: settings } = useSettings();
  const { data: qrUrl } = useCardQr(studentId, open);
  const orgName = settings?.org_name || "attendly";
  // reg_no is YYYY-NNNN, so the batch year is the prefix.
  const batch = /^\d{4}/.test(regNo) ? `Batch ${regNo.slice(0, 4)}` : "Student";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Student ID card</DialogTitle>
          <DialogDescription>The digital card students present at the door.</DialogDescription>
        </DialogHeader>
        <div className="py-1">
          <StudentCard
            orgName={orgName}
            fullName={fullName}
            regNo={regNo}
            batch={batch}
            active={cardStatus === "active"}
            qrUrl={qrUrl}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Can perm="card.issue">
            <Button onClick={() => void openCardPdf(studentId)}>
              <Printer className="size-4" /> Print card
            </Button>
          </Can>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
