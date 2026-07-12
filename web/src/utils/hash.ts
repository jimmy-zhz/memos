// sha256Hex returns the lowercase hex-encoded SHA-256 digest of the given text.
const sha256Hex = async (text: string): Promise<string> => {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

// hashMemoState computes the digest of a memo's versionable state: its content
// plus its (order-independent) set of attachment UIDs. This MUST match the Go
// store.HashMemoState canonicalization exactly — content, a NUL byte, then the
// sorted attachment UIDs joined by NUL — so the pre-restore guard can compare a
// memo's live state against a saved version's content_hash.
export const hashMemoState = async (content: string, attachmentUIDs: string[]): Promise<string> => {
  const uids = [...attachmentUIDs].sort();
  const joined = `${content}\x00${uids.join("\x00")}`;
  return sha256Hex(joined);
};
