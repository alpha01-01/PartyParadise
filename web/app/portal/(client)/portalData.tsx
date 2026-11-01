"use client";

import { useCallback, useEffect, useState } from "react";
import { normaliseError, portalApi } from "@/lib/api";

export function usePortalData<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await portalApi.get<T>(path);
      setData(response.data);
      setError("");
    } catch (err) {
      setError(normaliseError(err).message);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load };
}

export function PageHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h1 className="pp-page-title">{title}</h1>
      <p className="pp-page-subtitle" style={{ marginBottom: 0 }}>{subtitle}</p>
    </div>
  );
}

export function PortalList({
  loading,
  error,
  empty,
  children,
}: {
  loading: boolean;
  error: string;
  empty: string | false;
  children: React.ReactNode;
}) {
  if (error) return <div className="pp-alert pp-alert-error">{error}</div>;
  if (loading) {
    return (
      <div className="pp-card">
        <div className="pp-skeleton" style={{ height: 16, width: 240 }} />
      </div>
    );
  }
  if (empty) {
    return (
      <div className="pp-card pp-empty">
        <div className="pp-empty-title">{empty}</div>
      </div>
    );
  }
  return <section className="pp-card" style={{ padding: 0, overflow: "auto" }}>{children}</section>;
}

export function statusLabel(status: string) {
  return status.replace(/_/g, " ").replace(/^\w/, (letter) => letter.toUpperCase());
}
