import { Checkbox } from "@/components/ui/checkbox";
import { useTranslate } from "@/utils/i18n";
import type { CalendarItem } from "./parseCalendarBlock";

interface CalendarUngroupedSectionProps {
  items: CalendarItem[];
}

export const CalendarUngroupedSection = ({ items }: CalendarUngroupedSectionProps) => {
  const t = useTranslate();

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border/40 px-2 py-1.5">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("markdown.calendar-block.ungrouped")}</div>
      <ul className="flex flex-col gap-1">
        {items.map((item, index) => (
          <li key={index} className="flex items-center gap-2 text-sm">
            {item.checked !== undefined ? (
              <>
                <Checkbox checked={item.checked} disabled className="shrink-0" />
                <span>{item.text}</span>
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
