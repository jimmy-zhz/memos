import { Checkbox } from "@/components/ui/checkbox";
import { useTranslate } from "@/utils/i18n";
import type { CalendarGroup } from "./parseCalendarBlock";

interface CalendarDayDetailProps {
  group?: CalendarGroup;
  selectedDate?: string;
}

export const CalendarDayDetail = ({ group, selectedDate }: CalendarDayDetailProps) => {
  const t = useTranslate();

  if (!selectedDate) {
    return null;
  }

  if (!group || group.items.length === 0) {
    return <div className="text-sm text-muted-foreground px-1 py-2">{t("markdown.calendar-block.no-records", { date: selectedDate })}</div>;
  }

  return (
    <div className="flex flex-col gap-1.5 px-1 py-2">
      <div className="text-sm font-medium text-foreground">{selectedDate}</div>
      <ul className="flex flex-col gap-1">
        {group.items.map((item, index) => (
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
