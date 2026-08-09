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

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
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
    try {
      const body = await res.json();
      message = body.error || body.message || message;
    } catch {
      /* ignore */
    }
    if (res.status === 401) message = "Your session has expired. Please sign in again.";
    else if (res.status === 403) message = "You don't have permission to perform this action.";
    else if (res.status >= 500 && message === (res.statusText || "Request failed")) {
      message = "Something went wrong on our end. Please try again shortly.";
    }
    throw new ApiError(message, res.status);
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
    apiFetch<{ user: ApiUser; token: string }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
    }),

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
    apiFetch<{ booking: ApiBooking }>(`/api/quotations/${quotationId}/proceed-to-booking`, {
      method: "POST",
      body: JSON.stringify(body || {}),
    }),

  getBookingFull: (id: string) =>
    apiFetch<{ booking: ApiBooking; tasks: unknown[]; audits: unknown[] }>(`/api/bookings/${id}/full`),

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

  uploadBookingDocument: (id: string, body: Record<string, unknown>) =>
    apiFetch<{ document: unknown }>(`/api/bookings/${id}/documents`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

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
    apiFetch<{ payout: unknown }>("/api/supplier-payouts", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getSupplierPayouts: () => apiFetch<{ payouts: unknown[] }>("/api/supplier-payouts"),

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

  searchFlights: (origin: string, destination: string, count = 8) =>
    apiFetch<{ flights: ApiFlight[] }>(`/api/flights/search?origin=${origin}&destination=${destination}&count=${count}`),

  searchHotels: (city: string, count = 8) =>
    apiFetch<{ hotels: ApiHotel[] }>(`/api/hotels/search?city=${encodeURIComponent(city)}&count=${count}`),

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

  getWallet: (agencyId: string) =>
    apiFetch<{ balance: number; transactions: ApiWalletTxn[] }>(`/api/wallet?agencyId=${agencyId}`),

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

  getQuotationFull: (id: string) => apiFetch<{ quotation: ApiQuotation }>(`/api/quotations/${id}/full`),

  createQuotationWizard: (body: Record<string, unknown>) =>
    apiFetch<{ quotation: ApiQuotation }>("/api/quotations/wizard", { method: "POST", body: JSON.stringify(body) }),

  saveQuotationWizard: (id: string, body: Record<string, unknown>) =>
    apiFetch<{ quotation: ApiQuotation }>(`/api/quotations/${id}/wizard`, { method: "PUT", body: JSON.stringify(body) }),

  setQuotationStatus: (id: string, status: string, body?: Record<string, unknown>) =>
    apiFetch<{ quotation: ApiQuotation }>(`/api/quotations/${id}/status`, {
      method: "POST",
      body: JSON.stringify({ status, ...body }),
    }),

  submitQuotationApproval: (id: string) =>
    apiFetch<{ quotation: ApiQuotation }>(`/api/quotations/${id}/submit-approval`, { method: "POST", body: "{}" }),

  approveQuotation: (id: string, body?: Record<string, unknown>) =>
    apiFetch<{ quotation: ApiQuotation }>(`/api/quotations/${id}/approve`, {
      method: "POST",
      body: JSON.stringify(body || { readyToSend: true }),
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
    apiFetch<{ share: unknown; mailto?: string; whatsappUrl?: string; link: string; note: string }>(
      `/api/quotations/${id}/share`,
      { method: "POST", body: JSON.stringify(body) },
    ),

  createQuotationVersion: (id: string, body?: Record<string, unknown>) =>
    apiFetch<{ version: unknown }>(`/api/quotations/${id}/versions`, {
      method: "POST",
      body: JSON.stringify(body || {}),
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

  getCmsPages: () => apiFetch<{ pages: any[] }>("/api/cms/pages"),
  createCmsPage: (body: any) => apiFetch<any>("/api/cms/pages", { method: "POST", body: JSON.stringify(body) }),

  getApiKeys: () => apiFetch<{ keys: any[] }>("/api/management/keys"),
  createApiKey: (body: any) => apiFetch<any>("/api/management/keys", { method: "POST", body: JSON.stringify(body) }),

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
  state: string;
  city: string;
  panNumber?: string;
  password: string;
  confirmPassword: string;
  gstNumber?: string;
  gstProofUrl?: string;
  termsAccepted: true;
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
  permissions?: string[] | null;
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
  agentName: string;
  agencyName: string;
  createdAt: string;
  quotationId?: string | null;
  quoteNo?: string | null;
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
  owner: string;
  email: string;
  phone: string;
  plan: string;
  status: string;
  walletBalance: number;
  commissionEarned?: number;
  totalBookings?: number;
  monthlyRevenue?: number;
  apiAllocation?: { flights: number; hotels: number };
  branches?: number;
  employees?: number;
  createdAt?: string;
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
  travelDates?: string | null;
  adults?: number | null;
  children?: number | null;
  infants?: number | null;
  hotelStarPreference?: string | null;
  location?: string | null;
  budget?: number | null;
  currency?: string | null;
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
}

export interface ApiFinanceInvoice {
  ref: string;
  customer: string;
  agency: string;
  service: string;
  amount: number;
  gst: number;
  total: number;
  date: string;
}

export interface ApiFinanceResponse {
  summary: {
    totalRevenue: number;
    totalGst: number;
    netRevenue: number;
    totalCommission: number;
    totalExpenses: number;
    netProfit: number;
  };
  monthly: { month: string; revenue: number; gst: number; expenses: number; profit: number }[];
  byService: { service: string; revenue: number }[];
  invoices: ApiFinanceInvoice[];
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
