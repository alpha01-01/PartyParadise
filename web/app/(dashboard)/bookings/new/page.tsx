"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useClients } from "@/hooks";
import { createBooking } from "@/hooks/useBookings";
import { formatCurrency, cn } from "@/lib/utils";
import { normaliseError } from "@/lib/api";
import type { Client, ServiceType } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────
interface ServiceLine {
  id: string;
  service: string;
  description: string;
  price: string;
  pricing_type: string;
}

interface FormState {
  // Step 0 — Client
  selectedClient: Client | null;
  clientSearch: string;
  // Step 1 — Event details
  serviceType: ServiceType | "";
  eventType: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  venueName: string;
  venueAddress: string;
  guestCount: string;
  specialRequests: string;
  // Step 2 — Services
  services: ServiceLine[];
}

type StepErrors = Record<string, string>;

const INITIAL_STATE: FormState = {
  selectedClient: null,
  clientSearch: "",
  serviceType: "",
  eventType: "",
  eventDate: "",
  startTime: "",
  endTime: "",
  venueName: "",
  venueAddress: "",
  guestCount: "",
  specialRequests: "",
  services: [{ id: "1", service: "", description: "", price: "", pricing_type: "fixed" }],
};

const SERVICE_TYPES: { id: ServiceType; label: string; icon: string }[] = [
  { id: "decor",             label: "Decor",    icon: "D" },
  { id: "photobooth_360",    label: "360 Booth", icon: "360" },
  { id: "photobooth_rental", label: "Rental",   icon: "R" },
  { id: "combo",             label: "Combo",    icon: "C" },
];

const EVENT_TYPES = [
  "Wedding", "Birthday", "Corporate", "Bridal Shower",
  "Graduation", "Baby Shower", "Engagement Party", "Other",
];

const STEPS = [
  { title: "Client", subtitle: "Choose who this booking belongs to" },
  { title: "Event Details", subtitle: "Capture the event logistics" },
  { title: "Services", subtitle: "Price the delivery clearly" },
  { title: "Review", subtitle: "Confirm before creating" },
];

// ─── Page ─────────────────────────────────────────────────────
export default function NewBookingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [errors, setErrors] = useState<StepErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function update(patch: Partial<FormState>) {
    setForm((f) => ({ ...f, ...patch }));
    // Clear relevant errors when field changes
    const keys = Object.keys(patch);
    setErrors((e) => {
      const next = { ...e };
      keys.forEach((k) => delete next[k]);
      return next;
    });
  }

  function validateStep(s: number): StepErrors {
    const errs: StepErrors = {};
    if (s === 0) {
      if (!form.selectedClient) errs.client = "Please select a client";
    }
    if (s === 1) {
      if (!form.serviceType) errs.serviceType = "Please select a service type";
      if (!form.eventDate)   errs.eventDate   = "Event date is required";
      if (!form.venueName)   errs.venueName   = "Venue name is required";
    }
    if (s === 2) {
      const valid = form.services.filter((s) => s.service.trim() && parseFloat(s.price) > 0);
      if (valid.length === 0) errs.services = "Add at least one service with a price";
    }
    return errs;
  }

  function handleNext() {
    const errs = validateStep(step);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setStep((s) => s + 1);
  }

  function handleBack() {
    setStep((s) => Math.max(0, s - 1));
  }

  async function handleSubmit() {
    const errs = validateStep(3);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const booking = await createBooking({
        client_id:       form.selectedClient!.id,
        service_type:    form.serviceType as ServiceType,
        event_date:      form.eventDate,
        start_time:      form.startTime || undefined,
        end_time:        form.endTime || undefined,
        venue_name:      form.venueName || undefined,
        venue_address:   form.venueAddress || undefined,
        event_type:      form.eventType || undefined,
        guest_count:     form.guestCount ? parseInt(form.guestCount) : undefined,
        special_requests: form.specialRequests || undefined,
        services: form.services
          .filter((s) => s.service.trim() && parseFloat(s.price) > 0)
          .map((s) => ({
            service:      s.service,
            description:  s.description || undefined,
            price:        parseFloat(s.price),
            pricing_type: s.pricing_type,
          })),
      });
      router.push(`/bookings/${booking.id}?created=true`);
    } catch (err) {
      setSubmitError(normaliseError(err).message);
      setSubmitting(false);
    }
  }

  const totalAmount = form.services.reduce((sum, s) => sum + (parseFloat(s.price) || 0), 0);

  return (
    <>
      {/* Page header */}
      <div className="pp-page-header">
        <div>
          <h1 className="pp-page-title">New Booking</h1>
          <p className="pp-page-subtitle">
            Build the booking with a clear, team-friendly workflow from client selection to final review.
          </p>
          <div className="pp-booking-hero-meta">
            <span>{STEPS[step].title}</span>
            <span>Step {step + 1} of {STEPS.length}</span>
            <span>{STEPS[step].subtitle}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/bookings" className="pp-btn pp-btn-ghost">Discard</Link>
        </div>
      </div>

      {/* Step indicator */}
      <StepIndicator current={step} steps={STEPS} onJump={setStep} />

      {/* Form body */}
      <div className="pp-booking-form-layout">
        {/* Left: step content */}
        <div>
          {step === 0 && (
            <ClientStep
              form={form}
              errors={errors}
              onUpdate={update}
            />
          )}
          {step === 1 && (
            <EventStep
              form={form}
              errors={errors}
              onUpdate={update}
            />
          )}
          {step === 2 && (
            <ServicesStep
              form={form}
              errors={errors}
              onUpdate={update}
            />
          )}
          {step === 3 && (
            <ReviewStep form={form} totalAmount={totalAmount} />
          )}
        </div>

        {/* Right: sticky summary */}
        <BookingSummary
          form={form}
          totalAmount={totalAmount}
          step={step}
          submitting={submitting}
          submitError={submitError}
          onBack={handleBack}
          onNext={handleNext}
          onSubmit={handleSubmit}
        />
      </div>
    </>
  );
}

// ─── Step indicator ───────────────────────────────────────────
function StepIndicator({
  current,
  steps,
  onJump,
}: {
  current: number;
  steps: { title: string; subtitle: string }[];
  onJump: (i: number) => void;
}) {
  return (
    <div className="pp-step-indicator">
      {steps.map((step, i) => (
        <div key={step.title} className="pp-step-wrap">
          <button
            className={cn(
              "pp-step",
              i === current && "pp-step--active",
              i < current && "pp-step--done"
            )}
            onClick={() => i < current && onJump(i)}
            type="button"
          >
            <div className="pp-step-num">
              {i < current ? <CheckIcon /> : i + 1}
            </div>
            <div className="pp-step-copy">
              <span className="pp-step-title">{step.title}</span>
              <span className="pp-step-subtitle">{step.subtitle}</span>
            </div>
          </button>
          {i < steps.length - 1 && <div className="pp-step-connector" />}
        </div>
      ))}
    </div>
  );
}

// ─── Step 0: Client ───────────────────────────────────────────
function ClientStep({
  form,
  errors,
  onUpdate,
}: {
  form: FormState;
  errors: StepErrors;
  onUpdate: (p: Partial<FormState>) => void;
}) {
  const [showResults, setShowResults] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const { clients } = useClients({
    search: form.clientSearch,
    page_size: 5,
  });

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="pp-form-section">
      <div className="pp-form-section-header">
        <span className="pp-form-section-title">Client</span>
        <span className="pp-form-section-sub">
          Find an existing client or create a new one.
        </span>
      </div>
      <div className="pp-form-section-body">
        <div className="pp-field">
          <label className="pp-field-label">
            Search existing client <span className="pp-required">*</span>
          </label>
          <div ref={wrapRef} style={{ position: "relative" }}>
            <input
              className={cn("pp-input", errors.client && "pp-input--error")}
              placeholder="Type a name, email, or phone..."
              value={form.clientSearch}
              onChange={(e) => {
                onUpdate({ clientSearch: e.target.value, selectedClient: null });
                setShowResults(true);
              }}
              onFocus={() => setShowResults(true)}
              autoComplete="off"
            />
            {showResults && !form.selectedClient && (
              <div className="pp-client-dropdown">
                {clients.map((c) => (
                  <div
                    key={c.id}
                    className="pp-client-result"
                    onClick={() => {
                      onUpdate({
                        selectedClient: c,
                        clientSearch: `${c.first_name} ${c.last_name}`,
                      });
                      setShowResults(false);
                    }}
                  >
                    <div className="pp-client-av">
                      {(c.first_name[0] + c.last_name[0]).toUpperCase()}
                    </div>
                    <div>
                      <div className="pp-client-result-name">
                        {c.first_name} {c.last_name}
                      </div>
                      <div className="pp-client-result-meta">
                        {c.phone ?? c.email ?? "No contact info"}
                      </div>
                    </div>
                  </div>
                ))}
                <Link
                  href={`/clients/new?name=${encodeURIComponent(form.clientSearch)}`}
                  className="pp-client-result-new"
                  onClick={() => setShowResults(false)}
                >
                  <PlusIcon /> Create new client "{form.clientSearch}"
                </Link>
              </div>
            )}
          </div>
          {errors.client && <span className="pp-field-error">{errors.client}</span>}
          <div className="pp-field-hint">
            Required. Select one client to attach to the booking.
          </div>
        </div>

        {form.selectedClient && (
          <div className="pp-selected-client">
            <div className="pp-client-av pp-client-av--lg">
              {(form.selectedClient.first_name[0] + form.selectedClient.last_name[0]).toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: "var(--pp-text)" }}>
                {form.selectedClient.first_name} {form.selectedClient.last_name}
              </div>
              <div style={{ fontSize: 12, color: "var(--pp-text-3)" }}>
                {form.selectedClient.phone ?? ""} / {form.selectedClient.email ?? ""}
              </div>
            </div>
            <button
              className="pp-row-btn"
              onClick={() => onUpdate({ selectedClient: null, clientSearch: "" })}
              title="Clear"
            >
              <CloseIcon />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
// ─── Step 1: Event details ─────────────────────────────────────
function EventStep({
  form,
  errors,
  onUpdate,
}: {
  form: FormState;
  errors: StepErrors;
  onUpdate: (p: Partial<FormState>) => void;
}) {
  return (
    <div className="pp-form-section">
      <div className="pp-form-section-header">
        <span className="pp-form-section-title">Event Details</span>
        <span className="pp-form-section-sub">
          Capture the basics so the team can plan the delivery.
        </span>
      </div>
      <div className="pp-form-section-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Service type */}
        <div className="pp-field">
          <label className="pp-field-label">
            Service type <span className="pp-required">*</span>
          </label>
          <div className="pp-svc-pills">
            {SERVICE_TYPES.map((s) => (
              <button
                key={s.id}
                className={cn("pp-svc-pill", form.serviceType === s.id && `pp-svc-pill--${s.id.replace("photobooth_", "")}`)}
                onClick={() => onUpdate({ serviceType: s.id })}
                type="button"
              >
                <span className="pp-svc-pill-icon">{s.icon}</span> {s.label}
              </button>
            ))}
          </div>
          {errors.serviceType && <span className="pp-field-error">{errors.serviceType}</span>}
          <div className="pp-field-hint">Pick one primary service type.</div>
          <div className="pp-field-hint">
            Selected: {SERVICE_TYPES.find((s) => s.id === form.serviceType)?.label ?? "None yet"}
          </div>
        </div>

        {/* Event type + guest count */}
        <div className="pp-row-2">
          <div className="pp-field">
            <label className="pp-field-label">Event type</label>
            <select
              className="pp-input"
              value={form.eventType}
              onChange={(e) => onUpdate({ eventType: e.target.value })}
            >
              <option value="">Select event type...</option>
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <div className="pp-field-hint">Optional but helpful for reporting.</div>
          </div>
          <div className="pp-field">
            <label className="pp-field-label">Guest count</label>
            <input
              className="pp-input"
              type="number"
              min="1"
              placeholder="e.g. 150"
              value={form.guestCount}
              onChange={(e) => onUpdate({ guestCount: e.target.value })}
            />
            <div className="pp-field-hint">Estimate if unsure.</div>
          </div>
        </div>

        {/* Date + time */}
        <div className="pp-row-2">
          <div className="pp-field">
            <label className="pp-field-label">
              Event date <span className="pp-required">*</span>
            </label>
            <input
              className={cn("pp-input", errors.eventDate && "pp-input--error")}
              type="date"
              value={form.eventDate}
              onChange={(e) => onUpdate({ eventDate: e.target.value })}
              min={new Date().toISOString().split("T")[0]}
            />
            {errors.eventDate && <span className="pp-field-error">{errors.eventDate}</span>}
            <div className="pp-field-hint">Required for scheduling.</div>
          </div>
          <div className="pp-row-2" style={{ gap: 8 }}>
            <div className="pp-field">
              <label className="pp-field-label">Start time</label>
              <input
                className="pp-input"
                type="time"
                value={form.startTime}
                onChange={(e) => onUpdate({ startTime: e.target.value })}
              />
            </div>
            <div className="pp-field">
              <label className="pp-field-label">End time</label>
              <input
                className="pp-input"
                type="time"
                value={form.endTime}
                onChange={(e) => onUpdate({ endTime: e.target.value })}
              />
            </div>
          </div>
        </div>

        {/* Venue */}
        <div className="pp-field">
          <label className="pp-field-label">
            Venue name <span className="pp-required">*</span>
          </label>
          <input
            className={cn("pp-input", errors.venueName && "pp-input--error")}
            placeholder="e.g. Kempinski Hotel Gold Coast City"
            value={form.venueName}
            onChange={(e) => onUpdate({ venueName: e.target.value })}
          />
          {errors.venueName && <span className="pp-field-error">{errors.venueName}</span>}
          <div className="pp-field-hint">Required. The main event location.</div>
        </div>
        <div className="pp-field">
          <label className="pp-field-label">Venue address</label>
          <input
            className="pp-input"
            placeholder="Full address including area"
            value={form.venueAddress}
            onChange={(e) => onUpdate({ venueAddress: e.target.value })}
          />
        </div>

        {/* Special requests */}
        <div className="pp-field">
          <label className="pp-field-label">Special requests</label>
          <textarea
            className="pp-input"
            rows={3}
            placeholder="Color themes, special requirements, notes from the client..."
            value={form.specialRequests}
            onChange={(e) => onUpdate({ specialRequests: e.target.value })}
            style={{ resize: "vertical" }}
          />
          <div className="pp-field-hint">Optional. Adds context for the team.</div>
        </div>
      </div>
    </div>
  );
}
// ─── Step 2: Services ─────────────────────────────────────────
function ServicesStep({
  form,
  errors,
  onUpdate,
}: {
  form: FormState;
  errors: StepErrors;
  onUpdate: (p: Partial<FormState>) => void;
}) {
  function updateLine(i: number, patch: Partial<ServiceLine>) {
    const next = form.services.map((s, idx) =>
      idx === i ? { ...s, ...patch } : s
    );
    onUpdate({ services: next });
  }

  function addLine() {
    onUpdate({
      services: [
        ...form.services,
        { id: Date.now().toString(), service: "", description: "", price: "", pricing_type: "fixed" },
      ],
    });
  }

  function removeLine(i: number) {
    onUpdate({ services: form.services.filter((_, idx) => idx !== i) });
  }

  return (
    <div className="pp-form-section">
      <div className="pp-form-section-header">
        <span className="pp-form-section-title">Services & Pricing</span>
        <span style={{ fontSize: 11, color: "var(--pp-text-3)" }}>
          Add line items for this booking
        </span>
      </div>
      <div className="pp-form-section-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {errors.services && (
          <div className="pp-field-error" style={{ marginBottom: 4 }}>{errors.services}</div>
        )}

        <div className="pp-service-header">
          <span>Service</span>
          <span>Notes</span>
          <span>Price</span>
          <span>Pricing</span>
        </div>

        {form.services.map((line, i) => (
          <div key={line.id} className="pp-service-line">
            <div style={{ flex: 1 }}>
              <div className="pp-field" style={{ marginBottom: 8 }}>
                <label className="pp-field-label">Service name</label>
                <input
                  className="pp-input"
                  placeholder="e.g. Balloon arch and backdrop setup"
                  value={line.service}
                  onChange={(e) => updateLine(i, { service: e.target.value })}
                />
              </div>
              <div className="pp-field">
                <label className="pp-field-label">Notes (optional)</label>
                <input
                  className="pp-input"
                  placeholder="Any details about this service"
                  value={line.description}
                  onChange={(e) => updateLine(i, { description: e.target.value })}
                />
              </div>
            </div>
            <div style={{ width: 120 }}>
              <div className="pp-field" style={{ marginBottom: 8 }}>
                <label className="pp-field-label">Price (GHS)</label>
                <input
                  className="pp-input"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={line.price}
                  onChange={(e) => updateLine(i, { price: e.target.value })}
                />
              </div>
              <div className="pp-field">
                <label className="pp-field-label">Pricing</label>
                <select
                  className="pp-input"
                  value={line.pricing_type}
                  onChange={(e) => updateLine(i, { pricing_type: e.target.value })}
                  style={{ fontSize: 12 }}
                >
                  <option value="fixed">Fixed</option>
                  <option value="hourly">Hourly</option>
                  <option value="per_item">Per item</option>
                </select>
              </div>
            </div>
            {form.services.length > 1 && (
              <button
                className="pp-row-btn pp-row-btn--danger"
                onClick={() => removeLine(i)}
                title="Remove line"
                style={{ marginTop: 20 }}
              >
                <CloseIcon />
              </button>
            )}
          </div>
        ))}

        <button className="pp-add-service-btn" onClick={addLine} type="button">
          <PlusIcon /> Add service line item
        </button>
      </div>
    </div>
  );
}
// ─── Step 3: Review ───────────────────────────────────────────
function ReviewStep({
  form,
  totalAmount,
}: {
  form: FormState;
  totalAmount: number;
}) {
  const svcLabel = SERVICE_TYPES.find((s) => s.id === form.serviceType)?.label ?? "-";
  const validServices = form.services.filter((s) => s.service.trim() && parseFloat(s.price) > 0);

  return (
    <div className="pp-form-section">
      <div className="pp-form-section-header">
        <span className="pp-form-section-title">Review & Confirm</span>
      </div>
      <div className="pp-form-section-body" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Client */}
        <ReviewSection title="Client">
          {form.selectedClient ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div className="pp-client-av pp-client-av--lg">
                {(form.selectedClient.first_name[0] + form.selectedClient.last_name[0]).toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--pp-text)" }}>
                  {form.selectedClient.first_name} {form.selectedClient.last_name}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--pp-text-3)" }}>
                  {form.selectedClient.phone}
                </div>
              </div>
            </div>
          ) : <MissingText />}
        </ReviewSection>

        {/* Event */}
        <ReviewSection title="Event">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <ReviewField label="Type"    value={form.eventType || "-"} />
            <ReviewField label="Service" value={svcLabel} />
            <ReviewField label="Date"    value={form.eventDate || "-"} />
            <ReviewField label="Time"    value={form.startTime ? `${form.startTime}${form.endTime ? ` - ${form.endTime}` : ""}` : "-"} />
            <ReviewField label="Venue"   value={form.venueName || "-"} />
            <ReviewField label="Guests"  value={form.guestCount || "-"} />
          </div>
          {form.specialRequests && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, color: "var(--pp-text-3)", marginBottom: 4 }}>Special requests</div>
              <p style={{ fontSize: 12.5, color: "var(--pp-text-2)", lineHeight: 1.6 }}>
                {form.specialRequests}
              </p>
            </div>
          )}
        </ReviewSection>

        {/* Services */}
        {validServices.length > 0 && (
          <ReviewSection title="Services">
            {validServices.map((s, i) => (
              <div
                key={i}
                style={{
                  display: "flex", justifyContent: "space-between",
                  padding: "8px 0",
                  borderBottom: i < validServices.length - 1 ? "1px solid var(--pp-border)" : "none",
                  fontSize: 12.5,
                }}
              >
                <span style={{ color: "var(--pp-text-2)" }}>{s.service}</span>
                <span style={{ fontWeight: 500, color: "var(--pp-text)" }}>
                  {formatCurrency(parseFloat(s.price))}
                </span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, fontSize: 14, fontWeight: 600 }}>
              <span style={{ color: "var(--pp-text)" }}>Total</span>
              <span style={{ color: "var(--pp-gold)", fontFamily: "var(--pp-font-display, Syne, sans-serif)", fontSize: 17 }}>
                {formatCurrency(totalAmount)}
              </span>
            </div>
          </ReviewSection>
        )}

        {/* Status note */}
        <div style={{
          padding: "12px 14px",
          background: "rgba(245,200,66,0.05)",
          border: "1px solid rgba(245,200,66,0.12)",
          borderRadius: "var(--pp-radius-sm)",
          fontSize: 12, color: "var(--pp-text-2)",
        }}>
          This booking will be created with status{" "}
          <strong style={{ color: "var(--pp-gold)" }}>Inquiry</strong>.
          You can generate a quote and confirm it once the client approves.
        </div>
      </div>
    </div>
  );
}
// ─── Booking summary sidebar ───────────────────────────────────
function BookingSummary({
  form,
  totalAmount,
  step,
  submitting,
  submitError,
  onBack,
  onNext,
  onSubmit,
}: {
  form: FormState;
  totalAmount: number;
  step: number;
  submitting: boolean;
  submitError: string | null;
  onBack: () => void;
  onNext: () => void;
  onSubmit: () => void;
}) {
  const svcLabel = SERVICE_TYPES.find((s) => s.id === form.serviceType)?.label;
  const validServices = form.services.filter((s) => s.service.trim() && parseFloat(s.price) > 0);
  const hasContent = form.selectedClient || form.eventDate || validServices.length > 0;

  return (
    <div className="pp-booking-summary">
      <div className="pp-form-section-header">
        <span className="pp-form-section-title">Booking Summary</span>
      </div>
      <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
        {!hasContent ? (
          <p style={{ fontSize: 12, color: "var(--pp-text-3)", textAlign: "center", padding: "8px 0" }}>
            Fill in the form to see a summary
          </p>
        ) : (
          <>
            {form.selectedClient && (
              <SummaryRow label="Client" value={`${form.selectedClient.first_name} ${form.selectedClient.last_name}`} />
            )}
            {svcLabel && <SummaryRow label="Service" value={svcLabel} />}
            {form.eventDate && <SummaryRow label="Date" value={form.eventDate} />}
            {form.venueName && (
              <SummaryRow label="Venue" value={form.venueName} small />
            )}
            {validServices.length > 0 && (
              <div style={{ borderTop: "1px solid var(--pp-border)", paddingTop: 10, marginTop: 2 }}>
                {validServices.map((s, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: 12 }}>
                    <span style={{ color: "var(--pp-text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 140 }}>
                      {s.service}
                    </span>
                    <span style={{ fontWeight: 500, color: "var(--pp-text)", flexShrink: 0 }}>
                      {formatCurrency(parseFloat(s.price))}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {totalAmount > 0 && (
              <div style={{ borderTop: "1px solid var(--pp-border)", paddingTop: 10, display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 600, color: "var(--pp-text)", fontSize: 13 }}>Total</span>
                <span style={{
                  fontFamily: "var(--pp-font-display, Syne, sans-serif)",
                  fontSize: 17, fontWeight: 700,
                  color: "var(--pp-gold)",
                  letterSpacing: "-0.02em",
                }}>
                  {formatCurrency(totalAmount)}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {submitError && (
        <div style={{ margin: "0 18px 12px", padding: "10px 12px", background: "rgba(224,90,74,0.08)", border: "1px solid rgba(224,90,74,0.2)", borderRadius: "var(--pp-radius-sm)", fontSize: 12, color: "var(--pp-red)" }}>
          {submitError}
        </div>
      )}

      <div style={{ padding: "14px 18px", borderTop: "1px solid var(--pp-border)", display: "flex", gap: 8 }}>
        {step > 0 && (
          <button className="pp-btn pp-btn-ghost" onClick={onBack} disabled={submitting}>
            Back
          </button>
        )}
        <button
          className={cn("pp-btn pp-btn-primary", submitting && "pp-btn--loading")}
          style={{ flex: 1 }}
          onClick={step < 3 ? onNext : onSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <span className="pp-spinner" />
          ) : step < 3 ? (
            "Continue ->"
          ) : (
            "Create Booking"
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────────
function ReviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--pp-text-3)", marginBottom: 10 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function ReviewField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--pp-text-3)" }}>{label}</div>
      <div style={{ fontSize: 13, color: "var(--pp-text)" }}>{value}</div>
    </div>
  );
}

function SummaryRow({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", fontSize: 12.5 }}>
      <span style={{ color: "var(--pp-text-2)" }}>{label}</span>
      <span style={{ color: "var(--pp-text)", fontWeight: 500, textAlign: "right", maxWidth: 160, fontSize: small ? 11.5 : undefined }}>
        {value}
      </span>
    </div>
  );
}

function MissingText() {
  return <span style={{ fontSize: 12, color: "var(--pp-text-3)" }}>Not selected</span>;
}

// ─── Icons ────────────────────────────────────────────────────
function CheckIcon() { return <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function PlusIcon()  { return <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>; }
function CloseIcon() { return <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>; }

