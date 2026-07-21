import { useRef } from "react";
import { useUpdateMemo } from "@/hooks/useMemoQueries";
import { setTaskStatusAtIndex } from "@/utils/markdown-manipulation";
import { resolveTaskStatus } from "@/utils/task-status";
import { useMemoViewContextOptional } from "../MemoView/MemoViewContext";
import { TASK_LIST_ITEM_CLASS } from "./constants";
import type { ReactMarkdownProps } from "./markdown/types";
import { TaskStatusCheckbox } from "./TaskStatusCheckbox";
import { useTaskStatusMarker } from "./TaskStatusContext";

interface TaskListItemProps extends React.InputHTMLAttributes<HTMLInputElement>, ReactMarkdownProps {
  checked?: boolean;
}

export const TaskListItem: React.FC<TaskListItemProps> = ({ checked, node: _node, ...props }) => {
  // MemoContent can render outside a MemoView (e.g. the Notebook single-document
  // preview provides no MemoViewContext). Fall back to a read-only checkbox there
  // instead of crashing the whole document render.
  const memoViewContext = useMemoViewContextOptional();
  const memo = memoViewContext?.memo;
  const readonly = memoViewContext?.readonly ?? true;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { mutate: updateMemo } = useUpdateMemo();

  // The extended marker travels on the <li>; `checked` only distinguishes the
  // two statuses GFM itself understands.
  const status = resolveTaskStatus(useTaskStatusMarker() ?? (checked ? "x" : " "));

  const applyStatus = (marker: string) => {
    if (readonly || !memo) {
      return;
    }

    // Find the task index by walking up the DOM
    const listItem = triggerRef.current?.closest("li.task-list-item");
    if (!listItem) {
      return;
    }

    // Get task index from data attribute, or calculate by counting
    const taskIndexStr = listItem.getAttribute("data-task-index");
    let taskIndex = 0;

    if (taskIndexStr !== null) {
      taskIndex = parseInt(taskIndexStr);
    } else {
      // Fallback: Calculate index by counting all task list items in the entire memo
      // We need to search from the root memo content container, not just the nearest list
      // to ensure nested tasks are counted in document order
      let searchRoot = listItem.closest("[data-memo-content]");

      // If memo content container not found, search from document body
      if (!searchRoot) {
        searchRoot = document.body;
      }

      const allTaskItems = searchRoot.querySelectorAll(`li.${TASK_LIST_ITEM_CLASS}`);
      for (let i = 0; i < allTaskItems.length; i++) {
        if (allTaskItems[i] === listItem) {
          taskIndex = i;
          break;
        }
      }
    }

    const newContent = setTaskStatusAtIndex(memo.content, taskIndex, marker);
    if (newContent === memo.content) {
      return;
    }

    updateMemo({
      update: {
        name: memo.name,
        content: newContent,
      },
      updateMask: ["content", "update_time"],
    });
  };

  return (
    <TaskStatusCheckbox
      marker={status.marker}
      readonly={readonly || !memo}
      onSelect={applyStatus}
      triggerRef={triggerRef}
      className={props.className}
    />
  );
};
