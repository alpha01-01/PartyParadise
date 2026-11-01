"use client";

import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/utils";
import { PageHeading, PortalList, statusLabel, usePortalData } from "../portalData";

type PortalContract = {
  id: string;
  reference: string;
  status: string;
  event_date: string | null;
  total_amount: number;
  sign_path: string | null;
};

export default function PortalContractsPage() {
  const { data, loading, error } = usePortalData<PortalContract[]>("/portal/contracts");

  return (
    <>
      <PageHeading title="Contracts" subtitle="Review and sign your agreements." />
      <PortalList loading={loading} error={error} empty={!data?.length && "No contracts yet"}>
        <table className="pp-table">
          <thead>
            <tr><th>Reference</th><th>Event date</th><th>Value</th><th>Status</th><th /></tr>
          </thead>
          <tbody>
            {data?.map((contract) => (
              <tr key={contract.id}>
                <td>{contract.reference}</td>
                <td>{contract.event_date ? formatDate(contract.event_date, "short") : "-"}</td>
                <td>{formatCurrency(contract.total_amount, { showEmpty: true })}</td>
                <td>{statusLabel(contract.status)}</td>
                <td>{contract.sign_path && <Link href={contract.sign_path}>Review and sign</Link>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </PortalList>
    </>
  );
}
