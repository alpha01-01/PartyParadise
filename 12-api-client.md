# Step 3b — API Client Layer

## Overview

The API client layer sits between the Next.js frontend and the FastAPI backend. Every component that needs data goes through this layer — never directly calls `fetch()`.

```
Component → Hook → lib/api.ts → FastAPI
```

---

## Files

| File | Purpose |
|---|---|
| `lib/api.ts` | Axios instance, JWT interceptors, token refresh, error normalisation |
| `lib/types.ts` | All TypeScript types matching FastAPI response schemas |
| `lib/auth.ts` | Zustand auth store — login, logout, user state |
| `lib/utils.ts` | Formatting helpers — currency, dates, status labels, initials |
| `hooks/useBookings.ts` | Bookings data — list, single, calendar, mutations |
| `hooks/index.ts` | useClients, useInvoices, useInventory, useReports |

---

## `lib/api.ts` — How it works

### Token strategy
- **Access token** lives in memory only (`let accessToken`). Never touches localStorage or cookies. Cleared on page reload — the refresh flow restores it.
- **Refresh token** lives in `localStorage` as `pp_refresh_token`. Persists across reloads.
- This pattern protects against XSS: a malicious script can't steal the access token from localStorage.

### Auto-refresh flow
When a request returns 401:
1. The response interceptor catches it
2. If not already refreshing, calls `POST /auth/refresh` with the stored refresh token
3. Updates the in-memory access token
4. Retries the original failed request with the new token
5. Any other requests that arrived during the refresh are queued and replayed once the new token is available

```
Request → 401
  ↓
Already refreshing? → Queue request
  ↓
POST /auth/refresh
  ↓
Success → Update token → Retry original → Replay queue
Failure → Clear tokens → Redirect to /login
```

### Error normalisation
All errors are normalised into `ApiError`:
```typescript
interface ApiError {
  message: string; // Human-readable, safe to show in UI
  status: number | null;
  detail: unknown;
}
```

Use `normaliseError(err)` in any catch block. Use `isApiError(err)` to type-narrow.

---

## `lib/auth.ts` — Auth store

Zustand store persisted to localStorage (user object only — not tokens).

```typescript
// Login
const { login, error, isLoading } = useAuthStore();
await login({ email, password });

// Current user
const user = useAuthStore(selectUser);

// Check if authenticated
const isAuth = useAuthStore(selectIsAuthenticated);

// Logout
const { logout } = useAuthStore();
await logout();
```

### On app mount
Call `_hydrateTokens()` in your root layout to validate the persisted session:

```typescript
// app/layout.tsx
"use client";
import { useEffect } from "react";
import { useAuthStore } from "@/lib/auth";

export default function RootLayout({ children }) {
  const hydrate = useAuthStore((s) => s._hydrateTokens);
  useEffect(() => { hydrate(); }, []);
  return <>{children}</>;
}
```

---

## Hooks pattern

Every data hook follows this consistent pattern:

```typescript
const {
  bookings,       // T[] — the data
  total,          // number — total records (for pagination)
  page,           // number — current page
  totalPages,     // number
  loading,        // boolean
  error,          // string | null
  filters,        // current filter state
  updateFilters,  // (partial) => void — resets to page 1
  goToPage,       // (n) => void
  refresh,        // () => void — re-fetch
} = useBookings();
```

### Filtering
```typescript
// Filter by status
updateFilters({ status: "confirmed" });

// Filter by service type + date range
updateFilters({
  service_type: "photobooth_360",
  from_date: "2025-03-01",
  to_date: "2025-03-31",
});

// Search
updateFilters({ search: "Ama Asante" });
```

### Mutations (actions)
Mutations are standalone async functions, not methods on the hook. Call them, then `refresh()`:

```typescript
import { updateBookingStatus } from "@/hooks/useBookings";

async function handleConfirm(bookingId: string) {
  try {
    await updateBookingStatus(bookingId, { status: "confirmed" });
    refresh(); // from useBookings()
  } catch (err) {
    if (isApiError(err)) toast.error(err.message);
  }
}
```

---

## `lib/utils.ts` — Formatting

### Currency
```typescript
formatCurrency(4800)              // "GHS 4,800.00"
formatCurrency(0)                 // "—"
formatCurrency(1250, { compact: true }) // "GHS 1.3k"
formatCurrency(0, { showEmpty: true })  // "GHS 0.00"
```

### Dates
```typescript
formatDate("2025-03-22")               // "22 Mar 2025"
formatDate("2025-03-22", "short")      // "22 Mar"
formatDate("2025-03-22", "long")       // "Saturday, 22 March 2025"
formatDate("2025-03-22", "month")      // "March 2025"
formatDateTime("2025-03-22T14:30:00Z") // "22 Mar 2025, 14:30"
timeAgo("2025-03-22T12:00:00Z")       // "2 hours ago"
daysUntil("2025-03-28")               // 6
```

### Helpers
```typescript
initials("Ama Asante")    // "AA"
initials("Kwame")         // "KW"
cn("pp-btn", isActive && "pp-btn--active") // conditional class merge
truncate("Long string...", 30)             // "Long string…"
```

---

## Environment variables (frontend)

```env
# apps/web/.env.local
NEXT_PUBLIC_API_URL=http://localhost:8000
```

For production:
```env
NEXT_PUBLIC_API_URL=https://api.partyparadise.com
```

---

## Portal API client

The portal uses a separate Axios instance (`portalApi`) with its own token:

```typescript
import { portalApi, setPortalAccessToken } from "@/lib/api";

// After portal login
setPortalAccessToken(data.access_token);

// Use in portal hooks
const { data } = await portalApi.get("/portal/bookings");
```

This ensures client portal tokens can never accidentally be sent to staff endpoints.

---

## Previous / Next

← [Step 3 — API Layer](./11-api-layer.md)
→ [Step 4 — Frontend Pages](./13-frontend-pages.md)
