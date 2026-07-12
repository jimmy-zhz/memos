import { create } from "@bufbuild/protobuf";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { memoServiceClient } from "@/connect";
import { memoKeys } from "@/hooks/useMemoQueries";
import {
  CreateMemoHistoryRequestSchema,
  ListMemoHistoriesRequestSchema,
  MemoHistorySchema,
  RestoreMemoHistoryRequestSchema,
} from "@/types/proto/api/v1/memo_service_pb";

// Query keys factory for version-history cache management.
export const memoHistoryKeys = {
  all: ["memo-histories"] as const,
  list: (memoName: string) => [...memoHistoryKeys.all, "list", memoName] as const,
};

/** Lists all saved versions for a memo, newest first (creator-only). */
export function useMemoHistories(memoName: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: memoHistoryKeys.list(memoName),
    queryFn: async () => {
      const response = await memoServiceClient.listMemoHistories(create(ListMemoHistoriesRequestSchema, { parent: memoName }));
      return response.memoHistories;
    },
    enabled: options?.enabled ?? !!memoName,
  });
}

/** Saves a manual snapshot (version) of a memo's current content. */
export function useCreateMemoHistory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ memoName, displayName }: { memoName: string; displayName: string }) => {
      const memoHistory = create(MemoHistorySchema, { displayName });
      const response = await memoServiceClient.createMemoHistory(create(CreateMemoHistoryRequestSchema, { parent: memoName, memoHistory }));
      return response;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: memoHistoryKeys.list(variables.memoName) });
    },
  });
}

/**
 * Restores a memo to a saved version (content + attachment set). The server
 * rejects the call if the memo has unsaved changes, so callers should gate on
 * the content hash first for a friendly message. Returns the updated memo.
 */
export function useRestoreMemoHistory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ historyName }: { historyName: string; memoName: string }) => {
      return memoServiceClient.restoreMemoHistory(create(RestoreMemoHistoryRequestSchema, { name: historyName }));
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: memoKeys.detail(variables.memoName) });
      queryClient.invalidateQueries({ queryKey: memoKeys.lists() });
      queryClient.invalidateQueries({ queryKey: memoHistoryKeys.list(variables.memoName) });
    },
  });
}
