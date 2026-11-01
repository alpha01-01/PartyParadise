"use client";

import { formatDate } from "@/lib/utils";
import { PageHeading, PortalList, statusLabel, usePortalData } from "../portalData";

type PortalBooking = {
  id: string;
  reference: string;
  service_type: string;
  status: string;
  event_date: string;
  venue_name: string | null;
};

export default function PortalBookingsPage() {
  const { data, loading, error } = usePortalData<PortalBooking[]>("/portal/bookings");

  return (
    <>
      <PageHeading title="Bookings" subtitle="Your events with PartyParadise." />
      <PortalList loading={loading} error={error} empty={!data?.length && "No bookings yet"}>
        <table className="pp-table">
          <thead>
            <tr><th>Reference</th><th>Service</th><th>Date</th><th>Venue</th><th>Status</th></tr>
          </thead>
          <tbody>
            {data?.map((booking) => (
              <tr key={booking.id}>
                <td>{booking.reference}</td>
                <td>{statusLabel(booking.service_type)}</td>
                <td>{formatDate(booking.event_date, "short")}</td>
                <td>{booking.venue_name ?? "To be confirmed"}</td>
                <td>{statusLabel(booking.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </PortalList>
    </>
  );
}
