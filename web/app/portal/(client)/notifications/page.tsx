"use client";

import Link from "next/link";
import { normaliseError, portalApi } from "@/lib/api";
import { useState } from "react";
import { formatDate } from "@/lib/utils";
import { PageHeading, PortalList, usePortalData } from "../portalData";

type PortalNotification = {
  id: string;
  title: string;
  message: string;
  action_url: string | null;
  is_read: boolean;
  created_at: string;
};

export default function PortalNotificationsPage() {
  const { data, loading, error, reload } = usePortalData<PortalNotification[]>("/portal/notifications");
  const [actionError, setActionError] = useState("");

  async function markRead(id: string) {
    try {
      await portalApi.patch(`/portal/notifications/${id}/read`);
      await reload();
    } catch (err) {
      setActionError(normaliseError(err).message);
    }
  }

  return (
    <>
      <PageHeading title="Notifications" subtitle="Updates about your events and payments." />
      {actionError && <div className="pp-alert pp-alert-error">{actionError}</div>}
      <PortalList loading={loading} error={error} empty={!data?.length && "No notifications yet"}>
        <table className="pp-table">
          <tbody>
            {data?.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.title}</strong>
                  <div>{item.message}</div>
                  {item.action_url && <Link href={item.action_url}>View</Link>}
                </td>
                <td>{formatDate(item.created_at, "short")}</td>
                <td>
                  {!item.is_read && (
                    <button type="button" className="pp-btn pp-btn-ghost" onClick={() => markRead(item.id)}>
                      Mark read
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </PortalList>
    </>
  );
}
