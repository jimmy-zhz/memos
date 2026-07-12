import { useMemo, useState } from "react";
import { useTodayDate } from "@/components/ActivityCalendar/hooks";
import { CalendarDayDetail } from "./calendar/CalendarDayDetail";
import { CalendarMonthGrid } from "./calendar/CalendarMonthGrid";
import { CalendarUngroupedSection } from "./calendar/CalendarUngroupedSection";
import { defaultVisibleMonth, type VisibleMonth } from "./calendar/defaultVisibleMonth";
import { type CalendarItem, parseCalendarBlock } from "./calendar/parseCalendarBlock";
import { extractCodeContent } from "./utils";

interface CalendarBlockProps {
  children?: React.ReactNode;
  className?: string;
}

export const CalendarBlock = ({ children }: CalendarBlockProps) => {
  const codeContent = extractCodeContent(children);
  const groups = useMemo(() => parseCalendarBlock(codeContent), [codeContent]);

  const datedGroups = useMemo(() => groups.filter((g) => g.date), [groups]);
  const ungroupedItems = groups.find((g) => !g.date)?.items ?? [];

  const today = useTodayDate();
  const [visibleMonth, setVisibleMonth] = useState<VisibleMonth>(() => defaultVisibleMonth());
  const [selectedDate, setSelectedDate] = useState<string | undefined>(() => today);

  const itemCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const group of datedGroups) {
      counts[group.date!] = group.items.length;
    }
    return counts;
  }, [datedGroups]);

  const itemsByDate = useMemo(() => {
    const map: Record<string, CalendarItem[]> = {};
    for (const group of datedGroups) {
      map[group.date!] = group.items;
    }
    return map;
  }, [datedGroups]);

  if (groups.length === 0) {
    return <div className="text-sm text-muted-foreground px-1 py-2">空的 calendar 代码块</div>;
  }

  const handleSelectDate = (date: string) => {
    setSelectedDate(date);
  };

  const handleMonthChange = (month: VisibleMonth) => {
    setVisibleMonth(month);
    if (selectedDate) {
      const stillInMonth = selectedDate.startsWith(`${month.year}-${String(month.month + 1).padStart(2, "0")}`);
      if (!stillInMonth) {
        setSelectedDate(undefined);
      }
    }
  };

  const selectedGroup = datedGroups.find((g) => g.date === selectedDate);

  return (
    <div className="flex flex-col gap-3 not-prose">
      {ungroupedItems.length > 0 && <CalendarUngroupedSection items={ungroupedItems} />}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:gap-4">
        <div className="md:basis-[60%] md:grow-[6] md:shrink-0">
          <CalendarMonthGrid
            month={visibleMonth}
            onMonthChange={handleMonthChange}
            itemCounts={itemCounts}
            itemsByDate={itemsByDate}
            selectedDate={selectedDate}
            onSelectDate={handleSelectDate}
          />
        </div>
        <div className="md:basis-[40%] md:grow-[4] md:shrink-0 md:border-l md:border-border/40 md:pl-4">
          <CalendarDayDetail group={selectedGroup} selectedDate={selectedDate} />
        </div>
      </div>
    </div>
  );
};
