import { db } from "./db.js";
import type { AuthRequest } from "../middleware/auth.js";

export const BMS_STATUSES = [
  "Draft",
  "Awaiting Passenger Details",
  "Pending Initial Payment",
  "Partially Paid",
  "Payment Received",
  "In Progress",
  "Partially Confirmed",
  "Confirmed",
  "Travel Documents Ready",
  "Completed",
  "Cancelled",
] as const;

export type BmsStatus = (typeof BMS_STATUSES)[number];

export const STANDARD_OPS_TASKS = [
  { title: "Verify Passenger Documents", department: "Operations", priority: "High" },
  { title: "Verify PAN Card", department: "Finance", priority: "High" },
  { title: "Confirm Hotel", department: "Operations", priority: "Critical" },
  { title: "Confirm Flights", department: "Operations", priority: "Critical" },
  { title: "Confirm Transfers", department: "Operations", priority: "Medium" },
  { title: "Confirm Attractions", department: "Operations", priority: "Medium" },
  { title: "Send Payment Reminder", department: "Finance", priority: "Medium" },
  { title: "Generate Invoice", department: "Finance", priority: "Medium" },
  { title: "Send Final Travel Documents", department: "Operations", priority: "High" },
] as const;

const SERVICE_DEFAULTS = [
  { serviceType: "Hotel", title: "Hotel Confirmation" },
  { serviceType: "Flight", title: "Flight Confirmation" },
  { serviceType: "Transfer", title: "Transfer Confirmation" },
  { serviceType: "Attraction", title: "Attraction Confirmation" },
  { serviceType: "Visa", title: "Visa Processing" },
] as const;

export async function nextBookingRef(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `TRV-BKG-${year}`;
  const latest = await db.booking.findFirst({
    where: { bookingRef: { startsWith: prefix } },
    orderBy: { bookingRef: "desc" },
    select: { bookingRef: true },
  });
  let seq = 1;
  if (latest?.bookingRef) {
    const raw = latest.bookingRef.slice(prefix.length);
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n)) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(5, "0")}`;
}

export async function nextPaymentRequestRef(): Promise<string> {
  const n = await db.paymentRequest.count();
  return `PR-${String(n + 1).padStart(6, "0")}`;
}

export async function nextInvoiceNo(type: string): Promise<string> {
  const prefix =
    type === "Proforma" ? "PI" :
    type === "Credit Note" ? "CN" :
    type === "Debit Note" ? "DN" : "TI";
  const year = new Date().getFullYear();
  const count = await db.bookingInvoice.count({ where: { invoiceType: type } });
  return `${prefix}-${year}-${String(count + 1).padStart(5, "0")}`;
}

export async function nextChangeRequestRef(): Promise<string> {
  const n = await db.changeRequest.count();
  return `CR-${String(n + 1).padStart(6, "0")}`;
}

export function recalculateFinancials(input: {
  packageValue: number;
  addOnTotal: number;
  amountPaid: number;
  costPrice: number;
}) {
  const amount = input.packageValue + input.addOnTotal;
  const balanceAmount = Math.max(0, amount - input.amountPaid);
  const grossProfit = amount - input.costPrice;
  const netProfit = Math.round(grossProfit * 0.9);
  return { amount, packageValue: input.packageValue, balanceAmount, grossProfit, netProfit };
}

export function derivePaymentStatus(amountPaid: number, amount: number): string {
  if (amountPaid <= 0) return "Pending";
  if (amountPaid >= amount) return "Paid";
  return "Partial";
}

export function deriveBookingStatusFromPayments(
  current: string,
  amountPaid: number,
  amount: number,
): string {
  if (current === "Cancelled" || current === "Completed" || current === "Travel Documents Ready") {
    return current;
  }
  if (amountPaid <= 0) {
    if (current === "Draft" || current === "Awaiting Passenger Details") return current;
    return "Pending Initial Payment";
  }
  if (amountPaid < amount) return "Partially Paid";
  if (["In Progress", "Partially Confirmed", "Confirmed", "Travel Documents Ready"].includes(current)) {
    return current;
  }
  return "Payment Received";
}

export function validatePassenger(
  p: {
    firstName?: string;
    lastName?: string;
    dateOfBirth?: string;
    panNumber?: string;
    passportNumber?: string;
    passportExpiry?: string;
    isLead?: boolean;
  },
  isInternational: boolean,
): string | null {
  if (!p.firstName?.trim() || !p.lastName?.trim()) return "First and last name are required";
  if (!p.dateOfBirth?.trim()) return "Date of birth is required";
  if (p.isLead && !isInternational && !p.panNumber?.trim()) {
    return "PAN number is required for lead passenger on domestic bookings";
  }
  if (isInternational) {
    if (!p.passportNumber?.trim()) return "Passport number is required for international bookings";
    if (!p.passportExpiry?.trim()) return "Passport expiry is required for international bookings";
  }
  return null;
}

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/** Stub PAN verification — format check + optional name match (replace with NSDL/Protean later). */
export function verifyPanStub(pan: string, passengerName: string, registeredName?: string) {
  const normalized = pan.trim().toUpperCase();
  if (!PAN_RE.test(normalized)) {
    return { ok: false as const, status: "Failed", message: "Invalid PAN format", registeredName: null };
  }
  const expected = (registeredName || passengerName).trim().toUpperCase();
  const actual = passengerName.trim().toUpperCase();
  if (registeredName && expected !== actual) {
    return {
      ok: false as const,
      status: "Failed",
      message: "PAN registered name does not match passenger name",
      registeredName: registeredName.trim(),
    };
  }
  return {
    ok: true as const,
    status: "Verified",
    message: "PAN verified",
    registeredName: passengerName.trim(),
  };
}

export async function writeAudit(opts: {
  req?: AuthRequest;
  agencyId?: string | null;
  bookingId?: string | null;
  action: string;
  module?: string;
  details?: string;
  previousValue?: unknown;
  updatedValue?: unknown;
  comments?: string;
}) {
  const auth = opts.req?.auth;
  await db.auditLog.create({
    data: {
      userId: auth?.userId,
      agencyId: opts.agencyId ?? auth?.agencyId ?? undefined,
      bookingId: opts.bookingId ?? undefined,
      userName: auth?.email || "System",
      userRole: auth?.role,
      action: opts.action,
      module: opts.module || "bookings",
      ip: opts.req?.ip,
      details: opts.details,
      previousValue: opts.previousValue as object | undefined,
      updatedValue: opts.updatedValue as object | undefined,
      comments: opts.comments,
    },
  });
}

export async function notify(opts: {
  agencyId?: string | null;
  userId?: string | null;
  type?: string;
  title: string;
  message: string;
  priority?: string;
}) {
  await db.notification.create({
    data: {
      type: opts.type || "booking",
      title: opts.title,
      message: opts.message,
      priority: opts.priority || "medium",
      userId: opts.userId ?? undefined,
      agencyId: opts.agencyId ?? undefined,
    },
  });
}

export async function seedBookingServices(bookingId: string, isInternational: boolean) {
  const rows = SERVICE_DEFAULTS.filter((s) => isInternational || s.serviceType !== "Visa");
  await db.bookingService.createMany({
    data: rows.map((s) => ({
      bookingId,
      serviceType: s.serviceType,
      title: s.title,
      status: "Pending",
    })),
  });
}

export async function seedOpsTasks(opts: {
  bookingId: string;
  bookingRef: string;
  agencyId?: string | null;
  branchId?: string | null;
  assignedBy: string;
  isInternational: boolean;
}) {
  const due = new Date();
  due.setDate(due.getDate() + 3);
  const dueDate = due.toISOString().slice(0, 10);
  const tasks = STANDARD_OPS_TASKS.filter(
    (t) => opts.isInternational || t.title !== "Verify PAN Card" || true,
  );
  await db.task.createMany({
    data: tasks.map((t) => ({
      agencyId: opts.agencyId ?? undefined,
      branchId: opts.branchId ?? undefined,
      bookingId: opts.bookingId,
      title: t.title,
      description: `Auto-created for booking ${opts.bookingRef}`,
      assignedTo: "Unassigned",
      assignedBy: opts.assignedBy,
      department: t.department,
      priority: t.priority,
      status: "Pending",
      dueDate,
      relatedTo: opts.bookingRef,
    })),
  });
}

export function passengerSlotsFromRooms(rooms: number, adults: number, children: number, infants: number) {
  const total = Math.max(1, adults + children + infants);
  const roomCount = Math.max(1, rooms || 1);
  const slots: { roomIndex: number; isLead: boolean }[] = [];
  for (let i = 0; i < total; i++) {
    slots.push({
      roomIndex: Math.min(roomCount - 1, Math.floor((i * roomCount) / total)),
      isLead: i === 0,
    });
  }
  return slots;
}

export const BOOKING_INCLUDE = {
  passengers: { orderBy: { createdAt: "asc" as const } },
  paymentRequests: { orderBy: { createdAt: "desc" as const } },
  services: { orderBy: { serviceType: "asc" as const } },
  supplierLines: true,
  documents: { orderBy: { createdAt: "desc" as const } },
  invoices: { orderBy: { createdAt: "desc" as const } },
  changeRequests: { orderBy: { createdAt: "desc" as const } },
  addOns: true,
  supplierPayouts: { orderBy: { createdAt: "desc" as const } },
  modifications: { orderBy: { createdAt: "desc" as const } },
  payments: { orderBy: { date: "desc" as const } },
} as const;

export function categoryForRequestType(requestType: string): string {
  const map: Record<string, string> = {
    "Name Correction": "Passenger",
    "Name Change": "Passenger",
    "Date of Birth Correction": "Passenger",
    "Passport Update": "Passenger",
    "Passport Renewal": "Passenger",
    "PAN Card Update": "Passenger",
    "Passenger Addition": "Passenger",
    "Passenger Removal": "Passenger",
    "Hotel Change Request": "Hotel",
    "Hotel Upgrade": "Hotel",
    "Hotel Downgrade": "Hotel",
    "Room Category Change": "Hotel",
    "Additional Room": "Hotel",
    "Early Check-in": "Hotel",
    "Late Check-out": "Hotel",
    "Flight Date Change": "Flight",
    "Flight Time Change": "Flight",
    "Flight Upgrade": "Flight",
    "Seat Selection": "Flight",
    "Meal Request": "Flight",
    "Baggage Addition": "Flight",
    "Flight Cancellation": "Flight",
    "Itinerary Change": "Itinerary",
    "Add Destination": "Itinerary",
    "Remove Destination": "Itinerary",
    "Extend Stay": "Itinerary",
    "Reduce Stay": "Itinerary",
    "Add Extra Night": "Itinerary",
    "Remove Night": "Itinerary",
    "Modify Sightseeing": "Itinerary",
    "Add Additional Inclusion": "Service",
    "Remove Inclusion": "Service",
    "Add Airport Transfer": "Service",
    "Upgrade Transfer": "Service",
    "Add Attraction": "Service",
    "Remove Attraction": "Service",
    "Add Cruise": "Service",
    "Add Insurance": "Service",
    "Add SIM/eSIM": "Service",
    "Add Visa": "Service",
    "Add Meals": "Service",
    "Special Assistance": "Service",
    "Request Partial Refund": "Financial",
    "Request Full Refund": "Financial",
    "Payment Extension": "Financial",
    "Additional Invoice": "Financial",
    "GST Invoice": "Financial",
    "Credit Note": "Financial",
    "Request Booking Cancellation": "Cancellation",
    "Request Hotel Cancellation": "Cancellation",
    "Request Flight Cancellation": "Cancellation",
    "Request Activity Cancellation": "Cancellation",
    "Cancel Visa": "Cancellation",
    "Cancel Insurance": "Cancellation",
  };
  return map[requestType] || "Miscellaneous";
}
