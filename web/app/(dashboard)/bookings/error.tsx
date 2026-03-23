"use client";

import { useEffect } from "react";

export default function BookingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Bookings page error:", error);
  }, [error]);

  return (
    <div className="pp-card pp-empty" style={{ marginTop: 12 }}>
      <div className="pp-empty-icon">⚠️</div>
      <div className="pp-empty-title">Bookings failed to load</div>
      <p className="pp-empty-sub">
        Something went wrong while rendering the bookings page.
      </p>
      <button
        className="pp-btn pp-btn-primary"
        onClick={() => reset()}
        style={{ marginTop: 10 }}
      >
        Retry
      </button>
    </div>
  );
}
