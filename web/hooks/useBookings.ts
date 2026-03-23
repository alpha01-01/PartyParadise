import { useState, useEffect, useCallback, useRef } from "react";
import api, { normaliseError, isRequestCancelled } from "@/lib/api";
import type {
  Booking,
  BookingStatus,
  CreateBookingRequest,
  UpdateStatusRequest,
  PaginatedResponse,
  ServiceType,
} from "@/lib/types";

export interface BookingFilters {
  status?: BookingStatus | "all";
  service_type?: ServiceType;
  client_id?: string;
  from_date?: string;
  to_date?: string;
  search?: string;
  page?: number;
  page_size?: number;
}

export function useBookings(initialFilters: BookingFilters = {}) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(initialFilters.page ?? 1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<BookingFilters>(initialFilters);
  const abortRef = useRef<AbortController | null>(null);

  const fetch = useCallback(async (overrideFilters?: BookingFilters) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setError(null);

    const active = overrideFilters ?? filters;
    const params = new URLSearchParams();

    if (active.status && active.status !== "all") params.set("status", active.status);
    if (active.service_type) params.set("service_type", active.service_type);
    if (active.client_id) params.set("client_id", active.client_id);
    if (active.from_date) params.set("from_date", active.from_date);
    if (active.to_date) params.set("to_date", active.to_date);
    if (active.search?.trim()) params.set("search", active.search.trim());
    params.set("page", String(active.page ?? page));
    params.set("page_size", String(active.page_size ?? 20));

    try {
      const { data } = await api.get<PaginatedResponse<Booking>>(`/bookings?${params.toString()}`, {
        signal: abortRef.current.signal,
      });
      setBookings(data.items);
      setTotal(data.total);
      setTotalPages(data.total_pages);
      setPage(data.page);
    } catch (err: unknown) {
      if (isRequestCancelled(err)) return;
      const apiErr = normaliseError(err);
      const message =
        apiErr.detail && typeof apiErr.detail === "string"
          ? apiErr.detail
          : apiErr.status
            ? `${apiErr.message} (status ${apiErr.status})`
            : apiErr.message;
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    fetch();
    return () => abortRef.current?.abort();
  }, [fetch]);

  function updateFilters(next: Partial<BookingFilters>) {
    const updated = { ...filters, ...next, page: 1 };
    setFilters(updated);
    setPage(1);
  }

  function goToPage(nextPage: number) {
    setPage(nextPage);
  }

  function refresh() {
    fetch();
  }

  return {
    bookings,
    total,
    page,
    totalPages,
    loading,
    error,
    filters,
    updateFilters,
    goToPage,
    refresh,
  };
}

export function useBooking(id: string | null) {
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<Booking>(`/bookings/${id}`, { signal });
      setBooking(data);
    } catch (err) {
      if (isRequestCancelled(err)) return;
      setError(normaliseError(err).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [id, load]);

  return { booking, loading, error, refresh: () => load() };
}

export function useCalendarBookings(month: string) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!month) {
      setBookings([]);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.get<Booking[]>(`/bookings/calendar?month=${month}`, {
          signal: controller.signal,
        });
        setBookings(data);
      } catch (err) {
        if (isRequestCancelled(err)) return;
        setError(normaliseError(err).message);
      } finally {
        setLoading(false);
      }
    }

    load();
    return () => controller.abort();
  }, [month]);

  return { bookings, loading, error };
}

export async function createBooking(data: CreateBookingRequest): Promise<Booking> {
  const { data: booking } = await api.post<Booking>("/bookings", data);
  return booking;
}

export async function updateBookingStatus(
  id: string,
  data: UpdateStatusRequest | BookingStatus
): Promise<Booking> {
  const payload = typeof data === "string" ? { status: data } : data;
  const { data: booking } = await api.patch<Booking>(`/bookings/${id}/status`, payload);
  return booking;
}

export async function addBookingNote(
  id: string,
  noteOrData: string | { note: string; is_internal?: boolean },
  isInternal = true
): Promise<void> {
  const payload = typeof noteOrData === "string"
    ? { note: noteOrData, is_internal: isInternal }
    : { note: noteOrData.note, is_internal: noteOrData.is_internal ?? true };
  await api.post(`/bookings/${id}/notes`, payload);
}

export async function assignStaff(
  bookingId: string,
  userId: string,
  role: string,
  reportTime?: string
): Promise<void> {
  await api.post(`/bookings/${bookingId}/staff`, {
    user_id: userId,
    role,
    report_time: reportTime,
  });
}

export async function allocateEquipment(
  bookingId: string,
  equipmentId: string,
  quantity = 1
): Promise<void> {
  await api.post(`/bookings/${bookingId}/equipment`, {
    equipment_id: equipmentId,
    quantity,
  });
}
