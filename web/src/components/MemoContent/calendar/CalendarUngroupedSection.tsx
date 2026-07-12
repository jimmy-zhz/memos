import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { CalendarItem } from "./parseCalendarBlock";

interface CalendarUngroupedSectionProps {
  items: CalendarItem[];
}

export const CalendarUngroupedSection = ({ items }: CalendarUngroupedSectionProps) => {
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border/40 px-2 py-1.5">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">未分组</div>
      <ul className="flex flex-col gap-1">
        {items.map((item, index) => (
          <li key={index} className="flex items-center gap-2 text-sm">
            {item.checked !== undefined ? (
              <>
                <Checkbox checked={item.checked} disabled className="shrink-0" />
                <span className={cn(item.checked && "line-through text-muted-foreground")}>{item.text}</span>
              </>
            ) : (
              <span className="pl-6">{item.text}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};
