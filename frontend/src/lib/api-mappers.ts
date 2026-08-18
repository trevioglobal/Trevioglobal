import type {
  Booking, Customer, Employee, Flight, Hotel, Lead, Notification, Payment, Quotation, Role, Task, User, WalletTransaction, Agency, Branch,
  Module, Attendance, Leave,
} from "@/types";
// Quotation mapper uses extended ApiQuotation fields
import type {
  ApiBooking, ApiCustomer, ApiEmployee, ApiFlight, ApiHotel, ApiLead, ApiNotification, ApiPayment, ApiQuotation, ApiTask, ApiUser, ApiWalletTxn,
  ApiAgency, ApiBranch, ApiCommissionResponse, ApiFinanceResponse, ApiFinanceInvoice, ApiAttendance, ApiLeave,
} from "@/lib/api";

export function mapApiUser(u: ApiUser): User {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone || "",
    role: u.role as Role,
    designation: u.designation || undefined,
    agencyId: u.agencyId || undefined,
    branchId: u.branchId || undefined,
    permissions: (u.permissions as Module[] | null | undefined) ?? undefined,
  };
}

export function mapApiAttendance(a: ApiAttendance, userName = ""): Attendance {
  return {
    id: a.id,
    userId: a.userId,
    userName,
    date: a.date,
    checkIn: a.checkIn || undefined,
    checkOut: a.checkOut || undefined,
    status: a.status as Attendance["status"],
  };
}

export function mapApiLeave(l: ApiLeave): Leave {
  return {
    id: l.id,
    userId: l.userId,
    userName: l.userName,
    type: l.type as Leave["type"],
    fromDate: l.fromDate,
    toDate: l.toDate,
    reason: l.reason,
    status: l.status as Leave["status"],
    approvedByName: l.approvedByName || undefined,
    createdAt: l.createdAt,
  };
}

export function mapApiBooking(b: ApiBooking): Booking {
  return {
    id: b.id,
    bookingRef: b.bookingRef,
    customerName: b.customerName,
    service: b.service as Booking["service"],
    route: b.route,
    travelDate: b.travelDate,
    amount: b.amount,
    commission: b.commission,
    status: b.status as Booking["status"],
    paymentStatus: b.paymentStatus as Booking["paymentStatus"],
    paymentMethod: b.paymentMethod || undefined,
    agent: b.agentName,
    agency: b.agencyName,
    createdAt: b.createdAt.slice(0, 10),
    quotationId: b.quotationId,
    quoteNo: b.quoteNo,
    destination: b.destination,
    nights: b.nights,
    totalRooms: b.totalRooms,
    adults: b.adults,
    children: b.children,
    infants: b.infants,
    packageValue: b.packageValue,
    amountPaid: b.amountPaid,
    balanceAmount: b.balanceAmount,
    costPrice: b.costPrice,
    grossProfit: b.grossProfit,
    netProfit: b.netProfit,
    salesExecutiveName: b.salesExecutiveName,
    operationsExecutiveName: b.operationsExecutiveName,
    isInternational: b.isInternational,
    policiesAcceptedAt: b.policiesAcceptedAt,
    termsAndConditions: b.termsAndConditions,
    paymentTerms: b.paymentTerms,
    cancellationPolicy: b.cancellationPolicy,
    packageIncludes: b.packageIncludes,
    packageExcludes: b.packageExcludes,
    passengers: b.passengers as Booking["passengers"],
    paymentRequests: b.paymentRequests as Booking["paymentRequests"],
    services: b.services as Booking["services"],
    changeRequests: b.changeRequests as Booking["changeRequests"],
    addOns: b.addOns as Booking["addOns"],
    invoices: b.invoices as Booking["invoices"],
    documents: b.documents as Booking["documents"],
  };
}

export function mapApiCustomer(c: ApiCustomer): Customer {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    type: c.type as Customer["type"],
    tier: c.tier as Customer["tier"],
    totalBookings: c.totalBookings,
    totalSpent: c.totalSpent,
    loyaltyPoints: c.loyaltyPoints,
    passportNo: c.passportNo || undefined,
    visaStatus: (c.visaStatus as Customer["visaStatus"]) || undefined,
    city: c.city || "",
    createdAt: c.createdAt.slice(0, 10),
  };
}

export function mapApiNotification(n: ApiNotification): Notification {
  return {
    id: n.id,
    type: n.type as Notification["type"],
    title: n.title,
    message: n.message,
    time: formatRelativeTime(n.createdAt),
    read: n.read,
    priority: n.priority as Notification["priority"],
  };
}

export function mapApiWalletTxn(t: ApiWalletTxn): WalletTransaction {
  return {
    id: t.id,
    type: t.type as WalletTransaction["type"],
    source: t.source as WalletTransaction["source"],
    amount: t.amount,
    balance: t.balance,
    description: t.description,
    date: typeof t.date === "string" ? t.date.slice(0, 10) : new Date(t.date).toISOString().slice(0, 10),
  };
}

export function mapApiLead(l: ApiLead): Lead {
  return {
    id: l.id,
    customerName: l.customerName,
    email: l.email,
    phone: l.phone,
    source: l.source as Lead["source"],
    service: l.service as Lead["service"],
    value: l.value,
    stage: l.stage as Lead["stage"],
    assignedTo: l.assignedTo,
    expectedClose: l.expectedClose,
    createdAt: l.createdAt.slice(0, 10),
    notes: l.notes || "",
  };
}

function asStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((v): v is string => typeof v === "string");
}

export function mapApiQuotation(q: ApiQuotation): Quotation {
  return {
    id: q.id,
    quoteNo: q.quoteNo,
    customerName: q.customerName,
    service: q.service as Quotation["service"],
    items: q.items,
    amount: q.amount,
    gst: q.gst,
    total: q.total,
    status: q.status as Quotation["status"],
    validTill: q.validTill,
    createdBy: q.createdBy,
    createdAt: q.createdAt.slice(0, 10),
    isInternational: q.isInternational ?? false,
    contactPerson: q.contactPerson ?? undefined,
    contactEmail: q.contactEmail ?? undefined,
    contactPhone: q.contactPhone ?? undefined,
    destination: q.destination ?? undefined,
    country: q.country ?? undefined,
    coverImage: (q as { coverImage?: string | null }).coverImage ?? undefined,
    travelDates: q.travelDates ?? undefined,
    adults: q.adults ?? undefined,
    children: q.children ?? undefined,
    infants: q.infants ?? undefined,
    hotelStarPreference: q.hotelStarPreference ?? undefined,
    location: q.location ?? undefined,
    budget: q.budget ?? undefined,
    currency: q.currency ?? undefined,
    packageIncludes: asStringList(q.packageIncludes),
    packageExcludes: asStringList(q.packageExcludes),
    paymentTerms: q.paymentTerms ?? undefined,
    cancellationPolicy: q.cancellationPolicy ?? undefined,
    approvalStatus: (q.approvalStatus as Quotation["approvalStatus"]) ?? undefined,
    couponCode: q.couponCode ?? undefined,
    couponDiscount: q.couponDiscount ?? undefined,
    lineItems: Array.isArray(q.lineItems)
      ? q.lineItems.map((li) => ({
          description: li.description || li.title || "Item",
          qty: li.qty,
          price: li.price,
          type: li.type,
          imageUrl: li.imageUrl,
          currency: li.currency,
        }))
      : undefined,
    quoteDate: (q as { quoteDate?: string }).quoteDate,
    travelStartDate: (q as { travelStartDate?: string }).travelStartDate,
    travelEndDate: (q as { travelEndDate?: string }).travelEndDate,
    agentName: (q as { agentName?: string }).agentName,
    specialRequests: (q as { specialRequests?: string }).specialRequests,
    internalNotes: (q as { internalNotes?: string }).internalNotes,
    totalNetCost: (q as { totalNetCost?: number }).totalNetCost,
    totalSelling: (q as { totalSelling?: number }).totalSelling,
    grossProfit: (q as { grossProfit?: number }).grossProfit,
    profitMargin: (q as { profitMargin?: number }).profitMargin,
    discountType: (q as { discountType?: string | null }).discountType,
    discountValue: (q as { discountValue?: number }).discountValue,
    discountAmount: (q as { discountAmount?: number }).discountAmount,
    taxRate: (q as { taxRate?: number }).taxRate,
    perPersonCost: (q as { perPersonCost?: number }).perPersonCost,
    currentVersion: (q as { currentVersion?: number }).currentVersion,
    wizardStep: (q as { wizardStep?: number }).wizardStep,
    enquiryRef: (q as { enquiryRef?: string }).enquiryRef,
    selectedPackageId: (q as { selectedPackageId?: string | null }).selectedPackageId,
    convertedBookingId: (q as { convertedBookingId?: string | null }).convertedBookingId,
    salesExecutiveName: (q as { salesExecutiveName?: string }).salesExecutiveName,
    packages: (q as { packages?: Quotation["packages"] }).packages,
    versions: (q as { versions?: Quotation["versions"] }).versions,
    approvals: (q as { approvals?: Quotation["approvals"] }).approvals,
  };
}

export function mapApiPayment(p: ApiPayment): Payment {
  return {
    id: p.id,
    txnId: p.txnId,
    customerName: p.customerName,
    bookingRef: p.bookingRef,
    amount: p.amount,
    method: p.method as Payment["method"],
    status: p.status as Payment["status"],
    type: p.type as Payment["type"],
    date: p.date.slice(0, 10),
    gateway: p.gateway || undefined,
  };
}

export function mapApiEmployee(e: ApiEmployee): Employee {
  return {
    id: e.id,
    name: e.name,
    email: e.email,
    phone: e.phone,
    designation: e.designation,
    department: e.department as Employee["department"],
    branch: e.branch,
    branchId: e.branchId || undefined,
    role: e.role as Role,
    status: e.status as Employee["status"],
    salary: e.salary,
    incentives: e.incentives,
    target: e.target,
    achieved: e.achieved,
    attendance: e.attendance,
    joinDate: e.joinDate,
    permissions: (e.permissions as Module[] | null | undefined) ?? undefined,
  };
}

export function mapApiTask(t: ApiTask): Task {
  return {
    id: t.id,
    title: t.title,
    description: t.description || "",
    assignedTo: t.assignedTo,
    assignedBy: t.assignedBy,
    priority: t.priority as Task["priority"],
    status: t.status as Task["status"],
    dueDate: t.dueDate,
    relatedTo: t.relatedTo || undefined,
    createdAt: t.createdAt.slice(0, 10),
  };
}

export function mapApiFlight(f: ApiFlight): Flight {
  return {
    ...f,
    cabin: f.cabin as Flight["cabin"],
  };
}

export function mapApiHotel(h: ApiHotel): Hotel {
  return {
    ...h,
    rooms: h.rooms.map((r) => ({ ...r })),
  };
}

export function mapApiAgency(a: ApiAgency): Agency {
  return {
    id: a.id,
    name: a.name,
    owner: a.owner,
    email: a.email,
    phone: a.phone,
    plan: a.plan as Agency["plan"],
    status: a.status as Agency["status"],
    walletBalance: a.walletBalance,
    commissionEarned: a.commissionEarned ?? 0,
    totalBookings: a.totalBookings ?? 0,
    monthlyRevenue: a.monthlyRevenue ?? 0,
    apiAllocation: a.apiAllocation ?? { flights: 0, hotels: 0 },
    createdAt: a.createdAt?.slice(0, 10) ?? "",
    branches: a.branches ?? 0,
    employees: a.employees ?? 0,
  };
}

export function mapApiBranch(b: ApiBranch): Branch {
  return {
    id: b.id,
    agencyId: b.agencyId,
    name: b.name,
    manager: b.manager,
    city: b.city,
    employees: b.employees ?? 0,
    revenue: b.revenue,
  };
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

// ── Commission mapper ─────────────────────────────────────────────────────────
export interface MappedCommission {
  summary: {
    totalCommission: number;
    paidCommission: number;
    pendingCommission: number;
    totalRevenue: number;
    totalBookings: number;
  };
  byAgency: { agency: string; bookings: number; revenue: number; commission: number }[];
  topAgents: { agent: string; bookings: number; commission: number }[];
  monthly: { month: string; label: string; bookings: number; commission: number }[];
}

export function mapApiCommission(data: ApiCommissionResponse): MappedCommission {
  return {
    summary: data.summary,
    byAgency: data.byAgency,
    topAgents: data.topAgents,
    monthly: data.monthly.map((m) => ({
      ...m,
      label: formatMonthLabel(m.month),
    })),
  };
}

// ── Finance mapper ────────────────────────────────────────────────────────────
export interface MappedFinance {
  summary: {
    totalRevenue: number;
    totalGst: number;
    netRevenue: number;
    totalCommission: number;
    totalExpenses: number;
    netProfit: number;
  };
  monthly: { month: string; label: string; revenue: number; gst: number; expenses: number; profit: number }[];
  byService: { service: string; revenue: number }[];
  invoices: ApiFinanceInvoice[];
  paymentMethods: { method: string; amount: number }[];
}

export function mapApiFinance(data: ApiFinanceResponse): MappedFinance {
  return {
    summary: data.summary,
    monthly: data.monthly.map((m) => ({
      ...m,
      label: formatMonthLabel(m.month),
    })),
    byService: data.byService,
    invoices: data.invoices,
    paymentMethods: Object.entries(data.paymentMethods).map(([method, amount]) => ({ method, amount })),
  };
}

function formatMonthLabel(yyyyMm: string): string {
  const [year, month] = yyyyMm.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}
