import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTranslate } from "@/utils/i18n";

interface AttachmentReferencedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Unlinks the attachment from the memo but keeps the file, so a saved version
  // that still references it can relink it later.
  onUnlinkOnly: () => void | Promise<void>;
  // Permanently deletes the file. The reference inside any saved version becomes
  // unrecoverable (a known limitation of the version history feature).
  onDelete: () => void | Promise<void>;
}

// Shown when the user removes an attachment that's referenced by at least one
// saved memo version. Deleting outright would make that version's snapshot
// permanently incomplete, so this offers unlinking (keep the file, drop the
// current memo's link to it) as the safer default action.
export default function AttachmentReferencedDialog({ open, onOpenChange, onUnlinkOnly, onDelete }: AttachmentReferencedDialogProps) {
  const t = useTranslate();
  const [loading, setLoading] = useState<"unlink" | "delete" | null>(null);

  const runAction = async (kind: "unlink" | "delete", action: () => void | Promise<void>) => {
    try {
      setLoading(kind);
      await action();
      onOpenChange(false);
    } finally {
      setLoading(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !loading && onOpenChange(o)}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{t("memo.attachment-referenced-title")}</DialogTitle>
          <DialogDescription>{t("memo.attachment-referenced-description")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" disabled={!!loading} onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button variant="default" disabled={!!loading} onClick={() => runAction("unlink", onUnlinkOnly)}>
            {t("memo.attachment-unlink-only")}
          </Button>
          <Button variant="destructive" disabled={!!loading} onClick={() => runAction("delete", onDelete)}>
            {t("memo.attachment-delete-anyway")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
