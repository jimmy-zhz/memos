import type { CalendarDayCell as DayCellData } from "@/components/ActivityCalendar/types";
import { cn } from "@/lib/utils";
import type { CalendarItem } from "./parseCalendarBlock";

interface CalendarDayCellProps {
  day: DayCellData;
  items: CalendarItem[];
  onClick?: (date: string) => void;
}

const MAX_PREVIEW_ITEMS = 2;

export const CalendarDayCell = ({ day, items, onClick }: CalendarDayCellProps) => {
  if (!day.isCurrentMonth) {
    return <div className="aspect-square" aria-hidden="true" />;
  }

  const hasItems = items.length > 0;
  const previewItems = items.slice(0, MAX_PREVIEW_ITEMS);
  const isInteractive = Boolean(onClick);

  return (
    <button
      type="button"
      onClick={() => onClick?.(day.date)}
      aria-current={day.isToday ? "date" : undefined}
      aria-pressed={day.isSelected}
      className={cn(
        "relative flex aspect-square flex-col justify-between gap-0.5 overflow-hidden rounded-md border border-border/10 bg-muted/10 p-1 transition-colors",
        "md:justify-start md:gap-1 md:p-1.5",
        isInteractive ? "cursor-pointer hover:bg-muted/40" : "cursor-default",
        day.isToday && "ring-2 ring-inset ring-primary",
      )}
    >
      {day.isSelected && (
        <span
          className="pointer-events-none absolute right-0 top-0 h-0 w-0 border-l-[14px] border-t-[14px] border-l-transparent border-t-primary"
          aria-hidden="true"
        />
      )}
      <span className="self-end shrink-0 text-xs font-medium text-foreground md:text-sm">{day.label}</span>
      {hasItems && (
        <>
          <span className="mt-auto h-1 w-1 shrink-0 self-end rounded-full bg-primary/70 md:hidden" aria-hidden="true" />
          <div className="hidden md:flex md:flex-col md:gap-0.5 md:overflow-hidden md:text-left">
            {previewItems.map((item, index) => (
              <span key={index} className="truncate text-[10px] leading-tight text-muted-foreground">
                {item.text}
              </span>
            ))}
          </div>
        </>
      )}
    </button>
  );
};
