/** Normalize env so a pasted `=https://...` or trailing slash does not break fetch URLs. */
function resolveApiBase(): string {
  const raw = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").trim();
  const cleaned = raw.replace(/^[=\s]+/, "").replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(cleaned)) {
    console.warn(
      `[api] NEXT_PUBLIC_API_URL must be an absolute URL (got "${raw}"). Falling back to http://localhost:4000`
    );
    return "http://localhost:4000";
  }
  return cleaned;
}

const API_BASE = resolveApiBase();
export { API_BASE };

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public body?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("tpp-auth");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.state?.token ?? null;
  } catch {
    return null;
  }
}

export async function apiUpload<T>(path: string, file: File, fields: Record<string, string> = {}): Promise<T> {
  const body = new FormData();
  body.append("file", file);
  for (const [key, value] of Object.entries(fields)) body.append(key, value);
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { method: "POST", body, headers, cache: "no-store" }).catch(() => {
    throw new ApiError("Unable to reach the server. Check your connection and try again.", 0);
  });
  if (!res.ok) {
    let message = "Upload failed";
    try {
      const parsed = await res.json();
      message = (parsed.error || parsed.message || message) as string;
    } catch { /* ignore */ }
    throw new ApiError(message, res.status);
  }
  return res.json() as Promise<T>;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    cache: "no-store",
    ...options,
    headers,
  }).catch(() => {
    throw new ApiError("Unable to reach the server. Check your connection and try again.", 0);
  });

  if (!res.ok) {
    let message = res.statusText || "Request failed";
    let code: string | undefined;
    let body: Record<string, unknown> | undefined;
    try {
      const parsed = await res.json();
      body = parsed as Record<string, unknown>;
      message = (parsed.error || parsed.message || message) as string;
      code = parsed.code as string | undefined;
      const details = parsed.details;
      if ((!parsed.error && !parsed.message) && details && typeof details === "object") {
        const first = Object.values(details as Record<string, unknown>).flat().find(Boolean);
        if (first) message = String(first);
      }
    } catch {
      /* ignore */
    }
    if (res.status === 401) message = "Your session has expired. Please sign in again.";
    else if (res.status === 403 && !(body?.error || body?.message)) {
      message = "You don't have permission to perform this action.";
    } else if (res.status >= 500 && !(body?.error || body?.message)) {
      message = "Something went wrong on our end. Please try again shortly.";
    }
    throw new ApiError(message, res.status, code, body);
  }

  return res.json() as Promise<T>;
}

/** Authenticated binary fetch (PDF downloads). */
export async function apiFetchBlob(path: string): Promise<Blob> {
  const token = getToken();
  const headers: HeadersInit = {};
  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { headers }).catch(() => {
    throw new ApiError("Unable to reach the server. Check your connection and try again.", 0);
  });

  if (!res.ok) {
    let message = res.statusText || "Request failed";
    try {
      const body = await res.json();
      message = body.error || body.message || message;
    } catch {
      /* ignore */
    }
    if (res.status === 401) message = "Your session has expired. Please sign in again.";
    throw new ApiError(message, res.status);
  }

  return res.blob();
}

export async function checkApiHealth(): Promise<boolean> {
  try {
    await apiFetch<{ status: string }>("/api/health");
    return true;
  } catch {
    return false;
  }
}

export const api = {
  login: (email: string, password: string) =>
    apiFetch<{ user: ApiUser; token: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  forgotPassword: (email: string) =>
    apiFetch<{ ok: boolean; resetToken?: string; tempPassword?: string; emailed?: boolean; message?: string }>(
      "/api/auth/forgot-password",
      { method: "POST", body: JSON.stringify({ email }) }
    ),

  resetPassword: (email: string, token: string, newPassword: string) =>
    apiFetch<{ ok: boolean }>("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ email, token, newPassword }),
    }),

  registerAgent: (body: AgentRegistrationBody) =>
    apiFetch<{
      ok: boolean;
      status: string;
      message: string;
      registrationId?: string;
      user?: { id: string; name: string; email: string; status: string; agencyId?: string | null };
      token?: string;
    }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getAgentRegistrations: (params?: { status?: string }) => {
    const q = params?.status ? `?status=${encodeURIComponent(params.status)}` : "";
    return apiFetch<{ registrations: AgentRegistrationRow[]; total: number }>(`/api/agent-registrations${q}`);
  },

  getAgentRegistration: (id: string) =>
    apiFetch<{ registration: AgentRegistrationRow }>(`/api/agent-registrations/${id}`),

  approveAgentRegistration: (id: string, body?: { comment?: string }) =>
    apiFetch<{ registration: AgentRegistrationRow; alreadyApproved?: boolean }>(
      `/api/agent-registrations/${id}/approve`,
      { method: "POST", body: JSON.stringify(body || {}) },
    ),

  rejectAgentRegistration: (id: string, body: { reason: string; comment?: string }) =>
    apiFetch<{ registration: AgentRegistrationRow }>(`/api/agent-registrations/${id}/reject`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  downloadAgencyGstProof: (agencyId: string) => apiFetchBlob(`/api/agencies/${agencyId}/gst-proof`),

  getBookings: (params?: Record<string, string>) => {
    const q = params ? `?${new URLSearchParams(params)}` : "";
    return apiFetch<{ bookings: ApiBooking[]; total: number }>(`/api/bookings${q}`);
  },

  createBooking: (body: Record<string, unknown>) =>
    apiFetch<{ booking: ApiBooking }>("/api/bookings", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateBooking: (id: string, body: Record<string, unknown>) =>
    apiFetch<{ booking: ApiBooking }>(`/api/bookings/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  proceedToBooking: (quotationId: string, body?: Record<string, unknown>) =>
    apiFetch<{ booking: ApiBooking; idempotent?: boolean }>(`/api/quotations/${quotationId}/proceed-to-booking`, {
      method: "POST",
      body: JSON.stringify(body || {}),
    }),

  getBookingFull: (id: string) =>
    apiFetch<{
      booking: ApiBooking;
      tasks: unknown[];
      audits: unknown[];
      source?: {
        quotationId?: string | null;
        quoteNo?: string | null;
        quotationVersionNumber?: number | null;
        quotation?: {
          quoteNo?: string;
          status?: string;
          currentVersion?: number;
          acceptedVersionNumber?: number | null;
          validTill?: string | null;
          destination?: string | null;
        } | null;
      };
      completeness?: {
        passengers: number;
        adults: number;
        children: number;
        infants: number;
        servicesByType: Record<string, number>;
        documents: number;
        hasItinerary: boolean;
        hasTerms: boolean;
        pricingLocked: boolean;
      };
    }>(`/api/bookings/${id}/full`),

  acceptBookingPolicies: (id: string) =>
    apiFetch<{ booking: ApiBooking }>(`/api/bookings/${id}/accept-policies`, { method: "POST", body: "{}" }),

  saveBookingPassengers: (id: string, passengers: unknown[]) =>
    apiFetch<{ booking: ApiBooking }>(`/api/bookings/${id}/passengers`, {
      method: "PUT",
      body: JSON.stringify({ passengers }),
    }),

  verifyPassengerPan: (bookingId: string, passengerId: string, body: Record<string, unknown>) =>
    apiFetch<{ passenger: unknown; verification: { ok: boolean; status: string; message: string } }>(
      `/api/bookings/${bookingId}/passengers/${passengerId}/verify-pan`,
      { method: "POST", body: JSON.stringify(body) },
    ),

  uploadBookingDocument: (id: string, file: File, fields: Record<string, string>) =>
    apiUpload<{ document: { id: string; fileName: string; docType: string; downloadPath: string } }>(`/api/bookings/${id}/documents`, file, fields),
  uploadQuotationDocument: (id: string, file: File, fields: Record<string, string>) =>
    apiUpload<{ document: { id: string; fileName: string; docType: string; downloadPath: string } }>(
      `/api/quotations/${id}/documents`,
      file,
      fields,
    ),
  listQuotationDocuments: (id: string) =>
    apiFetch<{ documents: Array<{ id: string; fileName: string; docType: string; downloadPath?: string }> }>(
      `/api/quotations/${id}/documents`,
    ),
  uploadGstProof: (file: File) =>
    apiUpload<{ gstProofId: string }>("/api/auth/register/gst-proof", file),

  createPaymentRequest: (bookingId: string, body: Record<string, unknown>) =>
    apiFetch<{ paymentRequest: unknown }>(`/api/bookings/${bookingId}/payment-requests`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  payPaymentRequest: (id: string, body: Record<string, unknown>) =>
    apiFetch<{ paymentRequest: unknown; booking: ApiBooking }>(`/api/payment-requests/${id}/pay`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateBookingService: (bookingId: string, serviceId: string, body: Record<string, unknown>) =>
    apiFetch<{ service: unknown }>(`/api/bookings/${bookingId}/services/${serviceId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  requestSellingPriceIncrease: (bookingId: string, body: Record<string, unknown>) =>
    apiFetch<{ approval: CostDeviationApproval }>(`/api/bookings/${bookingId}/request-selling-price-increase`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  approveCostDeviation: (id: string, body?: Record<string, unknown>) =>
    apiFetch<{ approval: CostDeviationApproval; booking?: ApiBooking }>(`/api/cost-deviations/${id}/approve`, {
      method: "POST",
      body: JSON.stringify(body || {}),
    }),

  rejectCostDeviation: (id: string, body?: Record<string, unknown>) =>
    apiFetch<{ approval: CostDeviationApproval }>(`/api/cost-deviations/${id}/reject`, {
      method: "POST",
      body: JSON.stringify(body || {}),
    }),

  listCostDeviations: (status = "Pending") =>
    apiFetch<{ approvals: CostDeviationApproval[] }>(`/api/cost-deviations?status=${encodeURIComponent(status)}`),

  createBookingInvoice: (bookingId: string, body: Record<string, unknown>) =>
    apiFetch<{ invoice: unknown }>(`/api/bookings/${bookingId}/invoices`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  createBookingAddOn: (bookingId: string, body: Record<string, unknown>) =>
    apiFetch<{ addOn: unknown; booking: ApiBooking }>(`/api/bookings/${bookingId}/add-ons`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  createChangeRequest: (bookingId: string, body: Record<string, unknown>) =>
    apiFetch<{ changeRequest: unknown }>(`/api/bookings/${bookingId}/change-requests`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateChangeRequest: (id: string, body: Record<string, unknown>) =>
    apiFetch<{ changeRequest: unknown }>(`/api/change-requests/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  createSupplierPayout: (body: Record<string, unknown>) =>
    apiFetch<{ payout: SupplierPayoutRecord }>("/api/supplier-payouts", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateSupplierPayout: (id: string, body: Record<string, unknown>) =>
    apiFetch<{ payout: SupplierPayoutRecord }>(`/api/supplier-payouts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  getSupplierPayouts: (status?: string) =>
    apiFetch<{ payouts: SupplierPayoutRecord[] }>(
      `/api/supplier-payouts${status ? `?status=${encodeURIComponent(status)}` : ""}`,
    ),

  saveBookingTravelDetails: (bookingId: string, travelDetails: Record<string, unknown>) =>
    apiFetch<{ booking: ApiBooking; travelComplete: boolean; missing: string[] }>(
      `/api/bookings/${bookingId}/travel-details`,
      { method: "PUT", body: JSON.stringify({ travelDetails }) },
    ),

  saveBookingItinerary: (bookingId: string, itinerary: unknown[]) =>
    apiFetch<{ booking: ApiBooking }>(`/api/bookings/${bookingId}/itinerary`, {
      method: "PUT",
      body: JSON.stringify({ itinerary }),
    }),

  getAgents: () =>
    apiFetch<{ agents: ApiAgent[] }>("/api/agents"),

  getSalesExecutives: () =>
    apiFetch<{
      salesExecutives: Array<{
        id: string;
        name: string;
        email: string;
        phone?: string | null;
        role: string;
        status?: string;
      }>;
    }>("/api/sales-executives"),

  updateAgentProductAccess: (id: string, body: Record<string, unknown>) =>
    apiFetch<{ agent: ApiAgent }>(`/api/agents/${id}/product-access`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  adjustBookingSellingPrice: (bookingId: string, body: Record<string, unknown>) =>
    apiFetch<{ booking: ApiBooking }>(`/api/bookings/${bookingId}/adjust-selling-price`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  requestQuotationHelp: (quotationId: string, body: Record<string, unknown>) =>
    apiFetch<{ task: unknown }>(`/api/quotations/${quotationId}/request-help`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getSuppliers: (params?: Record<string, string>) => {
    const q = params ? `?${new URLSearchParams(params)}` : "";
    return apiFetch<{ suppliers: import("@/types").SupplierRecord[]; total: number }>(`/api/suppliers${q}`);
  },

  getSupplier: (id: string) =>
    apiFetch<{ supplier: import("@/types").SupplierRecord }>(`/api/suppliers/${id}`),

  createSupplier: (body: Record<string, unknown>) =>
    apiFetch<{ supplier: import("@/types").SupplierRecord }>("/api/suppliers", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateSupplier: (id: string, body: Record<string, unknown>) =>
    apiFetch<{ supplier: import("@/types").SupplierRecord }>(`/api/suppliers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  deleteSupplier: (id: string) =>
    apiFetch<{ success: boolean; deactivated?: boolean; message?: string }>(`/api/suppliers/${id}`, {
      method: "DELETE",
    }),

  createBookingModification: (bookingId: string, body: Record<string, unknown>) =>
    apiFetch<{ modification: unknown; booking: ApiBooking }>(`/api/bookings/${bookingId}/modifications`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  markBookingDocumentsReady: (id: string) =>
    apiFetch<{ booking: ApiBooking }>(`/api/bookings/${id}/mark-documents-ready`, { method: "POST", body: "{}" }),

  completeBooking: (id: string) =>
    apiFetch<{ booking: ApiBooking }>(`/api/bookings/${id}/complete`, { method: "POST", body: "{}" }),

  getBmsReports: () => apiFetch<Record<string, unknown>>("/api/bms/reports"),

  getCustomers: () => apiFetch<{ customers: ApiCustomer[]; total: number }>("/api/customers"),

  createCustomer: (body: Record<string, unknown>) =>
    apiFetch<{ customer: ApiCustomer }>("/api/customers", { method: "POST", body: JSON.stringify(body) }),

  getAgencies: () => apiFetch<{ agencies: ApiAgency[]; total: number }>("/api/agencies"),

  getBranches: (agencyId?: string) => {
    const q = agencyId ? `?agencyId=${agencyId}` : "";
    return apiFetch<{ branches: ApiBranch[]; total: number }>(`/api/branches${q}`);
  },

  getEmployees: (agencyId?: string) => {
    const q = agencyId ? `?agencyId=${agencyId}` : "";
    return apiFetch<{ employees: ApiEmployee[]; total: number }>(`/api/employees${q}`);
  },

  createEmployee: (body: Record<string, unknown>) =>
    apiFetch<{ employee: ApiEmployee; tempPassword?: string }>("/api/employees", { method: "POST", body: JSON.stringify(body) }),

  getTasks: () => apiFetch<{ tasks: ApiTask[]; total: number }>("/api/tasks"),

  createTask: (body: Record<string, unknown>) =>
    apiFetch<{ task: ApiTask }>("/api/tasks", { method: "POST", body: JSON.stringify(body) }),

  updateTask: (id: string, body: Record<string, unknown>) =>
    apiFetch<{ task: ApiTask }>(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  getAuditLogs: () => apiFetch<{ logs: ApiAuditLog[]; total: number }>("/api/audit-logs"),

  getReports: () =>
    apiFetch<{
      summary: { totalRevenue: number; totalCommission: number; totalBookings: number; confirmedBookings: number; successPayments: number };
      byService: { service: string; bookings: number; revenue: number }[];
      byPaymentMethod: { method: string; count: number }[];
    }>("/api/reports"),

  searchFlights: (origin: string, destination: string, count = 8, departureDate?: string) => {
    const qs = new URLSearchParams({
      origin,
      destination,
      count: String(count),
    });
    if (departureDate) qs.set("departureDate", departureDate);
    return apiFetch<{ flights: ApiFlight[]; provider?: string; source?: string }>(`/api/flights/search?${qs}`);
  },

  searchHotels: (city: string, count = 8, checkIn?: string, checkOut?: string) => {
    const qs = new URLSearchParams({
      city,
      count: String(count),
    });
    if (checkIn) qs.set("checkIn", checkIn);
    if (checkOut) qs.set("checkOut", checkOut);
    return apiFetch<{ hotels: ApiHotel[]; provider?: string; source?: string }>(`/api/hotels/search?${qs}`);
  },

  createItineraryProposal: (body: Record<string, unknown>) =>
    apiFetch<{ item: import("@/types").TravelProposalRecord; snapshot: import("@/types").ProposalSnapshotData }>(
      "/api/travel-proposals/from-itinerary",
      { method: "POST", body: JSON.stringify(body) }
    ),

  patchProposalItinerary: (id: string, body: Record<string, unknown>) =>
    apiFetch<{ item: import("@/types").TravelProposalRecord; snapshot: import("@/types").ProposalSnapshotData }>(
      `/api/travel-proposals/${id}/itinerary`,
      { method: "PATCH", body: JSON.stringify(body) }
    ),

  shareProposal: (id: string, body: Record<string, unknown>) =>
    apiFetch<{ share: unknown; link: string; emailed?: boolean; mailto?: string; whatsappUrl?: string; note?: string }>(
      `/api/travel-proposals/${id}/share`,
      { method: "POST", body: JSON.stringify(body) }
    ),

  listMealProducts: (params?: Record<string, string>) => {
    const qs = new URLSearchParams(params || {});
    return apiFetch<{ items: Record<string, unknown>[]; total: number }>(`/api/products/meals?${qs}`);
  },

  walletTransaction: (body: Record<string, unknown>) =>
    apiFetch<{ balance: number; transaction: ApiWalletTxn }>("/api/wallet", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getNotifications: () => apiFetch<{ notifications: ApiNotification[] }>("/api/notifications"),

  markNotificationRead: (id: string) =>
    apiFetch<{ notification: ApiNotification }>(`/api/notifications/${id}/read`, { method: "PATCH" }),

  markAllNotificationsRead: () =>
    apiFetch<{ updated: number }>("/api/notifications/read-all", { method: "PATCH" }),

  getWallet: (agencyId?: string) => {
    const qs = agencyId ? `?agencyId=${encodeURIComponent(agencyId)}` : "";
    return apiFetch<{
      balance: number;
      agencyId?: string;
      agencyName?: string;
      transactions: ApiWalletTxn[];
    }>(`/api/wallet${qs}`);
  },

  getDashboard: () => apiFetch<{
    stats: { bookings: number; agencies: number; customers: number; leads: number; payments: number; packages?: number };
    destinationInsights?: {
      topDestinations: Array<{
        id: string; name: string; country: string; thumbnail?: string | null;
        productCount: number; hotelCount: number; activityCount: number; transferCount: number;
      }>;
      productsPerDestination: Array<{
        id: string; name: string; country: string; thumbnail?: string | null;
        productCount: number; hotelCount: number; activityCount: number; transferCount: number;
      }>;
    };
    packageInsights?: {
      totalPackages: number;
      featuredPackages: Array<{
        id: string; packageName: string; packageCode: string; heroImage?: string | null;
        finalPrice: number; currency: string; durationDays: number; durationNights: number;
        destination?: { name: string };
      }>;
      topSellingPackages: Array<{
        id: string; packageName: string; packageCode: string; heroImage?: string | null;
        finalPrice: number; currency: string; durationDays: number;
        destination?: { name: string }; componentCount: number;
      }>;
    };
  }>("/api/dashboard"),

  getLeads: () => apiFetch<{ leads: ApiLead[]; total: number }>("/api/leads"),

  createLead: (body: Record<string, unknown>) =>
    apiFetch<{ lead: ApiLead }>("/api/leads", { method: "POST", body: JSON.stringify(body) }),

  updateLeadStage: (id: string, stage: string) =>
    apiFetch<{ lead: ApiLead }>(`/api/leads/${id}`, { method: "PATCH", body: JSON.stringify({ stage }) }),

  getQuotations: () => apiFetch<{ quotations: ApiQuotation[]; total: number }>("/api/quotations"),

  getQuotationsManage: (params?: Record<string, string>) => {
    const q = params ? `?${new URLSearchParams(params)}` : "";
    return apiFetch<{ quotations: ApiQuotation[]; total: number; page: number; pageSize: number }>(`/api/quotations/manage${q}`);
  },

  getQuotationAnalytics: () => apiFetch<Record<string, number | Record<string, number> | undefined>>("/api/quotations/analytics"),

  generateQuotationPdf: (id: string, mode: "customer" | "preview" = "customer") =>
    apiFetch<{
      document: { id: string; fileName: string; downloadPath: string; sizeBytes: number; visibility: string };
      pageCount: number;
      packageCount: number;
      mode: string;
      quoteId: string;
      quoteNo: string;
    }>(`/api/quotations/${id}/pdf`, { method: "POST", body: JSON.stringify({ mode }) }),

  getQuotationFull: (id: string) => apiFetch<{ quotation: ApiQuotation }>(`/api/quotations/${id}/full`),

  createQuotationWizard: (body: Record<string, unknown>) =>
    apiFetch<{ quotation: ApiQuotation }>("/api/quotations/wizard", { method: "POST", body: JSON.stringify(body) }),

  applyQuotationTemplate: (id: string, body: { templateId: string; mode?: "fill-empty" | "merge-append"; packageIndex?: number }) =>
    apiFetch<{ quotation: ApiQuotation; appliedFields: string[]; message?: string }>(`/api/quotations/${id}/apply-template`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  assignQuotationAgent: (id: string, body: { agentId: string | null }) =>
    apiFetch<{ quotation: ApiQuotation }>(`/api/quotations/${id}/assign-agent`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  assignBookingExecutives: (id: string, body: Record<string, unknown>) =>
    apiFetch<{ booking: ApiBooking }>(`/api/bookings/${id}/assignees`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  getOpsQueue: (params?: { mine?: boolean; unassigned?: boolean }) => {
    const q = new URLSearchParams();
    if (params?.mine) q.set("mine", "1");
    if (params?.unassigned) q.set("unassigned", "1");
    const qs = q.toString();
    return apiFetch<{ bookings: ApiBooking[]; total: number }>(`/api/bookings/ops-queue${qs ? `?${qs}` : ""}`);
  },

  getShifts: () => apiFetch<{ shifts: ApiShift[] }>("/api/shifts"),
  createShift: (body: Record<string, unknown>) =>
    apiFetch<{ shift: ApiShift }>("/api/shifts", { method: "POST", body: JSON.stringify(body) }),
  updateShift: (id: string, body: Record<string, unknown>) =>
    apiFetch<{ shift: ApiShift }>(`/api/shifts/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  getPayroll: (period?: string) => {
    const qs = period ? `?period=${encodeURIComponent(period)}` : "";
    return apiFetch<{ entries: ApiPayrollEntry[] }>(`/api/payroll${qs}`);
  },
  createPayrollEntry: (body: Record<string, unknown>) =>
    apiFetch<{ entry: ApiPayrollEntry }>("/api/payroll", { method: "POST", body: JSON.stringify(body) }),
  updatePayrollEntry: (id: string, body: Record<string, unknown>) =>
    apiFetch<{ entry: ApiPayrollEntry }>(`/api/payroll/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  saveQuotationWizard: (id: string, body: Record<string, unknown>) =>
    apiFetch<{ quotation: ApiQuotation }>(`/api/quotations/${id}/wizard`, { method: "PUT", body: JSON.stringify(body) }),

  setQuotationStatus: (id: string, status: string, body?: Record<string, unknown>) =>
    apiFetch<{ quotation: ApiQuotation }>(`/api/quotations/${id}/status`, {
      method: "POST",
      body: JSON.stringify({ status, ...body }),
    }),

  submitQuotationApproval: (id: string, body?: Record<string, unknown>) =>
    apiFetch<{ quotation: ApiQuotation }>(`/api/quotations/${id}/submit-approval`, {
      method: "POST",
      body: JSON.stringify(body || {}),
    }),

  approveQuotation: (id: string, body?: Record<string, unknown>) =>
    apiFetch<{ quotation: ApiQuotation; readyToSend?: boolean; message?: string }>(`/api/quotations/${id}/approve`, {
      method: "POST",
      body: JSON.stringify(body || { stage: "Team Lead" }),
    }),

  rejectQuotationApproval: (id: string, body?: Record<string, unknown>) =>
    apiFetch<{ quotation: ApiQuotation }>(`/api/quotations/${id}/reject-approval`, {
      method: "POST",
      body: JSON.stringify(body || {}),
    }),

  acceptQuotation: (id: string, body?: Record<string, unknown>) =>
    apiFetch<{ quotation: ApiQuotation }>(`/api/quotations/${id}/accept`, {
      method: "POST",
      body: JSON.stringify(body || {}),
    }),

  rejectQuotation: (id: string, body?: Record<string, unknown>) =>
    apiFetch<{ quotation: ApiQuotation }>(`/api/quotations/${id}/reject`, {
      method: "POST",
      body: JSON.stringify(body || {}),
    }),

  requestQuotationRevision: (id: string, body?: Record<string, unknown>) =>
    apiFetch<{ quotation: ApiQuotation }>(`/api/quotations/${id}/request-revision`, {
      method: "POST",
      body: JSON.stringify(body || {}),
    }),

  duplicateQuotation: (id: string) =>
    apiFetch<{ quotation: ApiQuotation }>(`/api/quotations/${id}/duplicate`, { method: "POST", body: "{}" }),

  archiveQuotation: (id: string) =>
    apiFetch<{ quotation: ApiQuotation }>(`/api/quotations/${id}/archive`, { method: "POST", body: "{}" }),

  deleteQuotationDraft: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/quotations/${id}/draft`, { method: "DELETE" }),

  extendQuotation: (id: string, validTill: string) =>
    apiFetch<{ quotation: ApiQuotation }>(`/api/quotations/${id}/extend`, {
      method: "POST",
      body: JSON.stringify({ validTill }),
    }),

  shareQuotation: (id: string, body: Record<string, unknown>) =>
    apiFetch<{ share: unknown; link: string; note: string }>(
      `/api/quotations/${id}/share`,
      { method: "POST", body: JSON.stringify(body) },
    ),

  emailQuotation: (id: string, body?: { recipient?: string; message?: string; appOrigin?: string }) =>
    apiFetch<{
      ok: boolean;
      configured?: boolean;
      error?: string;
      delivery: {
        id: string;
        channel: string;
        status: string;
        recipient?: string | null;
        provider?: string | null;
        documentId?: string | null;
        attachmentName?: string | null;
        packageCount?: number | null;
        deliveredAt?: string | null;
        failureReason?: string | null;
      };
      document: { id: string; fileName: string; mimeType: string; sizeBytes: number; visibility: string };
      quoteId: string;
      quoteNo: string;
    }>(`/api/quotations/${id}/email`, { method: "POST", body: JSON.stringify(body || {}) }),

  whatsappQuotation: (id: string, body?: { recipient?: string; message?: string; appOrigin?: string }) =>
    apiFetch<{
      ok: boolean;
      configured?: boolean;
      error?: string;
      delivery: {
        id: string;
        channel: string;
        status: string;
        recipient?: string | null;
        provider?: string | null;
        documentId?: string | null;
        attachmentName?: string | null;
        packageCount?: number | null;
        deliveredAt?: string | null;
        failureReason?: string | null;
      };
      document: { id: string; fileName: string; mimeType: string; sizeBytes: number; visibility: string };
      quoteId: string;
      quoteNo: string;
    }>(`/api/quotations/${id}/whatsapp`, { method: "POST", body: JSON.stringify(body || {}) }),

  createQuotationCustomerLink: (id: string, body?: { appOrigin?: string }) =>
    apiFetch<{
      accessId: string;
      versionNumber: number;
      expiresAt: string | null;
      url: string | null;
      token: string;
    }>(`/api/quotations/${id}/customer-link`, {
      method: "POST",
      body: JSON.stringify({ appOrigin: typeof window !== "undefined" ? window.location.origin : body?.appOrigin, ...body }),
    }),

  revokeQuotationCustomerLinks: (id: string) =>
    apiFetch<{ revoked: number }>(`/api/quotations/${id}/customer-link/revoke`, { method: "POST", body: "{}" }),

  getQuotationCustomerResponses: (id: string) =>
    apiFetch<{
      responses: Array<{
        id: string;
        versionNumber: number;
        responseType: string;
        comment?: string | null;
        customerName?: string | null;
        customerEmail?: string | null;
        selectedPackageId?: string | null;
        createdAt: string;
      }>;
      acceptedVersionNumber?: number | null;
      currentVersion: number;
    }>(`/api/quotations/${id}/customer-responses`),

  /** Public customer response API — no auth header required. */
  getCustomerQuotationByToken: (token: string) =>
    apiFetch<{
      quotation: Record<string, unknown>;
      access: { versionNumber: number; expiresAt?: string | null };
    }>(`/api/customer/quotations/${encodeURIComponent(token)}`),

  acceptCustomerQuotation: (token: string, body?: Record<string, unknown>) =>
    apiFetch<{ ok: boolean; idempotent?: boolean; quotation: Record<string, unknown>; response?: Record<string, unknown> }>(
      `/api/customer/quotations/${encodeURIComponent(token)}/accept`,
      { method: "POST", body: JSON.stringify(body || {}) },
    ),

  rejectCustomerQuotation: (token: string, body?: Record<string, unknown>) =>
    apiFetch<{ ok: boolean; idempotent?: boolean; quotation: Record<string, unknown>; response?: Record<string, unknown> }>(
      `/api/customer/quotations/${encodeURIComponent(token)}/reject`,
      { method: "POST", body: JSON.stringify(body || {}) },
    ),

  requestCustomerQuotationRevision: (token: string, body?: Record<string, unknown>) =>
    apiFetch<{ ok: boolean; idempotent?: boolean; quotation: Record<string, unknown>; response?: Record<string, unknown> }>(
      `/api/customer/quotations/${encodeURIComponent(token)}/revision-request`,
      { method: "POST", body: JSON.stringify(body || {}) },
    ),

  createQuotationVersion: (id: string, body?: Record<string, unknown>) =>
    apiFetch<{ version: unknown }>(`/api/quotations/${id}/versions`, {
      method: "POST",
      body: JSON.stringify(body || {}),
    }),

  getQuotationVersions: (id: string) =>
    apiFetch<{
      versions: Array<{
        id: string;
        versionNumber: number;
        changeSummary?: string | null;
        reason?: string | null;
        createdAt: string;
        createdByName?: string | null;
        status?: string | null;
        destination?: string | null;
        total?: number | null;
        packageCount?: number;
      }>;
      currentVersion: number;
    }>(`/api/quotations/${id}/versions`),

  getQuotationVersion: (id: string, versionNumber: number) =>
    apiFetch<{
      version: {
        id: string;
        versionNumber: number;
        changeSummary?: string | null;
        reason?: string | null;
        createdByName?: string | null;
        createdAt: string;
        readOnly: boolean;
        snapshot: Record<string, unknown>;
      };
      currentVersion: number;
    }>(`/api/quotations/${id}/versions/${versionNumber}`),

  restoreQuotationVersion: (id: string, versionId: string) =>
    apiFetch<{ quotation: ApiQuotation }>(`/api/quotations/${id}/versions/${versionId}/restore`, {
      method: "POST",
      body: "{}",
    }),

  createQuotation: (body: Record<string, unknown>) =>
    apiFetch<{ quotation: ApiQuotation }>("/api/quotations", { method: "POST", body: JSON.stringify(body) }),

  getEmployeeActivity: () =>
    apiFetch<{
      activity: Array<{
        id: string;
        userId: string;
        date: string;
        loginAt?: string | null;
        logoutAt?: string | null;
        workingMinutes: number;
        customersAdded: number;
        quotationsCreated: number;
        productsAdded?: number;
        productsUpdated: number;
        revenueGenerated: number;
        lastActivity?: string | null;
        ipAddress?: string | null;
        deviceUsed?: string | null;
      }>;
      total: number;
    }>("/api/employees/activity"),

  getPayments: () => apiFetch<{ payments: ApiPayment[]; total: number }>("/api/payments"),

  createPayment: (body: Record<string, unknown>) =>
    apiFetch<{ payment: ApiPayment }>("/api/payments", { method: "POST", body: JSON.stringify(body) }),

  getMe: () => apiFetch<{ user: ApiUser }>("/api/auth/me"),

  updateQuotation: (id: string, body: Record<string, unknown>) =>
    apiFetch<{ quotation: ApiQuotation }>(`/api/quotations/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  updateCustomer: (id: string, body: Record<string, unknown>) =>
    apiFetch<{ customer: ApiCustomer }>(`/api/customers/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  deleteCustomer: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/customers/${id}`, { method: "DELETE" }),

  deleteBooking: (id: string) =>
    apiFetch<{ booking: ApiBooking }>(`/api/bookings/${id}`, { method: "DELETE" }),

  deleteTask: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/tasks/${id}`, { method: "DELETE" }),

  updateEmployee: (id: string, body: Record<string, unknown>) =>
    apiFetch<{ employee: ApiEmployee }>(`/api/employees/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  createBranch: (body: Record<string, unknown>) =>
    apiFetch<{ branch: ApiBranch }>("/api/branches", { method: "POST", body: JSON.stringify(body) }),

  updateBranch: (id: string, body: Record<string, unknown>) =>
    apiFetch<{ branch: ApiBranch }>(`/api/branches/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  createAgency: (body: Record<string, unknown>) =>
    apiFetch<{ agency: ApiAgency; tempPassword?: string }>("/api/agencies", { method: "POST", body: JSON.stringify(body) }),

  updateAgency: (id: string, body: Record<string, unknown>) =>
    apiFetch<{ agency: ApiAgency }>(`/api/agencies/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  getCommission: () =>
    apiFetch<ApiCommissionResponse>("/api/commission"),

  getFinance: () =>
    apiFetch<ApiFinanceResponse>("/api/finance"),

  createExpense: (body: Record<string, unknown>) =>
    apiFetch<{ expense: unknown }>("/api/finance/expenses", { method: "POST", body: JSON.stringify(body) }),

  deleteExpense: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/finance/expenses/${id}`, { method: "DELETE" }),

  createTds: (body: Record<string, unknown>) =>
    apiFetch<{ tds: unknown }>("/api/finance/tds", { method: "POST", body: JSON.stringify(body) }),

  updateTds: (id: string, body: Record<string, unknown>) =>
    apiFetch<{ tds: unknown }>(`/api/finance/tds/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  getCompanySettings: () => apiFetch<Record<string, string>>("/api/settings/company"),

  updateCompanySettings: (body: Record<string, unknown>) =>
    apiFetch<{ ok: boolean }>("/api/settings/company", { method: "PUT", body: JSON.stringify(body) }),

  saveCommissionRules: (rules: unknown) =>
    apiFetch<{ ok: boolean }>("/api/commission/rules", { method: "PUT", body: JSON.stringify({ rules }) }),

  postSupportMessage: (ticketId: string, body: { message: string; isInternal?: boolean }) =>
    apiFetch<{ message: unknown }>(`/api/support/tickets/${ticketId}/messages`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getAnalyticsPlatform: (range: "monthly" | "yearly") =>
    apiFetch<ApiPlatformAnalytics>(`/api/analytics/platform?range=${range}`),

  getAnalyticsEmployees: (range: "monthly" | "yearly") =>
    apiFetch<ApiEmployeeAnalytics>(`/api/analytics/employees?range=${range}`),

  createRazorpayOrder: (amount: number) =>
    apiFetch<{
      configured: boolean;
      demoAllowed?: boolean;
      orderId?: string;
      amount?: number;
      currency?: string;
      keyId?: string;
    }>("/api/payments/razorpay/order", { method: "POST", body: JSON.stringify({ amount }) }),

  verifyRazorpayPayment: (orderId: string, paymentId: string, signature: string) =>
    apiFetch<{ verified: boolean }>("/api/payments/razorpay/verify", {
      method: "POST",
      body: JSON.stringify({ orderId, paymentId, signature }),
    }),

  // Phase 3 Endpoints

  getMarketingCampaigns: () => apiFetch<{ campaigns: any[] }>("/api/marketing/campaigns"),
  createMarketingCampaign: (body: any) => apiFetch<any>("/api/marketing/campaigns", { method: "POST", body: JSON.stringify(body) }),

  getCoupons: (params?: { status?: string; q?: string }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.q) q.set("q", params.q);
    const qs = q.toString();
    return apiFetch<{ coupons: CouponApi[] }>(`/api/marketing/coupons${qs ? `?${qs}` : ""}`);
  },
  createCoupon: (body: CouponWriteBody) =>
    apiFetch<{ coupon: CouponApi }>("/api/marketing/coupons", { method: "POST", body: JSON.stringify(body) }),
  updateCoupon: (id: string, body: Partial<CouponWriteBody> & { status?: string }) =>
    apiFetch<{ coupon: CouponApi }>(`/api/marketing/coupons/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteCoupon: (id: string) => apiFetch<{ ok: boolean }>(`/api/marketing/coupons/${id}`, { method: "DELETE" }),
  validateCoupon: (body: { code: string; orderAmount: number; agencyId?: string }) =>
    apiFetch<{ valid: boolean; discountAmount: number; coupon: CouponApi; error?: string }>(
      "/api/marketing/coupons/validate",
      { method: "POST", body: JSON.stringify(body) }
    ),

  getTaxRules: () =>
    apiFetch<{
      rules: Array<{
        id: string;
        name: string;
        rate: number;
        method: string;
        active: boolean;
        effectiveFrom?: string | null;
        effectiveTo?: string | null;
      }>;
    }>("/api/tax-rules"),

  getSupportTickets: (params?: { operationsType?: string; deliveryType?: string; department?: string; status?: string }) => {
    const q = new URLSearchParams();
    if (params?.operationsType) q.set("operationsType", params.operationsType);
    if (params?.deliveryType) q.set("deliveryType", params.deliveryType);
    if (params?.department) q.set("department", params.department);
    if (params?.status) q.set("status", params.status);
    const qs = q.toString();
    return apiFetch<{ tickets: SupportTicketApi[] }>(`/api/support/tickets${qs ? `?${qs}` : ""}`);
  },
  createSupportTicket: (body: CreateSupportTicketBody) =>
    apiFetch<{ ticket: SupportTicketApi }>("/api/support/tickets", { method: "POST", body: JSON.stringify(body) }),
  updateSupportTicket: (id: string, body: Partial<{ status: string; assignedTo: string; priority: string; deliveryType: string; scheduledAt: string | null }>) =>
    apiFetch<{ ticket: SupportTicketApi }>(`/api/support/tickets/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  getSettings: () => apiFetch<any>("/api/settings"),
  updateSettings: (body: any) => apiFetch<any>("/api/settings", { method: "PUT", body: JSON.stringify(body) }),

  getMonitoringMetrics: () => apiFetch<any>("/api/monitoring/metrics"),

  checkIn: () => apiFetch<{ attendance: ApiAttendance }>("/api/attendance/check-in", { method: "POST", body: "{}" }),
  checkOut: () => apiFetch<{ attendance: ApiAttendance }>("/api/attendance/check-out", { method: "POST", body: "{}" }),
  getAttendance: (userId?: string) => {
    const q = userId ? `?userId=${userId}` : "";
    return apiFetch<{ attendance: ApiAttendance[]; total: number }>(`/api/attendance${q}`);
  },

  getLeaves: () => apiFetch<{ leaves: ApiLeave[]; total: number }>("/api/leaves"),
  createLeave: (body: Record<string, unknown>) =>
    apiFetch<{ leave: ApiLeave }>("/api/leaves", { method: "POST", body: JSON.stringify(body) }),
  updateLeaveStatus: (id: string, status: "Approved" | "Rejected") =>
    apiFetch<{ leave: ApiLeave }>(`/api/leaves/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
};


export interface AgentRegistrationBody {
  fullName: string;
  companyName: string;
  address: string;
  email: string;
  countryCode: string;
  phone: string;
  country: string;
  countryCodeIso?: string;
  state: string;
  city: string;
  panNumber?: string;
  passportNumber: string;
  password: string;
  confirmPassword: string;
  gstNumber?: string;
  gstProofId?: string;
  termsAccepted: true;
  termsVersion?: string;
}

export interface ApiUser {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: string;
  designation?: string | null;
  agencyId?: string | null;
  branchId?: string | null;
  agentCode?: string | null;
  permissions?: string[] | null;
  productAccess?: { flights: boolean; hotels: boolean; packages: boolean } | null;
  agency?: { id?: string; name?: string; code?: string | null } | null;
}

export interface ApiBooking {
  id: string;
  bookingRef: string;
  customerName: string;
  service: string;
  route: string;
  travelDate: string;
  amount: number;
  commission: number;
  status: string;
  paymentStatus: string;
  paymentMethod?: string | null;
  agentId?: string | null;
  agentName: string;
  agencyName: string;
  agentAgencyName?: string;
  agentAgencyLogo?: string | null;
  agent?: { name?: string; agency?: { name?: string; logo?: string | null } | null } | null;
  createdAt: string;
  quotationId?: string | null;
  quoteNo?: string | null;
  quotationVersionNumber?: number | null;
  destination?: string | null;
  nights?: number | null;
  totalRooms?: number | null;
  adults?: number | null;
  children?: number | null;
  infants?: number | null;
  packageValue?: number | null;
  amountPaid?: number;
  balanceAmount?: number;
  costPrice?: number;
  grossProfit?: number;
  netProfit?: number;
  salesExecutiveName?: string | null;
  operationsExecutiveName?: string | null;
  operationsExecutiveId?: string | null;
  isInternational?: boolean;
  policiesAcceptedAt?: string | null;
  termsAndConditions?: string | null;
  paymentTerms?: string | null;
  cancellationPolicy?: string | null;
  packageIncludes?: unknown;
  packageExcludes?: unknown;
  passengers?: unknown[];
  paymentRequests?: unknown[];
  services?: unknown[];
  changeRequests?: unknown[];
  addOns?: unknown[];
  invoices?: unknown[];
  documents?: unknown[];
  costDeviationApprovals?: CostDeviationApproval[];
  travelDetails?: TravelDetailsRecord | null;
  itinerary?: Array<Record<string, unknown>>;
}

export interface TravelDetailsRecord {
  flights?: {
    airline?: string;
    flightNumber?: string;
    from?: string;
    to?: string;
    date?: string;
    time?: string;
    pnr?: string;
    selfBooked?: boolean;
  }[];
  hotel?: {
    name?: string;
    checkIn?: string;
    checkOut?: string;
    confirmationNo?: string;
    roomCategory?: string;
    mealPlan?: string;
    selfBooked?: boolean;
  };
}

export interface SupplierPayoutRecord {
  id: string;
  bookingId?: string | null;
  supplierId?: string | null;
  bookingServiceId?: string | null;
  serviceType?: string | null;
  supplierName: string;
  amount: number;
  amountPaid: number;
  currency: string;
  paymentMode?: string | null;
  utr?: string | null;
  paymentDate?: string | null;
  dueDate?: string | null;
  reminderDaysBefore?: number;
  scheduledPayDate?: string | null;
  invoiceUrl?: string | null;
  status: string;
  notes?: string | null;
  createdAt: string;
  booking?: { bookingRef: string; customerName: string; destination?: string | null };
}

export interface ApiAgent {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  status: string;
  agentCode?: string | null;
  productAccess: { flights: boolean; hotels: boolean; packages: boolean };
  createdAt?: string;
  agency?: { id?: string; name?: string; code?: string | null } | null;
}

export interface CostDeviationApproval {
  id: string;
  bookingId: string;
  bookingServiceId?: string | null;
  deviationType: "service_cost" | "selling_price_increase";
  quotedCost: number;
  proposedCost: number;
  deltaAmount: number;
  currentPackageValue: number;
  proposedPackageValue?: number | null;
  status: "Pending" | "Approved" | "Rejected";
  reason?: string | null;
  requestedByName?: string | null;
  decidedBy?: string | null;
  decidedAt?: string | null;
  decisionNotes?: string | null;
  createdAt: string;
  booking?: { bookingRef: string; customerName: string; destination?: string | null };
  bookingService?: { serviceType: string; title: string };
}

export interface ApiCustomer {
  id: string;
  name: string;
  email: string;
  phone: string;
  type: string;
  tier: string;
  totalBookings: number;
  totalSpent: number;
  loyaltyPoints: number;
  passportNo?: string | null;
  visaStatus?: string | null;
  city?: string | null;
  createdAt: string;
}

export interface ApiAgency {
  id: string;
  name: string;
  code?: string | null;
  owner: string;
  email: string;
  phone: string;
  plan: string;
  status: string;
  registrationStatus?: string;
  walletBalance: number;
  commissionEarned?: number;
  totalBookings?: number;
  monthlyRevenue?: number;
  apiAllocation?: { flights: number; hotels: number };
  branches?: number;
  employees?: number;
  createdAt?: string;
}

export interface AgentRegistrationRow {
  id: string;
  companyName: string;
  fullName: string;
  email: string;
  phone: string;
  address?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  panNumber?: string | null;
  gstNumber?: string | null;
  vatNumber?: string | null;
  hasGstProof: boolean;
  gstProofDocumentId?: string | null;
  registrationStatus: string;
  registrationReviewComment?: string | null;
  registrationRejectionReason?: string | null;
  registrationReviewedAt?: string | null;
  registrationReviewedByName?: string | null;
  termsAcceptedAt?: string | null;
  agencyStatus: string;
  createdAt: string;
  applicants?: Array<{ id: string; name: string; email: string; role: string; status: string }>;
}

export interface ApiBranch {
  id: string;
  agencyId: string;
  name: string;
  manager: string;
  city: string;
  revenue: number;
  employees?: number;
}

export interface ApiEmployee {
  id: string;
  name: string;
  email: string;
  phone: string;
  designation: string;
  department: string;
  branch: string;
  branchId?: string | null;
  role: string;
  status: string;
  salary: number;
  incentives: number;
  target: number;
  achieved: number;
  attendance: number;
  joinDate: string;
  permissions?: string[] | null;
}

export interface ApiAttendance {
  id: string;
  userId: string;
  date: string;
  checkIn?: string | null;
  checkOut?: string | null;
  status: string;
  user?: { email: string; name: string } | null;
}

export interface ApiLeave {
  id: string;
  userId: string;
  userName: string;
  type: string;
  fromDate: string;
  toDate: string;
  reason: string;
  status: string;
  approvedByName?: string | null;
  createdAt: string;
}

export interface ApiShift {
  id: string;
  agencyId?: string | null;
  employeeId?: string | null;
  employeeName: string;
  date: string;
  startTime: string;
  endTime: string;
  roleLabel?: string | null;
  status: string;
  notes?: string | null;
}

export interface ApiPayrollEntry {
  id: string;
  agencyId?: string | null;
  employeeId?: string | null;
  employeeName: string;
  period: string;
  baseSalary: number;
  incentives: number;
  deductions: number;
  netPay: number;
  status: string;
  notes?: string | null;
}

export interface ApiTask {
  id: string;
  title: string;
  description?: string | null;
  assignedTo: string;
  assignedBy: string;
  priority: string;
  status: string;
  dueDate: string;
  relatedTo?: string | null;
  createdAt: string;
}

export interface CouponApi {
  id: string;
  agencyId: string;
  code: string;
  type: "Flat" | "Percent" | string;
  value: number;
  minOrderAmount: number;
  usageLimit: number;
  usedCount: number;
  maxDiscount: number | null;
  validFrom: string;
  validTill: string;
  status: "Active" | "Expired" | "Paused" | string;
  description: string | null;
  limit?: number;
  used?: number;
}

export interface CouponWriteBody {
  code: string;
  type: "Flat" | "Percent";
  value: number;
  minOrderAmount?: number;
  usageLimit?: number;
  maxDiscount?: number | null;
  validFrom?: string;
  validTill: string;
  status?: "Active" | "Paused" | "Expired";
  description?: string | null;
  agencyId?: string;
}

export interface SupportTicketMessageApi {
  id: string;
  ticketId: string;
  sender: string;
  message: string;
  isInternal: boolean;
  createdAt: string;
}

export interface SupportTicketApi {
  id: string;
  ticketId: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  operationsType: string;
  deliveryType: string;
  department: string;
  scheduledAt?: string | null;
  customerName: string;
  customerId?: string | null;
  assignedTo?: string | null;
  createdAt: string;
  updatedAt: string;
  messages?: SupportTicketMessageApi[];
}

export interface CreateSupportTicketBody {
  subject: string;
  description: string;
  priority?: string;
  operationsType: string;
  deliveryType: string;
  scheduledAt?: string;
  customerName: string;
  customerId?: string;
  assignedTo?: string;
}

export interface ApiAuditLog {
  id: string;
  userName: string;
  action: string;
  module: string;
  ip?: string | null;
  details?: string | null;
  createdAt: string;
}

export interface ApiFlight {
  id: string;
  airline: string;
  airlineCode: string;
  flightNumber: string;
  origin: string;
  originCity: string;
  destination: string;
  destinationCity: string;
  departTime: string;
  arriveTime: string;
  duration: string;
  stops: number;
  price: number;
  currency: string;
  cabin: string;
  seatsLeft: number;
  refundable: boolean;
  aircraft: string;
  rating: number;
}

export interface ApiHotel {
  id: string;
  name: string;
  city: string;
  area: string;
  starRating: number;
  rating: number;
  reviews: number;
  pricePerNight: number;
  currency: string;
  originalPrice: number;
  amenities: string[];
  images: string[];
  distanceFromCenter: number;
  latitude: number;
  longitude: number;
  rooms: ApiRoomType[];
}

export interface ApiRoomType {
  id: string;
  name: string;
  description: string;
  price: number;
  maxGuests: number;
  beds: string;
  includesBreakfast: boolean;
  freeCancellation: boolean;
  refundable: boolean;
  roomsLeft: number;
}

export interface ApiNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  priority: string;
  read: boolean;
  createdAt: string;
}

export interface ApiWalletTxn {
  id: string;
  type: string;
  source: string;
  amount: number;
  balance: number;
  description: string;
  date: string;
}

export interface ApiLead {
  id: string;
  customerName: string;
  email: string;
  phone: string;
  source: string;
  service: string;
  value: number;
  stage: string;
  assignedTo: string;
  expectedClose: string;
  notes?: string | null;
  createdAt: string;
}

export interface ApiQuotation {
  id: string;
  quoteNo: string;
  customerName: string;
  service: string;
  items: number;
  amount: number;
  gst: number;
  total: number;
  status: string;
  validTill: string;
  createdBy: string;
  createdAt: string;
  isInternational?: boolean;
  contactPerson?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  destination?: string | null;
  country?: string | null;
  coverImage?: string | null;
  travelDates?: string | null;
  adults?: number | null;
  children?: number | null;
  infants?: number | null;
  rooms?: number | null;
  hotelStarPreference?: string | null;
  location?: string | null;
  budget?: number | null;
  currency?: string | null;
  nationality?: string | null;
  landOnly?: boolean | null;
  estimatedBookingDate?: string | null;
  tripCities?: Array<{ city: string; nights: number; order?: number; destinationId?: string | null }> | null;
  departureCity?: string | null;
  packageIncludes?: unknown;
  packageExcludes?: unknown;
  paymentTerms?: string | null;
  cancellationPolicy?: string | null;
  approvalStatus?: string | null;
  couponCode?: string | null;
  couponDiscount?: number | null;
  lineItems?: Array<{
    description: string;
    qty: number;
    price: number;
    type?: string;
    imageUrl?: string;
    currency?: string;
    title?: string;
    meta?: string;
  }> | null;
}

export interface ApiPayment {
  id: string;
  txnId: string;
  customerName: string;
  bookingRef: string;
  amount: number;
  method: string;
  status: string;
  type: string;
  gateway?: string | null;
  date: string;
}

export interface ApiCommissionCredit {
  id: string;
  date: string;
  amount: number;
  description: string;
  status?: string;
}

export interface ApiCommissionRule {
  id: string;
  title: string;
  type: string;
  rate: string;
  scope: string;
  desc: string;
}

export interface ApiCommissionResponse {
  summary: {
    totalCommission: number;
    paidCommission: number;
    pendingCommission: number;
    totalRevenue: number;
    totalBookings: number;
  };
  byAgency: { agency: string; bookings: number; revenue: number; commission: number }[];
  topAgents: { agent: string; bookings: number; commission: number }[];
  monthly: { month: string; bookings: number; commission: number }[];
  credits?: ApiCommissionCredit[];
  rules?: ApiCommissionRule[] | null;
}

export interface ApiFinanceInvoice {
  id?: string;
  ref: string;
  bookingRef?: string;
  bookingId?: string;
  customer: string;
  agency: string;
  service: string;
  amount: number;
  gst: number;
  total: number;
  date: string;
  status?: string;
  invoiceType?: string;
}

export interface ApiFinanceResponse {
  summary: {
    totalRevenue: number;
    totalGst: number;
    netRevenue: number;
    totalCommission: number;
    totalExpenses: number;
    totalTds?: number;
    netProfit: number;
  };
  monthly: { month: string; revenue: number; gst: number; expenses: number; profit: number }[];
  byService: { service: string; revenue: number }[];
  invoices: ApiFinanceInvoice[];
  expenses?: Array<{ id: string; category: string; description: string; amount: number; date: string; paidBy: string }>;
  expenseByCategory?: Array<{ name: string; value: number }>;
  tds?: Array<{ id: string; section: string; nature: string; amount: number; rate: number; deducted: number; status: string; date: string; partyName: string }>;
  gstFilings?: Array<{ month: string; taxable: number; cgst: number; sgst: number; igst: number; status: string }>;
  paymentMethods: Record<string, number>;
}

export interface ApiAnalyticsTrendPoint {
  period: string;
  revenue: number;
  commission: number;
  bookings: number;
}

export interface ApiPlatformAnalytics {
  summary: {
    totalRevenue: number;
    totalCommission: number;
    totalBookings: number;
    activeAgencies: number;
    totalUsers: number;
  };
  trend: ApiAnalyticsTrendPoint[];
  byAgency: { agency: string; bookings: number; revenue: number; commission: number }[];
}

export interface ApiEmployeePerformance {
  id: string;
  name: string;
  designation: string;
  department: string;
  branch: string;
  status: string;
  target: number;
  achieved: number;
  attendance: number;
  bookings: number;
  revenue: number;
  commission: number;
  trend: ApiAnalyticsTrendPoint[];
}

export interface ApiEmployeeAnalytics {
  employees: ApiEmployeePerformance[];
  topPerformers: ApiEmployeePerformance[];
}
