export const MODULES = [
  "flights", "hotels", "activities", "transfers", "holiday", "destinations", "packages", "bookings", "crm", "customers",
  "trip-planner", "travel-proposals", "quotations", "quote-templates", "payments", "wallet", "commission", "finance",
  "reports", "analytics", "employees", "attendance", "leaves", "tasks",
  "support", "notifications", "marketing", "cms", "api-management",
  "settings", "audit-logs", "agencies", "branches", "api-marketplace",
  "monitoring", "suppliers",
] as const;

export type Module = typeof MODULES[number];

export type Role =
  | "super_admin"
  | "agency_admin"
  | "branch_manager"
  | "employee"
  | "accountant"
  | "sales_executive"
  | "product_executive"
  | "operations"
  | "travel_agent"
  | "management";

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

const FULL_CRUD: CrudAction[] = ["view", "add", "edit", "delete"];
const SALES_CRUD: CrudAction[] = ["view", "add", "edit"];
const READ_ONLY: CrudAction[] = ["view"];

export const ROLE_CRUD: Record<Role, Record<string, CrudAction[]>> = {
  super_admin: Object.fromEntries(MODULES.map((m) => [m, FULL_CRUD])),
  agency_admin: Object.fromEntries(MODULES.map((m) => [m, FULL_CRUD])),
  branch_manager: Object.fromEntries(MODULES.map((m) => [m, SALES_CRUD])),
  employee: Object.fromEntries(MODULES.map((m) => [m, SALES_CRUD])),
  accountant: Object.fromEntries(MODULES.map((m) => [m, ["payments", "wallet", "commission", "finance", "reports"].includes(m) ? SALES_CRUD : READ_ONLY])),
  sales_executive: Object.fromEntries(MODULES.map((m) => [m, ["hotels", "activities", "transfers", "destinations", "packages", "suppliers"].includes(m) ? READ_ONLY : SALES_CRUD])),
  product_executive: Object.fromEntries(MODULES.map((m) => [m, ["hotels", "activities", "transfers", "holiday", "destinations", "packages", "suppliers"].includes(m) ? FULL_CRUD : m === "quotations" ? SALES_CRUD : READ_ONLY])),
  operations: Object.fromEntries(MODULES.map((m) => [m, ["bookings", "suppliers", "tasks", "holiday", "hotels", "activities", "transfers"].includes(m) ? SALES_CRUD : READ_ONLY])),
  travel_agent: Object.fromEntries(MODULES.map((m) => [m, ["bookings", "quotations", "payments", "customers"].includes(m) ? SALES_CRUD : READ_ONLY])),
  management: Object.fromEntries(MODULES.map((m) => [m, READ_ONLY])),
};

export interface PermissionSubject {
  role: string;
  permissions?: unknown;
}

function isModule(value: unknown): value is Module {
  return typeof value === "string" && (MODULES as readonly string[]).includes(value);
}

export function effectivePermissions(subject: PermissionSubject): Module[] {
  if (Array.isArray(subject.permissions)) {
    return subject.permissions.filter(isModule);
  }
  return ROLE_DEFAULT_PERMISSIONS[subject.role as Role] ?? [];
}

export function hasPermission(subject: PermissionSubject, module: Module): boolean {
  return effectivePermissions(subject).includes(module);
}

export function hasCrudPermission(subject: PermissionSubject, module: Module, action: CrudAction): boolean {
  if (!hasPermission(subject, module)) return false;
  const roleCrud = ROLE_CRUD[subject.role as Role]?.[module] ?? READ_ONLY;
  return roleCrud.includes(action);
}
