// ─────────────────────────────────────────────────────────────
// packages/types/src/index.ts
// Shared types used by web, mobile, and API response parsing
// ─────────────────────────────────────────────────────────────

// ─── Pagination ───────────────────────────────────────────────
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface PaginationParams {
  page?: number;
  page_size?: number;
}

// ─── Auth ─────────────────────────────────────────────────────
export interface UserRole {
  id: string;
  name: string;
  description: string | null;
}

export interface User {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  roles: UserRole[];
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
}

// ─── Clients ──────────────────────────────────────────────────
export type ClientStatus = "lead" | "prospect" | "active" | "past" | "lost";
export type ClientType = "individual" | "corporate" | "planner";
export type InteractionChannel = "whatsapp" | "call" | "email" | "in_person" | "instagram";
export type InteractionDirection = "inbound" | "outbound";

export interface Tag {
  id: string;
  name: string;
  color: string | null;
}

export interface ClientAddress {
  id?: string;
  type?: string;
  city?: string;
  region?: string | null;
}

export interface ClientBookingSummary {
  id: string;
  reference: string;
  event_type?: string | null;
  service_type?: ServiceType;
  event_date: string;
  status: string;
  total_amount?: number | null;
}

export interface ClientInvoiceSummary {
  id: string;
  reference: string;
  amount_due: number;
}

export interface ClientPortalAccount {
  is_active: boolean;
  email: string;
  last_login_at?: string | null;
}

export interface Client {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  source: string | null;
  status: ClientStatus;
  client_type: ClientType | null;
  notes: string | null;
  assigned_to: string | null;
  created_at: string;
  tags: Tag[];
  addresses?: ClientAddress[];
  bookings?: ClientBookingSummary[];
  invoices?: ClientInvoiceSummary[];
  portal_account?: ClientPortalAccount | null;
}

export interface Interaction {
  id: string;
  client_id: string;
  user_id: string | null;
  channel: InteractionChannel;
  direction: InteractionDirection;
  summary: string;
  interacted_at: string;
  created_at?: string;
}

export interface CreateClientRequest {
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  source?: string;
  status?: ClientStatus;
  client_type?: ClientType;
  notes?: string;
  assigned_to?: string;
}

export interface UpdateClientRequest extends Partial<CreateClientRequest> {}

export interface CreateInteractionRequest {
  channel: InteractionChannel;
  direction: InteractionDirection;
  summary: string;
}

// ─── Bookings ─────────────────────────────────────────────────
export type ServiceType = "decor" | "photobooth_360" | "photobooth_rental" | "combo";
export type BookingStatus =
  | "inquiry"
  | "quoted"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled";

export interface BookingService {
  id: string;
  booking_id: string;
  service: string;
  description: string | null;
  price: number;
  pricing_type: string;
}

export interface BookingStaff {
  id: string;
  user_id: string;
  full_name: string;
  user_name?: string;
  role: string;
  report_time: string | null;
  status: string;
}

export interface BookingNote {
  id: string;
  user_id: string | null;
  note: string;
  is_internal: boolean;
  created_at: string;
  user_name?: string;
}

export interface BookingEquipment {
  id: string;
  equipment_name: string;
}

export interface BookingInvoiceSummary {
  id: string;
  reference: string;
  total_amount: number;
  amount_paid: number;
  amount_due: number;
  due_date?: string | null;
}

export interface BookingContractSummary {
  reference: string;
  status: string;
  signed_at?: string | null;
}

export interface Booking {
  id: string;
  client_id: string;
  client_name: string;
  client_phone?: string | null;
  reference: string;
  service_type: ServiceType;
  status: BookingStatus;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  venue_name: string | null;
  venue_address: string | null;
  event_type: string | null;
  guest_count: number | null;
  special_requests: string | null;
  created_at: string;
  services?: BookingService[];
  staff?: BookingStaff[];
  equipment?: BookingEquipment[];
  notes?: BookingNote[];
  invoice?: BookingInvoiceSummary | null;
  contract?: BookingContractSummary | null;
}

export interface CreateBookingRequest {
  client_id: string;
  service_type: ServiceType;
  event_date: string;
  start_time?: string;
  end_time?: string;
  venue_name?: string;
  venue_address?: string;
  event_type?: string;
  guest_count?: number;
  special_requests?: string;
  services?: {
    service: string;
    description?: string;
    price: number;
    pricing_type?: string;
  }[];
}

export interface UpdateStatusRequest {
  status: BookingStatus;
  note?: string;
}

// ─── Invoicing ────────────────────────────────────────────────
export type InvoiceStatus = "draft" | "sent" | "partial" | "paid" | "overdue" | "cancelled";
export type PaymentMethod =
  | "momo_mtn"
  | "momo_vodafone"
  | "momo_airteltigo"
  | "bank_transfer"
  | "cash"
  | "paystack"
  | "cheque";

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  booking_service_id: string | null;
}

export interface Invoice {
  id: string;
  client_id: string;
  booking_id: string | null;
  reference: string;
  status: InvoiceStatus;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  amount_due: number;
  issued_at: string | null;
  due_date: string | null;
  client_name?: string | null;
  notes?: string | null;
  created_at: string;
  items?: InvoiceItem[];
}

export interface Payment {
  id: string;
  invoice_id: string;
  reference: string | null;
  amount: number;
  method: PaymentMethod;
  status: string;
  provider_ref: string | null;
  paid_at: string;
  notes: string | null;
  created_at: string;
}

export interface RecordPaymentRequest {
  amount: number;
  method: PaymentMethod;
  paid_at: string;
  provider_ref?: string;
  notes?: string;
}

// ─── Inventory ────────────────────────────────────────────────
export type EquipmentStatus = "available" | "reserved" | "deployed" | "maintenance" | "retired";

export interface InventoryItem {
  id: string;
  name: string;
  sku: string | null;
  category: string;
  unit: string;
  quantity_in_stock: number;
  reorder_level: number;
  unit_cost: number | null;
  unit_price: number | null;
  location: string | null;
  is_active: boolean;
}

export interface InventoryTransaction {
  id: string;
  item_id: string;
  user_id: string;
  booking_id: string | null;
  type: string;
  quantity: number;
  reason: string | null;
  created_at: string;
}

export interface InventoryImportError {
  row: number;
  message: string;
}

export interface InventoryImportResult {
  filename: string;
  imported: number;
  failed: number;
  errors: InventoryImportError[];
  required_columns: string[];
  optional_columns: string[];
}

export interface ShopSale {
  id: string;
  reference: string;
  status: string;
  total_amount: number;
  amount_paid: number;
  payment_method: string | null;
  paid_at: string | null;
  created_at: string | null;
  customer_name: string;
  customer_phone: string | null;
  notes: string | null;
  item_count: number;
}

export interface Equipment {
  id: string;
  name: string;
  category: string;
  serial_number: string | null;
  status: EquipmentStatus;
  condition: string;
  purchase_cost: number | null;
  purchased_at: string | null;
  last_serviced_at: string | null;
  notes: string | null;
  is_active: boolean;
}

// ─── Staff ────────────────────────────────────────────────────
export type EmploymentType = "full_time" | "part_time" | "freelance" | "daily_labour";
export type ShiftStatus = "scheduled" | "confirmed" | "completed" | "no_show" | "cancelled";

export interface StaffProfile {
  id: string;
  user_id: string;
  full_name: string;
  role_title: string;
  employment_type: EmploymentType;
  phone: string | null;
  base_salary: number | null;
  daily_rate: number | null;
  hired_at: string | null;
  is_active: boolean;
}

export interface Shift {
  id: string;
  staff_id: string;
  booking_id: string | null;
  type: string;
  shift_date: string;
  start_time: string;
  end_time: string | null;
  location: string | null;
  status: ShiftStatus;
  notes: string | null;
}

// ─── Reports ─────────────────────────────────────────────────
export interface DashboardSummary {
  bookings_this_month: number;
  upcoming_bookings: number;
  revenue_this_month: number;
  outstanding_invoices: number;
  overdue_invoices: number;
  new_leads_this_month: number;
}

export interface MonthlyPnL {
  month: number;
  month_label: string;
  income: number;
  expenses: number;
  net_profit: number;
  margin_pct: number;
}

export interface PnLReport {
  year: number;
  total_income: number;
  total_expenses: number;
  net_profit: number;
  months: MonthlyPnL[];
}

export interface BookingProfitability {
  booking_reference: string;
  event_date: string;
  income: number;
  expenses: number;
  net_profit: number;
  margin_pct: number;
}

export interface BookingProfitabilitySummary {
  booking_id: string;
  booking_reference: string;
  event_date: string;
  client_name: string;
  income: number;
  expenses: number;
  net_profit: number;
  margin_pct: number;
}

// ─── Contracts ────────────────────────────────────────────────
export type ContractStatus = "draft" | "sent" | "signed" | "expired" | "cancelled";

export interface Contract {
  id: string;
  booking_id: string;
  client_id: string;
  reference: string;
  status: ContractStatus;
  client_name: string;
  client_phone?: string | null;
  event_date: string;
  venue?: string | null;
  total_amount: number;
  deposit_amount: number | null;
  special_terms?: string | null;
  body?: string | null;
  sent_at: string | null;
  signed_at: string | null;
  created_at: string;
}

export interface ContractTemplate {
  id: string;
  name: string;
  service_type: string | null;
  body: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Portal ───────────────────────────────────────────────────
export interface PortalNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  action_url: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface PortalInquiry {
  id: string;
  subject: string;
  service_type: ServiceType | null;
  preferred_date: string | null;
  venue: string | null;
  guest_count: number | null;
  message: string;
  status: string;
  created_at: string;
}


