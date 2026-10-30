import { useEffect, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";

export interface DropdownChipOption {
  value: string;
  label: string;
  count?: number;
}

/**
 * Hiển thị bộ lọc dạng nút bấm mở popover chứa các thẻ chip đa cột giúp chọn nhanh không cần cuộn danh sách dài.
 */
export function DropdownChipFilter({
  label,
  value,
  allLabel,
  options,
  onChange,
}: {
  label: string;
  value: string;
  allLabel: string;
  options: DropdownChipOption[];
  onChange: (nextValue: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const activeOption = options.find((opt) => opt.value === value);
  const activeText = activeOption ? activeOption.label : allLabel;
  const normalizedQuery = query.trim().toLocaleLowerCase("vi");
  const filteredOptions = normalizedQuery
    ? options.filter((opt) =>
        `${opt.label} ${opt.value}`
          .toLocaleLowerCase("vi")
          .includes(normalizedQuery),
      )
    : options;

  return (
    <div className="dropdown-chip-filter" ref={containerRef}>
      <select
        className="sr-only"
        aria-label={label}
        tabIndex={-1}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{allLabel}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <div className="dropdown-chip-trigger-wrap">
        <button
          type="button"
          className={`dropdown-chip-trigger ${value ? "active-filter" : ""}`}
          aria-expanded={open}
          onClick={() => {
            setOpen((prev) => !prev);
            setQuery("");
          }}
        >
          <span className="dropdown-chip-prefix">{label}:</span>
          <strong>{activeText}</strong>
          <span className="dropdown-chip-badge">{options.length}</span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
        {value && (
          <button
            type="button"
            className="dropdown-chip-clear"
            aria-label={`Xóa ${label}`}
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          >
            <X size={13} aria-hidden="true" />
          </button>
        )}
      </div>
      {open && (
        <div
          className="dropdown-chip-popover"
          role="group"
          aria-label={`Chọn nhanh ${label}`}
        >
          {options.length > 6 && (
            <input
              type="search"
              className="dropdown-chip-search"
              aria-label={`Tìm nhanh trong ${label}`}
              placeholder={`Tìm nhanh ${label.toLocaleLowerCase("vi")}…`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          )}
          <div className="dropdown-chip-grid">
            <button
              type="button"
              className={`report-chip ${value === "" ? "primary" : ""}`}
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              {allLabel}
            </button>
            {filteredOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`report-chip ${value === opt.value ? "primary" : ""}`}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
              >
                {opt.label}
                {opt.count !== undefined && (
                  <small className="dropdown-chip-opt-count">
                    ({opt.count})
                  </small>
                )}
              </button>
            ))}
          </div>
          {filteredOptions.length === 0 && (
            <p className="muted" style={{ margin: "6px 0 0", fontSize: 12 }}>
              Không có mục khớp từ khóa.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
