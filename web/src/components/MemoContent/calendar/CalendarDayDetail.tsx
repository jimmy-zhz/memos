import { PlusIcon } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { useTranslate } from "@/utils/i18n";
import type { CalendarGroup } from "./parseCalendarBlock";

interface CalendarDayDetailProps {
  group?: CalendarGroup;
  selectedDate?: string;
  readonly?: boolean;
  onAddItems?: (date: string, rawInput: string) => void;
  onToggleItem?: (date: string, itemIndex: number, checked: boolean) => void;
}

export const CalendarDayDetail = ({ group, selectedDate, readonly, onAddItems, onToggleItem }: CalendarDayDetailProps) => {
  const t = useTranslate();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  if (!selectedDate) {
    return null;
  }

  const handleSave = () => {
    if (!draft.trim()) {
      setOpen(false);
      return;
    }
    onAddItems?.(selectedDate, draft);
    setDraft("");
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === "Enter") {
      e.preventDefault();
      handleSave();
      return;
    }
    if (mod && e.key.toLowerCase() === "b") {
      e.preventDefault();
      const el = textareaRef.current;
      if (!el) return;
      const { selectionStart, selectionEnd, value } = el;
      const selected = value.slice(selectionStart, selectionEnd);
      const before = value.slice(0, selectionStart);
      const after = value.slice(selectionEnd);

      // Toggle off if the selection is already wrapped in **bold**.
      if (before.endsWith("**") && after.startsWith("**")) {
        const newValue = before.slice(0, -2) + selected + after.slice(2);
        setDraft(newValue);
        requestAnimationFrame(() => el.setSelectionRange(selectionStart - 2, selectionEnd - 2));
        return;
      }

      const newValue = `${before}**${selected}**${after}`;
      setDraft(newValue);
      const cursor = selected ? selectionEnd + 4 : selectionStart + 2;
      requestAnimationFrame(() => el.setSelectionRange(cursor, cursor));
    }
  };

  const addButton = !readonly && onAddItems && (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="size-6 mr-1 text-muted-foreground hover:text-foreground">
          <PlusIcon className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        <div className="flex flex-col gap-2">
          <Textarea
            ref={textareaRef}
            autoFocus
            placeholder={"Buy milk\nRead a book"}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            className="text-sm"
            rows={4}
          />
          <Button size="sm" onClick={handleSave}>
            {t("common.save")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );

  if (!group || group.items.length === 0) {
    return (
      <div className="flex items-center justify-between gap-2 px-1 py-2">
        <span className="text-sm text-muted-foreground">{t("markdown.calendar-block.no-records", { date: selectedDate })}</span>
        {addButton}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 px-1 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">{selectedDate}</span>
        {addButton}
      </div>
      <ul className="flex flex-col gap-1">
        {group.items.map((item, index) => (
          <li key={index} className="flex items-center gap-2 text-sm">
            {item.checked !== undefined ? (
              <>
                <Checkbox
                  checked={item.checked}
                  disabled={readonly || !onToggleItem}
                  onCheckedChange={(checked) => onToggleItem?.(selectedDate, index, checked === true)}
                  className="shrink-0"
                />
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
