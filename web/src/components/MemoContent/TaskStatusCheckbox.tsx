import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, MinusIcon, SlashIcon } from "lucide-react";
import { forwardRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { resolveTaskStatus, TASK_STATUSES, type TaskStatusDefinition } from "@/utils/task-status";

const BOX_CLASS =
  // `flex` (not inline-flex) keeps the box out of inline baseline alignment, which
  // otherwise shifts it by the parent's descender space and by each glyph's metrics.
  "size-[18px] shrink-0 rounded-[4px] border border-border shadow-xs flex items-center justify-center text-[11px] leading-none font-semibold transition-colors";

const ICONS = {
  check: CheckIcon,
  slash: SlashIcon,
  minus: MinusIcon,
  "chevron-left": ChevronLeftIcon,
  "chevron-right": ChevronRightIcon,
} as const;

const StatusGlyph = ({ glyph }: { glyph: TaskStatusDefinition["glyph"] }) => {
  if (glyph === "") return null;

  const Icon = ICONS[glyph as keyof typeof ICONS];
  if (Icon) {
    return <Icon className="size-3 stroke-[3]" aria-hidden="true" />;
  }
  // Punctuation statuses have no matching icon; the box centers them as text.
  return <span aria-hidden="true">{glyph}</span>;
};

export const useTaskStatusLabel = () => {
  const { t } = useTranslation();
  return (marker: string) => {
    const definition = resolveTaskStatus(marker);
    return t(definition.labelKey, { defaultValue: definition.fallbackLabel });
  };
};

interface TaskStatusBoxProps extends React.HTMLAttributes<HTMLSpanElement> {
  marker: string;
}

/** The status glyph itself, without any interaction. */
export const TaskStatusBox = forwardRef<HTMLSpanElement, TaskStatusBoxProps>(({ marker, className, ...spanProps }, ref) => {
  const status = resolveTaskStatus(marker);

  return (
    <span
      ref={ref}
      data-task-status={status.marker}
      {...spanProps}
      className={cn(
        BOX_CLASS,
        status.marker === "x" && "bg-primary border-primary text-primary-foreground",
        status.marker !== "x" && status.marker !== " " && "text-muted-foreground",
        status.marker === "!" && "border-destructive text-destructive",
        className,
      )}
    >
      <StatusGlyph glyph={status.glyph} />
    </span>
  );
});
TaskStatusBox.displayName = "TaskStatusBox";

interface TaskStatusCheckboxProps {
  marker: string;
  readonly?: boolean;
  onSelect: (marker: string) => void;
  className?: string;
  /** Ref onto the trigger, used to locate the item in the DOM on select. */
  triggerRef?: React.Ref<HTMLButtonElement>;
}

/**
 * Checkbox that opens the extended status picker (`[ ] [x] [/] [-] [<] [>] [?] [!]`)
 * instead of toggling straight to done. Read-only renders show the glyph alone.
 */
export const TaskStatusCheckbox = ({ marker, readonly, onSelect, className, triggerRef }: TaskStatusCheckboxProps) => {
  const [open, setOpen] = useState(false);
  const label = useTaskStatusLabel();
  const status = resolveTaskStatus(marker);

  if (readonly) {
    return <TaskStatusBox data-slot="checkbox" marker={status.marker} className={className} aria-label={label(status.marker)} />;
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        ref={triggerRef}
        data-slot="checkbox"
        aria-label={label(status.marker)}
        onClick={(event) => event.stopPropagation()}
        className={cn("flex size-[18px] shrink-0 cursor-pointer items-center justify-center", className)}
      >
        <TaskStatusBox marker={status.marker} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[11rem]">
        {TASK_STATUSES.map((definition) => (
          <DropdownMenuItem
            key={definition.marker}
            onSelect={() => {
              setOpen(false);
              onSelect(definition.marker);
            }}
            className={cn("gap-2", definition.marker === status.marker && "bg-accent")}
          >
            <TaskStatusBox marker={definition.marker} />
            <span className="truncate">{label(definition.marker)}</span>
            <span className="text-muted-foreground ml-auto font-mono text-xs">[{definition.marker}]</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
