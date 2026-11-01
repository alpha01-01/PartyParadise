"use client";

import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/utils";
import { PageHeading, PortalList, statusLabel, usePortalData } from "../portalData";

type PortalInvoice = {
  id: string;
  reference: string;
  total_amount: number;
  amount_due: number;
  status: string;
  due_date: string | null;
};

export default function PortalInvoicesPage() {
  const { data, loading, error } = usePortalData<PortalInvoice[]>("/portal/invoices");

  return (
    <>
      <PageHeading title="Invoices" subtitle="View what you owe and pay online." />
      <PortalList loading={loading} error={error} empty={!data?.length && "No invoices yet"}>
        <table className="pp-table">
          <thead>
            <tr><th>Reference</th><th>Status</th><th>Due</th><th>Total</th><th>Balance</th></tr>
          </thead>
          <tbody>
            {data?.map((invoice) => (
              <tr key={invoice.id}>
                <td><Link href={`/portal/invoices/${invoice.id}`}>{invoice.reference}</Link></td>
                <td>{statusLabel(invoice.status)}</td>
                <td>{invoice.due_date ? formatDate(invoice.due_date, "short") : "-"}</td>
                <td>{formatCurrency(invoice.total_amount, { showEmpty: true })}</td>
                <td>{formatCurrency(invoice.amount_due, { showEmpty: true })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </PortalList>
    </>
  );
}
