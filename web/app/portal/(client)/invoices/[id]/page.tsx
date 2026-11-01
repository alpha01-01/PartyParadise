"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { normaliseError, portalApi } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import { PageHeading, PortalList, statusLabel, usePortalData } from "../../portalData";

type InvoiceDetail = {
  id: string;
  reference: string;
  total_amount: number;
  amount_paid: number;
  amount_due: number;
  status: string;
  due_date: string | null;
  items: { id: string; description: string; quantity: number; unit_price: number; total_price: number }[];
  payments: { id: string; amount: number; method: string; paid_at: string }[];
};

const PAYABLE = ["sent", "partial", "overdue"];

export default function PortalInvoicePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const { data, loading, error, reload } = usePortalData<InvoiceDetail>(`/portal/invoices/${params.id}`);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState("");

  // Paystack sends clients back with a reference. The webhook may land moments later.
  const returnedFromPaystack = searchParams.has("reference") && data?.status !== "paid";

  useEffect(() => {
    if (!returnedFromPaystack) return;
    const timer = setInterval(reload, 3000);
    return () => clearInterval(timer);
  }, [returnedFromPaystack, reload]);

  async function handlePay() {
    setPaying(true);
    setPayError("");
    try {
      const { data: charge } = await portalApi.post<{ authorization_url: string }>(
        `/portal/invoices/${params.id}/pay`,
        {}
      );
      window.location.href = charge.authorization_url;
    } catch (err) {
      setPayError(normaliseError(err).message);
      setPaying(false);
    }
  }

  return (
    <>
      <PageHeading title={data?.reference ?? "Invoice"} subtitle={data ? statusLabel(data.status) : ""} />
      <Link href="/portal/invoices">Back to invoices</Link>
      {returnedFromPaystack && (
        <div className="pp-alert">Thank you. We are confirming your payment, which can take a moment.</div>
      )}
      {payError && <div className="pp-alert pp-alert-error">{payError}</div>}

      <PortalList loading={loading} error={error} empty={false}>
        {data && (
          <table className="pp-table">
            <thead>
              <tr><th>Item</th><th>Quantity</th><th>Price</th><th>Total</th></tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.description}</td>
                  <td>{item.quantity}</td>
                  <td>{formatCurrency(item.unit_price, { showEmpty: true })}</td>
                  <td>{formatCurrency(item.total_price, { showEmpty: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </PortalList>

      {data && (
        <section className="pp-card" style={{ display: "grid", gap: 8 }}>
          <div>Total: {formatCurrency(data.total_amount, { showEmpty: true })}</div>
          <div>Paid: {formatCurrency(data.amount_paid, { showEmpty: true })}</div>
          <strong>Balance: {formatCurrency(data.amount_due, { showEmpty: true })}</strong>
          {data.due_date && <div>Due: {formatDate(data.due_date, "short")}</div>}
          {data.payments.map((payment) => (
            <div key={payment.id}>
              {formatDate(payment.paid_at, "short")}: {formatCurrency(payment.amount, { showEmpty: true })} by {statusLabel(payment.method)}
            </div>
          ))}
          {PAYABLE.includes(data.status) && data.amount_due > 0 && !returnedFromPaystack && (
            <div>
              <button type="button" className="pp-btn pp-btn-primary" onClick={handlePay} disabled={paying}>
                {paying ? "Opening Paystack..." : `Pay ${formatCurrency(data.amount_due, { showEmpty: true })}`}
              </button>
            </div>
          )}
        </section>
      )}
    </>
  );
}
