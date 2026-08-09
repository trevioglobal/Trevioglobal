import type { Module, Role, User } from "@/types";

export const MODULES: Module[] = [
  "flights", "hotels", "activities", "transfers", "holiday", "destinations", "packages", "bookings", "crm", "customers",
  "trip-planner", "travel-proposals", "quotations", "quote-templates", "payments", "wallet", "commission", "finance",
  "reports", "analytics", "employees", "attendance", "leaves", "tasks",
  "support", "notifications", "marketing", "cms", "api-management",
  "settings", "audit-logs", "agencies", "branches", "api-marketplace",
  "monitoring", "suppliers",
];

export type CrudAction = "view" | "add" | "edit" | "delete";

export const ROLE_DEFAULT_PERMISSIONS: Record<Role, Module[]> = {
  super_admin: [...MODULES],
  agency_admin: [
    "flights", "hotels", "activities", "transfers", "holiday", "destinations", "packages", "bookings", "crm", "customers",
    "trip-planner", "travel-proposals", "quotations", "quote-templates", "payments", "wallet", "commission", "finance",
    "reports", "analytics", "employees", "attendance", "leaves", "tasks", "support",
    "notifications", "marketing", "cms", "api-management",
    "settings", "audit-logs", "branches", "suppliers",
  ],
  branch_manager: [
    "flights", "hotels", "activities", "transfers", "holiday", "destinations", "packages", "bookings", "crm", "customers",
    "trip-planner", "travel-proposals", "quotations", "payments", "reports", "employees", "attendance",
    "leaves", "tasks", "support", "notifications",
  ],
  employee: [
    "flights", "hotels", "activities", "transfers", "holiday", "destinations", "packages", "bookings", "crm", "customers",
    "trip-planner", "travel-proposals", "quotations", "payments", "reports", "tasks", "support",
    "notifications", "attendance", "leaves",
  ],
  accountant: [
    "payments", "wallet", "commission", "finance", "reports",
    "attendance", "leaves", "support", "notifications",
  ],
  sales_executive: [
    "flights", "hotels", "activities", "transfers", "holiday", "destinations", "packages", "bookings", "crm", "customers",
    "trip-planner", "travel-proposals", "quotations", "payments", "tasks", "support", "notifications", "attendance", "leaves",
  ],
  product_executive: [
    "hotels", "activities", "transfers", "holiday", "destinations", "packages", "suppliers", "quotations", "notifications",
  ],
  operations: [
    "bookings", "holiday", "hotels", "activities", "transfers", "suppliers", "tasks", "customers",
    "support", "notifications", "attendance", "leaves",
  ],
  travel_agent: [
    "bookings", "quotations", "payments", "customers", "notifications", "travel-proposals",
  ],
  management: [
    "bookings", "crm", "customers", "quotations", "payments", "finance", "reports", "analytics",
    "employees", "tasks", "notifications", "audit-logs", "commission",
  ],
};

const FULL: CrudAction[] = ["view", "add", "edit", "delete"];
const SALES: CrudAction[] = ["view", "add", "edit"];
const READ: CrudAction[] = ["view"];

export const ROLE_CRUD: Record<Role, Record<string, CrudAction[]>> = {
  super_admin: Object.fromEntries(MODULES.map((m) => [m, FULL])),
  agency_admin: Object.fromEntries(MODULES.map((m) => [m, FULL])),
  branch_manager: Object.fromEntries(MODULES.map((m) => [m, SALES])),
  employee: Object.fromEntries(MODULES.map((m) => [m, SALES])),
  accountant: Object.fromEntries(MODULES.map((m) => [m, ["payments", "wallet", "commission", "finance", "reports"].includes(m) ? SALES : READ])),
  sales_executive: Object.fromEntries(MODULES.map((m) => [m, ["hotels", "activities", "transfers", "destinations", "packages", "suppliers"].includes(m) ? READ : SALES])),
  product_executive: Object.fromEntries(MODULES.map((m) => [m, ["hotels", "activities", "transfers", "holiday", "destinations", "packages", "suppliers"].includes(m) ? FULL : m === "quotations" ? SALES : READ])),
  operations: Object.fromEntries(MODULES.map((m) => [m, ["bookings", "suppliers", "tasks", "holiday", "hotels", "activities", "transfers"].includes(m) ? SALES : READ])),
  travel_agent: Object.fromEntries(MODULES.map((m) => [m, ["bookings", "quotations", "payments", "customers"].includes(m) ? SALES : READ])),
  management: Object.fromEntries(MODULES.map((m) => [m, READ])),
};

export function effectivePermissions(user: Pick<User, "role" | "permissions">): Module[] {
  return user.permissions ?? ROLE_DEFAULT_PERMISSIONS[user.role];
}

export function hasPermission(user: Pick<User, "role" | "permissions">, module: Module): boolean {
  return effectivePermissions(user).includes(module);
}

export function hasCrudPermission(user: Pick<User, "role" | "permissions">, module: Module, action: CrudAction): boolean {
  if (!hasPermission(user, module)) return false;
  return (ROLE_CRUD[user.role]?.[module] ?? READ).includes(action);
}

export const MODULE_LABELS: Record<Module, string> = {
  flights: "Flights", hotels: "Hotels", activities: "Activities", transfers: "Transfers",
  holiday: "Holiday Packages", destinations: "Destinations", packages: "Package Builder", bookings: "Booking Management", crm: "CRM / Leads", customers: "Customers",
  "trip-planner": "Trip Planner", "travel-proposals": "Travel Proposals", quotations: "Quotations", "quote-templates": "Quote Templates", payments: "Payments", wallet: "Wallet",
  commission: "Commission", finance: "Finance / GST", reports: "Reports & Analytics",
  analytics: "Platform Analytics", employees: "Employees", attendance: "Attendance",
  leaves: "Leave Approvals", tasks: "Task Management", support: "Support",
  notifications: "Notifications", marketing: "Marketing", cms: "CMS",
  "api-management": "API Management", settings: "Settings", "audit-logs": "Audit Logs",
  agencies: "Agency Management", branches: "Branches", "api-marketplace": "API Marketplace",
  monitoring: "Monitoring", suppliers: "Supplier Management",
};
