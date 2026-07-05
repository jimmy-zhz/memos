import type { WorkspaceTreeNode } from "@/types/proto/api/v1/workspace_service_pb";
import { WorkspaceTreeNode_NodeType } from "@/types/proto/api/v1/workspace_service_pb";

export type NotebookSortField = "createTime" | "updateTime" | "alphabetical";
export type NotebookSortOrder = "asc" | "desc";

export const DEFAULT_SORT_FIELD: NotebookSortField = "createTime";
export const DEFAULT_SORT_ORDER: NotebookSortOrder = "desc";

export function normalizeSortField(field: string | undefined): NotebookSortField {
  return field === "createTime" || field === "updateTime" || field === "alphabetical" ? field : DEFAULT_SORT_FIELD;
}

export function normalizeSortOrder(order: string | undefined): NotebookSortOrder {
  return order === "asc" || order === "desc" ? order : DEFAULT_SORT_ORDER;
}

function compareNodes(a: WorkspaceTreeNode, b: WorkspaceTreeNode, field: NotebookSortField): number {
  if (field === "alphabetical") {
    return a.name.localeCompare(b.name);
  }
  const aTime = field === "createTime" ? a.createTime : a.updateTime;
  const bTime = field === "createTime" ? b.createTime : b.updateTime;
  const aSeconds = aTime ? Number(aTime.seconds) : 0;
  const bSeconds = bTime ? Number(bTime.seconds) : 0;
  return aSeconds - bSeconds;
}

export function sortTree(nodes: WorkspaceTreeNode[], field: NotebookSortField, order: NotebookSortOrder): WorkspaceTreeNode[] {
  const sorted = [...nodes].sort((a, b) => {
    const result = compareNodes(a, b, field);
    return order === "asc" ? result : -result;
  });
  return sorted.map((node) =>
    node.type === WorkspaceTreeNode_NodeType.FOLDER && node.children.length > 0
      ? { ...node, children: sortTree(node.children, field, order) }
      : node,
  );
}
