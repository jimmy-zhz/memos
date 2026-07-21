import { createContext, useContext } from "react";

/**
 * Status marker of the task list item currently being rendered, published by
 * ListItem (which sees the `data-task-status` property) and consumed by the
 * checkbox rendered inside it.
 */
export const TaskStatusContext = createContext<string | undefined>(undefined);

export const useTaskStatusMarker = () => useContext(TaskStatusContext);
