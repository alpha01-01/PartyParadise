// ─────────────────────────────────────────────────────────────
// lib/utils.ts — shared formatting and helper utilities
// ─────────────────────────────────────────────────────────────

// ─── Currency ─────────────────────────────────────────────────
/**
 * Format a number as Ghana Cedis.
 * formatCurrency(4800)      → "GHS 4,800.00"
 * formatCurrency(0)         → "—"
 * formatCurrency(1250.5)    → "GHS 1,250.50"
 */
export function formatCurrency(
  amount: number | null | undefined,
  options: { showEmpty?: boolean; compact?: boolean } = {}
): string {
  if (amount === null || amount === undefined || (amount === 0 && !options.showEmpty)) {
    return "—";
  }

  if (options.compact && amount >= 1_000) {
    const k = amount / 1_000;
    return `GHS ${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
  }

  return `GHS ${amount.toLocaleString("en-GH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// ─── Dates ────────────────────────────────────────────────────
/**
 * Format a date string for display.
 * formatDate("2025-03-22")            → "22 Mar 2025"
 * formatDate("2025-03-22", "short")   → "22 Mar"
 * formatDate("2025-03-22", "long")    → "Saturday, 22 March 2025"
 * formatDate("2025-03-22", "month")   → "March 2025"
 */
export function formatDate(
  dateStr: string | null | undefined,
  style: "default" | "short" | "long" | "month" | "iso" = "default"
): string {
  if (!dateStr) return "—";

  const date = new Date(dateStr + "T00:00:00"); // prevent TZ shift
  if (isNaN(date.getTime())) return "—";

  switch (style) {
    case "short":
      return date.toLocaleDateString("en-GH", { day: "numeric", month: "short" });
    case "long":
      return date.toLocaleDateString("en-GH", {
        weekday: "long", day: "numeric", month: "long", year: "numeric",
      });
    case "month":
      return date.toLocaleDateString("en-GH", { month: "long", year: "numeric" });
    case "iso":
      return date.toISOString().split("T")[0];
    default:
      return date.toLocaleDateString("en-GH", {
        day: "numeric", month: "short", year: "numeric",
      });
  }
}

/**
 * Format a datetime string (e.g. from timestamps).
 * formatDateTime("2025-03-22T14:30:00Z") → "22 Mar 2025, 14:30"
 */
export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GH", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

/**
 * Return relative time for recent timestamps.
 * timeAgo("2025-03-22T14:00:00Z") → "2 hours ago"
 */
export function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(dateStr, "short");
}

/**
 * Days until a future date (negative if past).
 * daysUntil("2025-03-22") → 8
 */
export function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const date = new Date(dateStr + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

// ─── Booking / Invoice status helpers ─────────────────────────
export const BOOKING_STATUS_LABELS: Record<string, string> = {
  inquiry:     "Inquiry",
  quoted:      "Quoted",
  confirmed:   "Confirmed",
  in_progress: "In Progress",
  completed:   "Completed",
  cancelled:   "Cancelled",
};

export const BOOKING_STATUS_COLORS: Record<string, string> = {
  inquiry:     "neutral",
  quoted:      "blue",
  confirmed:   "gold",
  in_progress: "gold",
  completed:   "green",
  cancelled:   "red",
};

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft:     "Draft",
  sent:      "Sent",
  partial:   "Partial",
  paid:      "Paid",
  overdue:   "Overdue",
  cancelled: "Cancelled",
};

export const INVOICE_STATUS_COLORS: Record<string, string> = {
  draft:     "neutral",
  sent:      "blue",
  partial:   "gold",
  paid:      "green",
  overdue:   "red",
  cancelled: "neutral",
};

export const SERVICE_TYPE_LABELS: Record<string, string> = {
  decor:              "Decor",
  photobooth_360:     "360 Booth",
  photobooth_rental:  "Photo Booth Rental",
  combo:              "Combo",
};

// ─── Initials ─────────────────────────────────────────────────
/**
 * Get initials from a full name.
 * initials("Ama Asante") → "AA"
 * initials("Kwame")      → "KW"
 */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ─── Class name helper ────────────────────────────────────────
/**
 * Simple cn() — merge class names, filtering falsy values.
 * cn("pp-btn", isActive && "pp-btn--active") → "pp-btn pp-btn--active"
 */
export function cn(...classes: (string | boolean | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

// ─── Debounce ─────────────────────────────────────────────────
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// ─── Truncate ─────────────────────────────────────────────────
export function truncate(str: string | null | undefined, max: number): string {
  if (!str) return "—";
  if (str.length <= max) return str;
  return str.slice(0, max).trimEnd() + "…";
}

// ─── Payment method labels ────────────────────────────────────
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  momo_mtn:       "MTN MoMo",
  momo_vodafone:  "Vodafone Cash",
  momo_airteltigo:"AirtelTigo Money",
  bank_transfer:  "Bank Transfer",
  cash:           "Cash",
  paystack:       "Paystack",
  cheque:         "Cheque",
};

