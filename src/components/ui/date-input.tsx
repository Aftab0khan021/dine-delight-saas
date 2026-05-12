import * as React from "react";
import { useState, useRef, useCallback } from "react";
import { CalendarDays } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface DateInputProps {
  /** Current value in YYYY-MM-DD format */
  value: string;
  /** Called when value changes (YYYY-MM-DD) */
  onChange: (value: string) => void;
  /** Minimum date in YYYY-MM-DD format */
  min?: string;
  /** Maximum date in YYYY-MM-DD format */
  max?: string;
  /** Placeholder text when empty */
  placeholder?: string;
  /** Additional CSS classes */
  className?: string;
  /** Required field */
  required?: boolean;
  /** Disabled state */
  disabled?: boolean;
}

/**
 * DateInput — Hybrid date selector
 *
 * - Single click / tap: Focus the text input for manual date entry (DD/MM/YYYY)
 * - Double click: Opens a calendar popover for visual date picking
 * - Calendar icon button on the right also opens the calendar
 */
export function DateInput({
  value,
  onChange,
  min,
  max,
  placeholder = "DD/MM/YYYY",
  className,
  required,
  disabled,
}: DateInputProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [textValue, setTextValue] = useState(() => formatForDisplay(value));
  const lastClickRef = useRef<number>(0);

  // Parse YYYY-MM-DD → Date
  function toDate(s: string): Date | undefined {
    if (!s) return undefined;
    const d = new Date(s + "T00:00:00");
    return isNaN(d.getTime()) ? undefined : d;
  }

  // Format YYYY-MM-DD → DD/MM/YYYY for display
  function formatForDisplay(iso: string): string {
    if (!iso) return "";
    const parts = iso.split("-");
    if (parts.length !== 3) return iso;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  // Parse DD/MM/YYYY → YYYY-MM-DD
  function parseDisplay(display: string): string {
    const cleaned = display.replace(/[^0-9/.-]/g, "");
    // Accept DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
    const match = cleaned.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
    if (!match) return "";
    const [, dd, mm, yyyy] = match;
    const day = parseInt(dd, 10);
    const month = parseInt(mm, 10);
    const year = parseInt(yyyy, 10);
    if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) return "";
    const padD = String(day).padStart(2, "0");
    const padM = String(month).padStart(2, "0");
    return `${yyyy}-${padM}-${padD}`;
  }

  // Handle calendar date selection
  const handleCalendarSelect = useCallback(
    (date: Date | undefined) => {
      if (!date) return;
      const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      onChange(iso);
      setTextValue(formatForDisplay(iso));
      setCalendarOpen(false);
    },
    [onChange]
  );

  // Handle manual text input
  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value;
    // Auto-insert slashes as user types digits
    const digits = raw.replace(/[^0-9]/g, "");
    if (digits.length <= 2) {
      raw = digits;
    } else if (digits.length <= 4) {
      raw = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    } else {
      raw = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
    }
    setTextValue(raw);
    // Try to parse if complete
    const iso = parseDisplay(raw);
    if (iso) {
      // Validate against min/max
      if (min && iso < min) return;
      if (max && iso > max) return;
      onChange(iso);
    }
  };

  // On blur, re-format if valid
  const handleBlur = () => {
    const iso = parseDisplay(textValue);
    if (iso) {
      setTextValue(formatForDisplay(iso));
      onChange(iso);
    } else if (!textValue.trim()) {
      onChange("");
    }
  };

  // Handle click — detect double click manually for cross-browser support
  const handleClick = () => {
    const now = Date.now();
    if (now - lastClickRef.current < 350) {
      // Double click → open calendar
      setCalendarOpen(true);
    }
    lastClickRef.current = now;
  };

  // Sync external value changes to text
  React.useEffect(() => {
    setTextValue(formatForDisplay(value));
  }, [value]);

  const selectedDate = toDate(value);
  const minDate = toDate(min);
  const maxDate = toDate(max);

  return (
    <div className={cn("relative flex items-center", className)}>
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        value={textValue}
        onChange={handleTextChange}
        onBlur={handleBlur}
        onClick={handleClick}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        maxLength={10}
        autoComplete="off"
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 pr-10 text-sm ring-offset-background",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium",
          "placeholder:text-muted-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "font-mono tracking-wide"
        )}
      />
      <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={cn(
              "absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 rounded-md flex items-center justify-center",
              "text-muted-foreground hover:text-foreground hover:bg-muted transition-colors",
              "disabled:opacity-50 disabled:pointer-events-none"
            )}
            aria-label="Open calendar"
            tabIndex={-1}
          >
            <CalendarDays className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end" sideOffset={4}>
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={handleCalendarSelect}
            disabled={(date) => {
              if (minDate && date < minDate) return true;
              if (maxDate && date > maxDate) return true;
              return false;
            }}
            initialFocus
            className="pointer-events-auto"
          />
          <div className="px-3 pb-2 text-[10px] text-muted-foreground text-center">
            Tip: Type date directly or use calendar
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
