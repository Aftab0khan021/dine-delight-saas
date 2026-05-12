import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

const COUNTRY_CODES = [
  { code: "+91", flag: "🇮🇳", country: "India" },
  { code: "+1", flag: "🇺🇸", country: "US/Canada" },
  { code: "+44", flag: "🇬🇧", country: "UK" },
  { code: "+971", flag: "🇦🇪", country: "UAE" },
  { code: "+966", flag: "🇸🇦", country: "Saudi Arabia" },
  { code: "+65", flag: "🇸🇬", country: "Singapore" },
  { code: "+61", flag: "🇦🇺", country: "Australia" },
  { code: "+49", flag: "🇩🇪", country: "Germany" },
  { code: "+33", flag: "🇫🇷", country: "France" },
  { code: "+81", flag: "🇯🇵", country: "Japan" },
  { code: "+86", flag: "🇨🇳", country: "China" },
  { code: "+82", flag: "🇰🇷", country: "South Korea" },
  { code: "+55", flag: "🇧🇷", country: "Brazil" },
  { code: "+52", flag: "🇲🇽", country: "Mexico" },
  { code: "+234", flag: "🇳🇬", country: "Nigeria" },
  { code: "+27", flag: "🇿🇦", country: "South Africa" },
  { code: "+62", flag: "🇮🇩", country: "Indonesia" },
  { code: "+60", flag: "🇲🇾", country: "Malaysia" },
  { code: "+63", flag: "🇵🇭", country: "Philippines" },
  { code: "+880", flag: "🇧🇩", country: "Bangladesh" },
  { code: "+92", flag: "🇵🇰", country: "Pakistan" },
  { code: "+977", flag: "🇳🇵", country: "Nepal" },
  { code: "+94", flag: "🇱🇰", country: "Sri Lanka" },
];

interface PhoneInputProps {
  value: string;
  onChange: (fullValue: string) => void;
  className?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  /** Height class, default "h-10" */
  heightClass?: string;
  /** Show the digit counter, default true */
  showCounter?: boolean;
  /** Placeholder for the number input */
  placeholder?: string;
}

/**
 * Phone number input with country code selector.
 * Enforces exactly 10 digits, numeric only.
 * Stores value as "+CC1234567890" format.
 */
export function PhoneInput({
  value,
  onChange,
  className,
  required,
  disabled,
  id,
  heightClass = "h-10",
  showCounter = true,
  placeholder = "Enter 10-digit number",
}: PhoneInputProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Parse incoming value to extract country code and digits
  const parseValue = (val: string) => {
    if (!val) return { countryCode: "+91", digits: "" };
    // Try to match a country code prefix
    for (const cc of COUNTRY_CODES) {
      if (val.startsWith(cc.code)) {
        const rest = val.slice(cc.code.length).replace(/\D/g, "");
        return { countryCode: cc.code, digits: rest };
      }
    }
    // If no country code found, extract digits only
    const digits = val.replace(/\D/g, "");
    return { countryCode: "+91", digits };
  };

  const { countryCode, digits } = parseValue(value);

  const selectedCountry = COUNTRY_CODES.find((c) => c.code === countryCode) || COUNTRY_CODES[0];

  const handleDigitChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow numeric characters, max 10
    const raw = e.target.value.replace(/\D/g, "").slice(0, 10);
    onChange(countryCode + raw);
  };

  const handleCountrySelect = (code: string) => {
    setDropdownOpen(false);
    onChange(code + digits);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  const digitCount = digits.length;
  const isComplete = digitCount === 10;

  return (
    <div className={cn("flex items-stretch gap-0", className)}>
      {/* Country Code Selector */}
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className={cn(
            "flex items-center gap-1 px-2.5 border border-r-0 border-input rounded-l-md bg-muted/50 text-sm font-medium shrink-0 hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-ring",
            heightClass,
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          <span className="text-base leading-none">{selectedCountry.flag}</span>
          <span className="text-xs text-muted-foreground">{selectedCountry.code}</span>
          <svg className="h-3 w-3 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {dropdownOpen && (
          <div className="absolute top-full left-0 mt-1 w-56 max-h-60 overflow-y-auto bg-popover border border-border rounded-md shadow-lg z-50">
            {COUNTRY_CODES.map((cc) => (
              <button
                key={cc.code}
                type="button"
                onClick={() => handleCountrySelect(cc.code)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent transition-colors text-left",
                  cc.code === countryCode && "bg-accent font-medium"
                )}
              >
                <span className="text-base">{cc.flag}</span>
                <span className="flex-1 truncate">{cc.country}</span>
                <span className="text-xs text-muted-foreground font-mono">{cc.code}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Number Input */}
      <div className="relative flex-1">
        <input
          id={id}
          type="tel"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={10}
          value={digits}
          onChange={handleDigitChange}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          className={cn(
            "w-full border border-input bg-background px-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
            showCounter ? "rounded-none" : "rounded-r-md",
            heightClass
          )}
          onKeyDown={(e) => {
            // Allow: backspace, delete, tab, escape, enter, arrows
            const allowed = ["Backspace", "Delete", "Tab", "Escape", "Enter", "ArrowLeft", "ArrowRight", "Home", "End"];
            if (allowed.includes(e.key)) return;
            // Allow Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
            if ((e.ctrlKey || e.metaKey) && ["a", "c", "v", "x"].includes(e.key.toLowerCase())) return;
            // Block anything that's not a digit
            if (!/^[0-9]$/.test(e.key)) {
              e.preventDefault();
            }
            // Block if already 10 digits and no text is selected
            if (digits.length >= 10 && e.currentTarget.selectionStart === e.currentTarget.selectionEnd) {
              if (/^[0-9]$/.test(e.key)) {
                e.preventDefault();
              }
            }
          }}
          onPaste={(e) => {
            e.preventDefault();
            const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 10);
            onChange(countryCode + pasted);
          }}
        />
        {/* Digit Counter */}
        {showCounter && (
          <div
            className={cn(
              "flex items-center px-2.5 border border-l-0 border-input rounded-r-md bg-muted/30 text-xs font-mono shrink-0 select-none",
              heightClass,
              isComplete ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
            )}
          >
            {digitCount}/10
          </div>
        )}
      </div>
    </div>
  );
}
