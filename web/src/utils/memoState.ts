import type { Memo } from "@/types/proto/api/v1/memo_service_pb";
import { hashMemoState } from "./hash";

export { hashMemoState };

// attachmentUIDsOf extracts the attachment UIDs from a memo. Attachment resource
// names have the form "attachments/{uid}", and the version snapshot hash is keyed
// on these UIDs, so this is the canonical way to feed a memo's attachment set
// into hashMemoState.
export const attachmentUIDsOf = (memo: Pick<Memo, "attachments">): string[] =>
  memo.attachments.map((a) => a.name.split("/").pop() ?? "").filter(Boolean);
