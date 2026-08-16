"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Booking,
  Customer,
  Lead,
  Quotation,
  NewQuotationInput,
  Employee,
  Payment,
  WalletTransaction,
  Notification,
  Task,
  Module,
} from "@/types";
import { api } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import {
  mapApiBooking,
  mapApiCustomer,
  mapApiEmployee,
  mapApiLead,
  mapApiNotification,
  mapApiPayment,
  mapApiQuotation,
  mapApiTask,
  mapApiWalletTxn,
  mapApiFinance,
  mapApiCommission,
} from "@/lib/api-mappers";

export interface NewBookingInput {
  customerName: string;
  service: Booking["service"];
  route: string;
  travelDate: string;
  amount: number;
  commission?: number;
  paymentMethod?: string;
  agent?: string;
  agency?: string;
  status?: Booking["status"];
  paymentStatus?: Booking["paymentStatus"];
}

interface DemoDataState {
  bookings: Booking[];
  customers: Customer[];
  leads: Lead[];
  quotations: Quotation[];
  employees: Employee[];
  tasks: Task[];
  payments: Payment[];
  walletBalance: number;
  walletTxns: WalletTransaction[];
  notifications: Notification[];
  bookingSeq: number;
  paymentSeq: number;

  dashboardStats: any;
  financeStats: any;
  commissionStats: any;

  addBooking: (input: NewBookingInput) => Booking;
  upsertBooking: (booking: Booking) => void;
  updateBookingStatus: (id: string, status: Booking["status"]) => void;
  addCustomer: (customer: Omit<Customer, "id" | "totalBookings" | "totalSpent" | "loyaltyPoints" | "createdAt">) => Customer;
  addLead: (lead: Omit<Lead, "id" | "stage" | "createdAt">) => Lead;
  updateLeadStage: (id: string, stage: Lead["stage"]) => void;
  addQuotation: (q: NewQuotationInput) => Quotation;
  upsertQuotation: (q: Quotation) => void;
  updateQuotationStatus: (id: string, status: Quotation["status"]) => void;
  addEmployee: (e: Omit<Employee, "id" | "joinDate" | "status" | "incentives" | "achieved" | "attendance"> & { branchId?: string; permissions?: Module[] | null }) => Promise<Employee & { tempPassword?: string }>;
  updateEmployee: (id: string, patch: Partial<Employee> & { branchId?: string | null; permissions?: Module[] | null }) => Promise<void>;
  addTask: (t: Omit<Task, "id" | "createdAt" | "status">) => Task;
  updateTaskStatus: (id: string, status: Task["status"]) => void;
  addPayment: (p: Omit<Payment, "id" | "txnId" | "date" | "status">) => Payment;
  walletTopUp: (
    amount: number,
    method: string,
    payment?: { orderId?: string; paymentId?: string; signature?: string; demo?: boolean }
  ) => Promise<void>;
  walletTransfer: (amount: number, description: string) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  hydrateFromApi: (agencyId?: string) => Promise<void>;
  resetDemoData: () => void;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function nextBookingRef(seq: number) {
  return `BK-${seq}`;
}

function nextTxnId(seq: number) {
  return `pay_${seq.toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function reportSyncFailure(entityLabel: string) {
  toast({
    title: "Sync issue",
    description: `${entityLabel} saved locally but couldn't reach the server. It may not appear in reports until you're back online.`,
    variant: "destructive",
  });
}

const initialState = {
  bookings: [] as Booking[],
  customers: [] as Customer[],
  leads: [] as Lead[],
  quotations: [] as Quotation[],
  employees: [] as Employee[],
  tasks: [] as Task[],
  payments: [] as Payment[],
  walletBalance: 0,
  walletTxns: [] as WalletTransaction[],
  notifications: [] as Notification[],
  bookingSeq: 1,
  paymentSeq: 1,
  dashboardStats: null,
  financeStats: null,
  commissionStats: null,
};

export const useDemoDataStore = create<DemoDataState>()(
  persist(
    (set, get) => ({
      ...initialState,

      addBooking: (input) => {
        const seq = get().bookingSeq;
        const bookingRef = nextBookingRef(seq);
        const commission = input.commission ?? Math.round(input.amount * 0.05);
        const resolvedStatus = input.status ?? "Confirmed";
        const resolvedPaymentStatus = input.paymentStatus ?? "Paid";
        const isPaid = resolvedPaymentStatus === "Paid";
        const booking: Booking = {
          id: `bk-${Date.now()}`,
          bookingRef,
          customerName: input.customerName,
          service: input.service,
          route: input.route,
          travelDate: input.travelDate,
          amount: input.amount,
          commission,
          status: resolvedStatus,
          paymentStatus: resolvedPaymentStatus,
          paymentMethod: input.paymentMethod ?? "Razorpay",
          agent: input.agent ?? "Sneha Reddy",
          agency: input.agency ?? "Wanderlust Travels",
          createdAt: todayISO(),
        };
        const payment: Payment | null = isPaid ? {
          id: `py-${Date.now()}`,
          txnId: nextTxnId(get().paymentSeq),
          customerName: input.customerName,
          bookingRef,
          amount: input.amount,
          method: (input.paymentMethod as Payment["method"]) ?? "Razorpay",
          status: "Success",
          type: "Payment",
          date: todayISO(),
          gateway: "Razorpay",
        } : null;
        const notification: Notification = {
          id: `nt-${Date.now()}`,
          type: "booking",
          title: isPaid ? "New Booking Confirmed" : "New Booking Submitted",
          message: `${bookingRef} - ${input.customerName} booked ${input.service} for ₹${input.amount.toLocaleString("en-IN")}`,
          time: "Just now",
          read: false,
          priority: "high",
        };
        set((s) => ({
          bookings: [booking, ...s.bookings],
          payments: payment ? [payment, ...s.payments] : s.payments,
          notifications: [notification, ...s.notifications],
          bookingSeq: seq + 1,
          paymentSeq: payment ? s.paymentSeq + 1 : s.paymentSeq,
        }));

        const localBookingId = booking.id;
        const localPaymentId = payment?.id;
        api
          .createBooking({
            customerName: input.customerName,
            service: input.service,
            route: input.route,
            travelDate: input.travelDate,
            amount: input.amount,
            commission,
            status: resolvedStatus,
            paymentStatus: resolvedPaymentStatus,
            paymentMethod: input.paymentMethod,
            agentName: input.agent ?? "Sneha Reddy",
            agencyName: input.agency ?? "Wanderlust Travels",
          })
          .then((res) => {
            const server = mapApiBooking(res.booking);
            set((s) => ({
              bookings: s.bookings.map((b) => (b.id === localBookingId ? server : b)),
              payments: localPaymentId
                ? s.payments.map((p) =>
                    p.id === localPaymentId ? { ...p, bookingRef: server.bookingRef } : p
                  )
                : s.payments,
            }));
          })
          .catch(() => reportSyncFailure("Booking"));

        return booking;
      },

      upsertBooking: (booking) => {
        set((s) => {
          const idx = s.bookings.findIndex((b) => b.id === booking.id || b.bookingRef === booking.bookingRef);
          if (idx === -1) return { bookings: [booking, ...s.bookings] };
          const next = [...s.bookings];
          next[idx] = { ...next[idx], ...booking };
          return { bookings: next };
        });
      },

      updateBookingStatus: (id, status) => {
        set((s) => ({
          bookings: s.bookings.map((b) =>
            b.id === id
              ? {
                  ...b,
                  status,
                  paymentStatus: status === "Cancelled" ? "Refunded" : status === "Refunded" ? "Refunded" : b.paymentStatus,
                }
              : b
          ),
        }));
        const paymentStatus =
          status === "Cancelled" || status === "Refunded" ? "Refunded" : undefined;
        api
          .updateBooking(id, { status, ...(paymentStatus ? { paymentStatus } : {}) })
          .catch(() => reportSyncFailure("Booking update"));
      },

      addCustomer: (input) => {
        const localId = `cu-${Date.now()}`;
        const customer: Customer = {
          ...input,
          id: localId,
          totalBookings: 0,
          totalSpent: 0,
          loyaltyPoints: 0,
          createdAt: todayISO(),
        };
        set((s) => ({ customers: [customer, ...s.customers] }));
        api
          .createCustomer({
            name: input.name,
            email: input.email,
            phone: input.phone,
            type: input.type,
            tier: input.tier,
            passportNo: input.passportNo,
            visaStatus: input.visaStatus,
            city: input.city,
          })
          .then((res) => {
            const server = mapApiCustomer(res.customer);
            set((s) => ({
              customers: s.customers.map((c) => (c.id === localId ? server : c)),
            }));
          })
          .catch(() => reportSyncFailure("Customer"));
        return customer;
      },

      addLead: (input) => {
        const localId = `ld-${Date.now()}`;
        const lead: Lead = {
          ...input,
          id: localId,
          stage: "New",
          createdAt: todayISO(),
        };
        set((s) => ({ leads: [lead, ...s.leads] }));
        api
          .createLead({
            customerName: input.customerName,
            email: input.email,
            phone: input.phone,
            source: input.source,
            service: input.service,
            value: input.value,
            assignedTo: input.assignedTo,
            expectedClose: input.expectedClose,
            notes: input.notes,
          })
          .then((res) => {
            const server = mapApiLead(res.lead);
            set((s) => ({
              leads: s.leads.map((l) => (l.id === localId ? server : l)),
            }));
          })
          .catch(() => reportSyncFailure("Lead"));
        return lead;
      },

      updateLeadStage: (id, stage) => {
        set((s) => ({
          leads: s.leads.map((l) => (l.id === id ? { ...l, stage } : l)),
        }));
        api.updateLeadStage(id, stage).catch(() => reportSyncFailure("Lead update"));
      },

      addQuotation: (input: NewQuotationInput) => {
        const localId = `qt-${Date.now()}`;
        const quoteNo = `QT-2025-${String(get().quotations.length + 19).padStart(3, "0")}`;
        const quotation: Quotation = {
          ...input,
          service: input.service as Quotation["service"],
          id: localId,
          quoteNo,
          status: (input.status as Quotation["status"] | undefined) ?? "Draft",
          approvalStatus: input.approvalStatus as Quotation["approvalStatus"] | undefined,
          createdAt: todayISO(),
        };
        set((s) => ({ quotations: [quotation, ...s.quotations] }));
        api
          .createQuotation({
            customerName: input.customerName,
            service: input.service,
            items: input.items,
            amount: input.amount,
            gst: input.gst,
            total: input.total,
            validTill: input.validTill,
            createdBy: input.createdBy,
            status: quotation.status,
            isInternational: input.isInternational,
            contactPerson: input.contactPerson,
            contactEmail: input.contactEmail,
            contactPhone: input.contactPhone,
            destination: input.destination,
            travelDates: input.travelDates,
            adults: input.adults,
            children: input.children,
            infants: input.infants,
            hotelStarPreference: input.hotelStarPreference,
            location: input.location,
            budget: input.budget,
            currency: input.currency,
            packageIncludes: input.packageIncludes,
            packageExcludes: input.packageExcludes,
            paymentTerms: input.paymentTerms,
            cancellationPolicy: input.cancellationPolicy,
            approvalStatus: input.approvalStatus,
            lineItems: input.lineItems,
            couponCode: input.couponCode,
            couponDiscount: input.couponDiscount,
          })
          .then((res) => {
            const server = mapApiQuotation(res.quotation);
            set((s) => ({
              quotations: s.quotations.map((q) => (q.id === localId ? server : q)),
            }));
          })
          .catch(() => reportSyncFailure("Quotation"));
        return quotation;
      },

      upsertQuotation: (quotation) => {
        set((s) => {
          const idx = s.quotations.findIndex((q) => q.id === quotation.id || q.quoteNo === quotation.quoteNo);
          if (idx === -1) return { quotations: [quotation, ...s.quotations] };
          const next = [...s.quotations];
          next[idx] = { ...next[idx], ...quotation };
          return { quotations: next };
        });
      },

      updateQuotationStatus: (id, status) => {
        set((s) => ({
          quotations: s.quotations.map((q) => (q.id === id ? { ...q, status } : q)),
        }));
        api
          .setQuotationStatus(id, status)
          .catch(() => api.updateQuotation(id, { status }).catch(() => reportSyncFailure("Quotation status")));
      },

      addEmployee: async (input) => {
        const { branchId, permissions, ...employeeFields } = input;
        const localId = `em-${Date.now()}`;
        const employee: Employee = {
          ...employeeFields,
          id: localId,
          status: "Active",
          incentives: 0,
          achieved: 0,
          attendance: 95,
          joinDate: todayISO(),
        };
        set((s) => ({ employees: [employee, ...s.employees] }));
        try {
          const res = await api.createEmployee({
            name: input.name,
            email: input.email,
            phone: input.phone,
            designation: input.designation,
            department: input.department,
            branch: input.branch,
            branchId,
            role: input.role,
            salary: input.salary,
            target: input.target,
            permissions,
          });
          const server = mapApiEmployee(res.employee);
          set((s) => ({
            employees: s.employees.map((e) => (e.id === localId ? server : e)),
          }));
          return { ...server, tempPassword: res.tempPassword };
        } catch {
          reportSyncFailure("Employee");
          return employee;
        }
      },

      updateEmployee: async (id, patch) => {
        set((s) => ({ employees: s.employees.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
        try {
          await api.updateEmployee(id, patch);
        } catch {
          reportSyncFailure("Employee update");
        }
      },

      addTask: (input) => {
        const localId = `tk-${Date.now()}`;
        const task: Task = {
          ...input,
          id: localId,
          status: "To Do",
          createdAt: todayISO(),
        };
        set((s) => ({ tasks: [task, ...s.tasks] }));
        api
          .createTask({
            title: input.title,
            description: input.description,
            assignedTo: input.assignedTo,
            assignedBy: input.assignedBy,
            priority: input.priority,
            dueDate: input.dueDate,
            relatedTo: input.relatedTo,
            status: "To Do",
          })
          .then((res) => {
            const server = mapApiTask(res.task);
            set((s) => ({
              tasks: s.tasks.map((t) => (t.id === localId ? server : t)),
            }));
          })
          .catch(() => reportSyncFailure("Task"));
        return task;
      },

      updateTaskStatus: (id, status) => {
        set((s) => ({
          tasks: s.tasks.map((t) => (t.id === id ? { ...t, status } : t)),
        }));
        api.updateTask(id, { status }).catch(() => reportSyncFailure("Task update"));
      },

      addPayment: (input) => {
        const localId = `py-${Date.now()}`;
        const payment: Payment = {
          ...input,
          id: localId,
          txnId: nextTxnId(get().paymentSeq),
          status: "Success",
          date: todayISO(),
        };
        set((s) => ({
          payments: [payment, ...s.payments],
          paymentSeq: s.paymentSeq + 1,
        }));
        api
          .createPayment({
            customerName: input.customerName,
            bookingRef: input.bookingRef,
            amount: input.amount,
            method: input.method,
            type: input.type,
            gateway: input.gateway,
          })
          .then((res) => {
            const server = mapApiPayment(res.payment);
            set((s) => ({
              payments: s.payments.map((p) => (p.id === localId ? server : p)),
            }));
          })
          .catch(() => reportSyncFailure("Payment"));
        return payment;
      },

      walletTopUp: async (amount, method, payment) => {
        const res = await api.walletTransaction({
          type: "Credit",
          amount,
          source: "Top-up",
          description: `Wallet top-up via ${method}`,
          orderId: payment?.orderId,
          paymentId: payment?.paymentId,
          signature: payment?.signature,
          demo: payment?.demo === true,
        });
        set((s) => {
          const balance = res.balance;
          const txn: WalletTransaction = {
            id: res.transaction.id,
            type: "Credit",
            source: "Top-up",
            amount,
            balance,
            description: `Wallet top-up via ${method}`,
            date: todayISO(),
          };
          return { walletBalance: balance, walletTxns: [txn, ...s.walletTxns.filter((t) => t.id !== txn.id)] };
        });
      },

      walletTransfer: (amount, description) => {
        set((s) => {
          const balance = s.walletBalance - amount;
          const txn: WalletTransaction = {
            id: `wt-${Date.now()}`,
            type: "Debit",
            source: "Transfer",
            amount,
            balance,
            description,
            date: todayISO(),
          };
          return { walletBalance: balance, walletTxns: [txn, ...s.walletTxns] };
        });
        api
          .walletTransaction({
            type: "Debit",
            amount,
            source: "Transfer",
            description,
          })
          .catch(() => reportSyncFailure("Wallet transfer"));
      },

      markNotificationRead: (id) => {
        set((s) => ({
          notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
        }));
        api.markNotificationRead(id).catch(() => undefined);
      },

      markAllNotificationsRead: () => {
        set((s) => ({
          notifications: s.notifications.map((n) => ({ ...n, read: true })),
        }));
        api.markAllNotificationsRead().catch(() => undefined);
      },

      resetDemoData: () => set({ ...initialState }),

      hydrateFromApi: async (agencyId) => {
        try {
          const results = await Promise.allSettled([
            api.getBookings(),
            api.getCustomers(),
            api.getNotifications(),
            api.getLeads(),
            api.getQuotations(),
            api.getPayments(),
            api.getEmployees(agencyId),
            api.getTasks(),
            api.getDashboard(),
            api.getFinance(),
            api.getCommission(),
          ]);

          const [
            bookingsSettled,
            customersSettled,
            notificationsSettled,
            leadsSettled,
            quotationsSettled,
            paymentsSettled,
            employeesSettled,
            tasksSettled,
            dashboardSettled,
            financeSettled,
            commissionSettled,
          ] = results;

          const anyFulfilled = results.some((r) => r.status === "fulfilled");

          if (!anyFulfilled) {
            toast({
              title: "Could not refresh live data",
              description: "Showing last saved data. Check your connection and try again.",
              variant: "destructive",
            });
            return;
          }

          const patch: Partial<DemoDataState> = {};

          if (bookingsSettled.status === "fulfilled") {
            patch.bookings = (bookingsSettled.value.bookings ?? []).map(mapApiBooking);
          }
          if (customersSettled.status === "fulfilled") {
            patch.customers = (customersSettled.value.customers ?? []).map(mapApiCustomer);
          }
          if (notificationsSettled.status === "fulfilled") {
            patch.notifications = (notificationsSettled.value.notifications ?? []).map(mapApiNotification);
          }
          if (leadsSettled.status === "fulfilled") {
            patch.leads = (leadsSettled.value.leads ?? []).map(mapApiLead);
          }
          if (quotationsSettled.status === "fulfilled") {
            patch.quotations = (quotationsSettled.value.quotations ?? []).map(mapApiQuotation);
          }
          if (paymentsSettled.status === "fulfilled") {
            patch.payments = (paymentsSettled.value.payments ?? []).map(mapApiPayment);
          }
          if (employeesSettled.status === "fulfilled") {
            patch.employees = (employeesSettled.value.employees ?? []).map(mapApiEmployee);
          }
          if (tasksSettled.status === "fulfilled") {
            patch.tasks = (tasksSettled.value.tasks ?? []).map(mapApiTask);
          }

          if (dashboardSettled.status === "fulfilled" && dashboardSettled.value?.stats) {
            patch.dashboardStats = dashboardSettled.value.stats;
          }
          if (financeSettled.status === "fulfilled" && financeSettled.value?.summary) {
            patch.financeStats = mapApiFinance(financeSettled.value);
          }
          if (commissionSettled.status === "fulfilled" && commissionSettled.value?.summary) {
            patch.commissionStats = mapApiCommission(commissionSettled.value);
          }

          if (agencyId) {
            try {
              const walletRes = await api.getWallet(agencyId);
              patch.walletBalance = walletRes.balance;
              patch.walletTxns = (walletRes.transactions ?? []).map(mapApiWalletTxn);
            } catch {
              /* wallet optional */
            }
          }

          set(patch);
        } catch {
          toast({
            title: "Could not refresh live data",
            description: "Showing last saved data. Check your connection and try again.",
            variant: "destructive",
          });
        }
      },
    }),
    { name: "tpp-app-data-v2" }
  )
);
