"use client";

import { useEffect, useRef } from "react";

// Clicking outside does nothing, so a stray click cannot lose what was typed.
export function ModalOverlay({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeRef.current();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  return (
    <div className="pp-modal-overlay" role="dialog" aria-modal="true">
      {children}
    </div>
  );
}
