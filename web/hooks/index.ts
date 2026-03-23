// hooks/useClients.ts
import { useState, useEffect, useCallback, useRef } from "react";
import api, { normaliseError, isRequestCancelled } from "@/lib/api";
import type {
  Client,
  ClientStatus,
  CreateClientRequest,
  UpdateClientRequest,
  CreateInteractionRequest,
  Interaction,
  PaginatedResponse,
  Contract,
  ContractStatus,
  ContractTemplate,
  Invoice,
  InvoiceStatus,
  Payment,
  RecordPaymentRequest,
} from "@/lib/types";

export interface ClientFilters {
  status?: ClientStatus | "all";
  tag?: string;
  search?: string;
  assigned_to?: string;
  page?: number;
  page_size?: number;
}

export function useClients(initialFilters: ClientFilters = {}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(initialFilters.page ?? 1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ClientFilters>(initialFilters);
  const abortRef = useRef<AbortController | null>(null);

  const fetch = useCallback(async (override?: ClientFilters) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setError(null);

    const active = override ?? filters;
    const params = new URLSearchParams();
    if (active.status && active.status !== "all") params.set("status", active.status);
    if (active.tag) params.set("tag", active.tag);
    if (active.search) params.set("search", active.search);
    if (active.assigned_to) params.set("assigned_to", active.assigned_to);
    params.set("page", String(active.page ?? page));
    params.set("page_size", String(active.page_size ?? 20));

    try {
      const { data } = await api.get<PaginatedResponse<Client>>(
        `/clients?${params}`,
        { signal: abortRef.current.signal }
      );
      setClients(data.items);
      setTotal(data.total);
      setTotalPages(data.total_pages);
      setPage(data.page);
    } catch (err: unknown) {
      if (isRequestCancelled(err)) return;
      setError(normaliseError(err).message);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    fetch();
    return () => abortRef.current?.abort();
  }, [fetch]);

  function updateFilters(next: Partial<ClientFilters>) {
    setFilters((f) => ({ ...f, ...next, page: 1 }));
    setPage(1);
  }

  function goToPage(nextPage: number) {
    setPage(nextPage);
  }

  return {
    clients,
    total,
    page,
    totalPages,
    loading,
    error,
    filters,
    updateFilters,
    goToPage,
    refresh: fetch,
  };
}

export function useClient(id: string | null) {
  const [client, setClient] = useState<Client | null>(null);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [clientRes, timelineRes] = await Promise.all([
        api.get<Client>(`/clients/${id}`),
        api.get<{ client?: Client; interactions: Interaction[]; bookings?: unknown[] }>(`/clients/${id}/timeline`),
      ]);
      setClient(clientRes.data);
      setInteractions(timelineRes.data.interactions ?? []);
    } catch (err) {
      setError(normaliseError(err).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      api.get<Client>(`/clients/${id}`),
      api.get<{ client?: Client; interactions: Interaction[]; bookings?: unknown[] }>(`/clients/${id}/timeline`),
    ])
      .then(([clientRes, timelineRes]) => {
        if (cancelled) return;
        setClient(clientRes.data);
        setInteractions(timelineRes.data.interactions ?? []);
      })
      .catch((err) => {
        if (!cancelled) setError(normaliseError(err).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  return { client, interactions, loading, error, refresh: load };
}

export async function createClient(data: CreateClientRequest): Promise<Client> {
  const { data: client } = await api.post<Client>("/clients", data);
  return client;
}

export async function updateClient(id: string, data: UpdateClientRequest): Promise<Client> {
  const { data: client } = await api.patch<Client>(`/clients/${id}`, data);
  return client;
}

export async function addInteraction(
  clientId: string,
  data: CreateInteractionRequest
): Promise<Interaction> {
  const { data: interaction } = await api.post<Interaction>(
    `/clients/${clientId}/interactions`,
    data
  );
  return interaction;
}


// hooks/useInvoices.ts
export interface InvoiceFilters {
  status?: InvoiceStatus | "all";
  client_id?: string;
  overdue?: boolean;
  search?: string;
  page?: number;
  page_size?: number;
}

export function useInvoices(initialFilters: InvoiceFilters = {}) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(initialFilters.page ?? 1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<InvoiceFilters>(initialFilters);

  const fetch = useCallback(async (override?: InvoiceFilters) => {
    setLoading(true);
    setError(null);
    const active = override ?? filters;
    const params = new URLSearchParams();
    if (active.status && active.status !== "all") params.set("status", active.status);
    if (active.client_id) params.set("client_id", active.client_id);
    if (active.overdue) params.set("overdue", "true");
    if (active.search) params.set("search", active.search);
    params.set("page", String(active.page ?? page));
    params.set("page_size", String(active.page_size ?? 20));

    try {
      const { data } = await api.get<PaginatedResponse<Invoice>>(
        `/invoicing/invoices?${params}`
      );
      setInvoices(data.items);
      setTotal(data.total);
      setTotalPages(data.total_pages);
      setPage(data.page);
    } catch (err) {
      setError(normaliseError(err).message);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  function goToPage(nextPage: number) {
    setPage(nextPage);
  }

  return {
    invoices,
    total,
    page,
    totalPages,
    loading,
    error,
    filters,
    updateFilters: (next: Partial<InvoiceFilters>) => {
      setFilters((f) => ({ ...f, ...next, page: 1 }));
      setPage(1);
    },
    goToPage,
    refresh: fetch,
  };
}

export function useInvoice(id: string | null) {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [invRes, payRes] = await Promise.all([
          api.get<Invoice>(`/invoicing/invoices/${id}`),
          api.get<Payment[]>(`/invoicing/invoices/${id}/payments`),
        ]);
        if (!cancelled) {
          setInvoice(invRes.data);
          setPayments(payRes.data);
        }
      } catch (err) {
        if (!cancelled) setError(normaliseError(err).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return { invoice, payments, loading, error };
}

export async function generateInvoiceFromBooking(bookingId: string): Promise<Invoice> {
  const { data } = await api.post<Invoice>(
    `/invoicing/invoices/from-booking/${bookingId}`
  );
  return data;
}

export async function sendInvoice(invoiceId: string): Promise<Invoice> {
  const { data } = await api.patch<Invoice>(`/invoicing/invoices/${invoiceId}/send`);
  return data;
}

export async function recordPayment(
  invoiceId: string,
  payment: RecordPaymentRequest
): Promise<Payment> {
  const { data } = await api.post<Payment>(
    `/invoicing/invoices/${invoiceId}/payments`,
    payment
  );
  return data;
}
// hooks/useContracts.ts
export interface ContractFilters {
  status?: ContractStatus | "all";
  client_id?: string;
  booking_id?: string;
  page?: number;
  page_size?: number;
}

export function useContracts(initialFilters: ContractFilters = {}) {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ContractFilters>(initialFilters);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (filters.status && filters.status !== "all") params.set("status", filters.status);
    if (filters.client_id) params.set("client_id", filters.client_id);
    if (filters.booking_id) params.set("booking_id", filters.booking_id);
    params.set("page", String(filters.page ?? page));
    params.set("page_size", String(filters.page_size ?? 20));

    try {
      const { data } = await api.get<PaginatedResponse<Contract>>(
        `/contracts?${params}`
      );
      setContracts(data.items);
      setTotal(data.total);
      setTotalPages(data.total_pages);
      setPage(data.page);
    } catch (err) {
      setError(normaliseError(err).message);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => { fetch(); }, [filters, page]);

  return {
    contracts,
    total,
    page,
    totalPages,
    loading,
    error,
    filters,
    updateFilters: (next: Partial<ContractFilters>) =>
      setFilters((f) => ({ ...f, ...next, page: 1 })),
    refresh: fetch,
  };
}

export function useContractTemplates() {
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<ContractTemplate[]>("/contracts/templates")
      .then(({ data }) => { if (!cancelled) setTemplates(data); })
      .catch((err) => { if (!cancelled) setError(normaliseError(err).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { templates, loading, error };
}

export async function createContract(data: {
  booking_id: string;
  template_id?: string;
  special_terms?: string;
  deposit_amount?: number;
}): Promise<Contract> {
  const { data: contract } = await api.post<Contract>("/contracts", data);
  return contract;
}


// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// hooks/useInventory.ts
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import type { InventoryItem, Equipment } from "@/lib/types";

export function useInventoryItems(filters: {
  category?: string;
  low_stock?: boolean;
  search?: string;
} = {}) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters.category) params.set("category", filters.category);
      if (filters.low_stock) params.set("low_stock", "true");
      if (filters.search) params.set("search", filters.search);

      try {
        const { data } = await api.get<PaginatedResponse<InventoryItem>>(
          `/inventory/items?${params}`
        );
        if (!cancelled) setItems(data.items);
      } catch (err) {
        if (!cancelled) setError(normaliseError(err).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [filters.category, filters.low_stock, filters.search]);

  return { items, loading, error };
}

export function useEquipment(availableOn?: string) {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const params = new URLSearchParams();
      if (availableOn) params.set("available_on", availableOn);

      try {
        const { data } = await api.get<Equipment[]>(
          `/inventory/equipment?${params}`
        );
        if (!cancelled) setEquipment(data);
      } catch (err) {
        if (!cancelled) setError(normaliseError(err).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [availableOn]);

  return { equipment, loading, error };
}

export async function createInventoryTransaction(data: {
  item_id: string;
  type: string;
  quantity: number;
  reason?: string;
  booking_id?: string;
}): Promise<void> {
  await api.post("/inventory/transactions", data);
}


// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// hooks/useReports.ts
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import type {
  DashboardSummary,
  PnLReport,
  BookingProfitability,
  BookingProfitabilitySummary,
} from "@/lib/types";

export function useDashboard() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<DashboardSummary>("/reports/dashboard")
      .then(({ data: d }) => { if (!cancelled) setData(d); })
      .catch((err) => { if (!cancelled) setError(normaliseError(err).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { data, loading, error };
}

export function usePnL(year: number) {
  const [data, setData] = useState<PnLReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<PnLReport>(`/reports/pnl?year=${year}`)
      .then(({ data: d }) => { if (!cancelled) setData(d); })
      .catch((err) => { if (!cancelled) setError(normaliseError(err).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [year]);

  return { data, loading, error };
}

export function useBookingProfitability(bookingId: string | null) {
  const [data, setData] = useState<BookingProfitability | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bookingId) return;
    let cancelled = false;
    setLoading(true);
    api.get<BookingProfitability>(`/reports/bookings/${bookingId}/profitability`)
      .then(({ data: d }) => { if (!cancelled) setData(d); })
      .catch((err) => { if (!cancelled) setError(normaliseError(err).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [bookingId]);

  return { data, loading, error };
}

export function useTopBookingProfitability(limit = 5) {
  const [data, setData] = useState<BookingProfitabilitySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<BookingProfitabilitySummary[]>(
      `/reports/bookings/profitability/top?limit=${limit}`
    )
      .then(({ data: d }) => { if (!cancelled) setData(d); })
      .catch((err) => { if (!cancelled) setError(normaliseError(err).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [limit]);

  return { data, loading, error };
}

export function useLowStockItems() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<InventoryItem[]>("/reports/inventory/low-stock")
      .then(({ data: d }) => { if (!cancelled) setItems(d); })
      .catch((err) => { if (!cancelled) setError(normaliseError(err).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { items, loading, error };
}


// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// EXPENSES
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

export interface ExpenseFilters {
  category_id?: string;
  booking_id?: string;
  from_date?: string;
  to_date?: string;
  search?: string;
  page?: number;
  page_size?: number;
}

export interface ExpenseCategoryData {
  id: string;
  name: string;
  type: string;
  color: string | null;
  is_active: boolean;
}

export interface ExpenseData {
  id: string;
  reference: string;
  description: string;
  amount: number;
  payment_method: string;
  expense_date: string;
  status: string;
  receipt_url: string | null;
  booking_id: string | null;
  supplier_id: string | null;
  category: ExpenseCategoryData;
  created_at: string;
}

export function useExpenseCategories() {
  const [categories, setCategories] = useState<ExpenseCategoryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<ExpenseCategoryData[]>("/accounting/categories")
      .then(({ data: d }) => { if (!cancelled) setCategories(d); })
      .catch((err) => { if (!cancelled) setError(normaliseError(err).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { categories, loading, error };
}

export function useExpenses(initialFilters: ExpenseFilters = {}) {
  const [expenses, setExpenses] = useState<ExpenseData[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ExpenseFilters>(initialFilters);
  const abortRef = useRef<AbortController | null>(null);

  const fetch = useCallback(async () => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (filters.category_id) params.set("category_id", filters.category_id);
    if (filters.booking_id)  params.set("booking_id",  filters.booking_id);
    if (filters.from_date)   params.set("from_date",   filters.from_date);
    if (filters.to_date)     params.set("to_date",     filters.to_date);
    if (filters.search)      params.set("search",      filters.search);
    params.set("page",      String(filters.page      ?? page));
    params.set("page_size", String(filters.page_size ?? 20));

    try {
      const { data } = await api.get<PaginatedResponse<ExpenseData>>(
        `/accounting/expenses?${params}`,
        { signal: abortRef.current.signal }
      );
      setExpenses(data.items);
      setTotal(data.total);
      setTotalPages(data.total_pages);
      setPage(data.page);
    } catch (err: unknown) {
      if (isRequestCancelled(err)) return;
      setError(normaliseError(err).message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { fetch(); return () => abortRef.current?.abort(); }, [filters]);

  function updateFilters(next: Partial<ExpenseFilters>) {
    setFilters((f) => ({ ...f, ...next, page: 1 }));
  }

  function goToPage(p: number) {
    setFilters((f) => ({ ...f, page: p }));
  }

  return { expenses, total, page, totalPages, loading, error, filters, updateFilters, goToPage, refresh: fetch };
}

export async function createExpense(data: {
  category_id: string;
  description: string;
  amount: number;
  payment_method: string;
  expense_date: string;
  booking_id?: string;
  supplier_id?: string;
  notes?: string;
}): Promise<ExpenseData> {
  const { data: expense } = await api.post<ExpenseData>("/accounting/expenses", data);
  return expense;
}

export async function deleteExpense(id: string): Promise<void> {
  await api.delete(`/accounting/expenses/${id}`);
}


// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// STAFF
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

export interface StaffProfileData {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  role_title: string;
  employment_type: "full_time" | "part_time" | "contract";
  phone: string | null;
  base_salary: number | null;
  daily_rate: number | null;
  is_active: boolean;
  hired_at: string | null;
  // computed client-side from initials
  initials: string;
}

export interface ShiftData {
  id: string;
  staff_id: string;
  shift_date: string;
  start_time: string;
  end_time: string | null;
  type: string;
  status: string;
  booking_id: string | null;
  booking_ref: string | null;
  location: string | null;
  notes: string | null;
}

export interface LeaveRequestData {
  id: string;
  staff_id: string;
  staff_name: string;
  staff_initials: string;
  type: string;
  start_date: string;
  end_date: string;
  days_requested: number;
  status: "pending" | "approved" | "declined";
  reason: string | null;
  review_notes: string | null;
}

function toInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function useStaff(filters: { employment_type?: string; is_active?: boolean; search?: string } = {}) {
  const [staff, setStaff] = useState<StaffProfileData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (filters.employment_type)              params.set("employment_type", filters.employment_type);
    if (filters.is_active !== undefined)      params.set("is_active",       String(filters.is_active));
    if (filters.search)                       params.set("search",          filters.search);

    try {
      const { data: raw } = await api.get<any[]>(`/staff?${params}`);
      // Attach initials (computed from user.full_name on the backend join)
      setStaff(raw.map((s) => ({
        ...s,
        full_name: s.user?.full_name ?? s.full_name ?? "Unknown",
        email:     s.user?.email    ?? s.email     ?? "",
        initials:  toInitials(s.user?.full_name ?? s.full_name ?? "?"),
      })));
    } catch (err) {
      setError(normaliseError(err).message);
    } finally {
      setLoading(false);
    }
  }, [filters.employment_type, filters.is_active, filters.search]);

  useEffect(() => { fetch(); }, [fetch]);

  return { staff, loading, error, refresh: fetch };
}

export async function createStaffMember(data: {
  first_name: string;
  last_name: string;
  email: string;
  role_title: string;
  employment_type: string;
  phone?: string;
  base_salary?: number;
  daily_rate?: number;
  hired_at?: string;
}): Promise<StaffProfileData> {
  const { data: profile } = await api.post<any>("/staff", data);
  return {
    ...profile,
    full_name: `${data.first_name} ${data.last_name}`,
    email:     data.email,
    initials:  toInitials(`${data.first_name} ${data.last_name}`),
  };
}

export function useWeekShifts(weekStart: string) {
  const [shifts, setShifts] = useState<ShiftData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!weekStart) return;
    let cancelled = false;
    setLoading(true);

    api.get<ShiftData[]>(`/staff/shifts/week?week=${weekStart}`)
      .then(({ data: d }) => { if (!cancelled) setShifts(d); })
      .catch((err) => { if (!cancelled) setError(normaliseError(err).message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [weekStart]);

  return { shifts, loading, error };
}

export async function createShift(data: {
  staff_id: string;
  type: string;
  shift_date: string;
  start_time: string;
  end_time?: string;
  booking_id?: string;
  location?: string;
  notes?: string;
}): Promise<ShiftData> {
  const { data: shift } = await api.post<ShiftData>("/staff/shifts", data);
  return shift;
}

export function useLeaveRequests(filters: { status?: string; staff_id?: string } = {}) {
  const [requests, setRequests] = useState<LeaveRequestData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.status)   params.set("status",   filters.status);
    if (filters.staff_id) params.set("staff_id", filters.staff_id);

    try {
      const { data: raw } = await api.get<any[]>(`/staff/leave?${params}`);
      // Enrich with staff name/initials (backend join returns staff profile)
      setRequests(raw.map((r) => ({
        ...r,
        staff_name:     r.staff?.user?.full_name ?? r.staff_name ?? "Staff",
        staff_initials: toInitials(r.staff?.user?.full_name ?? r.staff_name ?? "?"),
      })));
    } catch (err) {
      setError(normaliseError(err).message);
    } finally {
      setLoading(false);
    }
  }, [filters.status, filters.staff_id]);

  useEffect(() => { fetch(); }, [fetch]);

  return { requests, loading, error, refresh: fetch };
}

export async function reviewLeaveRequest(
  id: string,
  status: "approved" | "declined",
  notes?: string
): Promise<void> {
  await api.patch(`/staff/leave/${id}`, { status, review_notes: notes });
}



