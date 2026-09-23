"use client";

import {
  LayoutDashboard, Plane, Hotel, MapPin, Package, Globe, Layers,
  Users, Target, FileSpreadsheet, Ticket, CreditCard, Wallet, Percent,
  BarChart3, UserCog, CheckSquare, LifeBuoy, Bell, Megaphone,
  Receipt, Settings, History, Building2, GitBranch,
  Activity, LineChart, CalendarCheck, CheckCircle, Palette, FileText,
  Landmark, Car, type LucideIcon,
} from "lucide-react";
import type { Module, Role, User, ViewKey } from "@/types";
import { hasPermission } from "@/lib/permissions";
import { canBookProduct } from "@/lib/product-access";
import { isMockInventoryEnabled, isStubModulesEnabled } from "@/lib/runtime-mode";

export interface NavItem {
  key: ViewKey;
  label: string;
  icon: LucideIcon;
  module?: Module; // omitted for views everyone can always reach (e.g. dashboard)
  roles?: Role[]; // if set, only these roles see the item
  badge?: string;
  /** When true, item is only shown if mock inventory is enabled (demo flights/hotels). */
  mockInventoryOnly?: boolean;
  /** When true, item is only shown when stub/demo modules are enabled. */
  stubOnly?: boolean;
  /** Internal catalogue/rate management. Hidden from agents and customers. */
  internalOnly?: boolean;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Overview",
    items: [
      { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    title: "Bookings",
    items: [
      { key: "flights", label: "Flights", icon: Plane, module: "flights" },
      { key: "hotels", label: "Hotels", icon: Hotel, module: "hotels" },
      { key: "bookings", label: "Booking Management", icon: Ticket, module: "bookings" },
    ],
  },
  {
    title: "Products",
    items: [
      { key: "destinations", label: "Destinations", icon: Globe, module: "destinations" },
      { key: "itinerary-places", label: "Sightseeing Places", icon: Landmark, module: "destinations", internalOnly: true },
      { key: "hotel-products", label: "Hotels", icon: Hotel, module: "hotels", internalOnly: true },
      { key: "transfer-products", label: "Cars & Transfers", icon: Car, module: "activities", internalOnly: true },
      { key: "activity-packages", label: "Tours & Activities", icon: Ticket, module: "activities", internalOnly: true },
      { key: "contracted-rates", label: "Contracted Rates", icon: Receipt, module: "hotels", internalOnly: true },
      { key: "packages", label: "Packages", icon: Layers, module: "packages" },
      { key: "product-approvals", label: "Rate Approvals", icon: CheckCircle, module: "activities", roles: ["super_admin", "agency_admin"] },
    ],
  },
  {
    title: "Sales & CRM",
    items: [
      { key: "crm", label: "CRM / Leads", icon: Target, module: "crm" },
      { key: "customers", label: "Customers", icon: Users, module: "customers" },
      { key: "trip-planner", label: "Trip Planner", icon: MapPin, module: "trip-planner" },
      { key: "travel-proposals", label: "Travel Proposals", icon: FileSpreadsheet, module: "travel-proposals" },
      { key: "quotations", label: "Quotations", icon: FileSpreadsheet, module: "quotations" },
    ],
  },
  {
    title: "Finance",
    items: [
      { key: "payments", label: "Payments", icon: CreditCard, module: "payments" },
      { key: "wallet", label: "Wallet", icon: Wallet, module: "wallet" },
      { key: "commission", label: "Commission", icon: Percent, module: "commission" },
      { key: "finance", label: "Finance / GST", icon: Receipt, module: "finance" },
    ],
  },
  {
    title: "Insights",
    items: [
      { key: "reports", label: "Reports & Analytics", icon: BarChart3, module: "reports" },
      { key: "analytics", label: "Platform Analytics", icon: LineChart, module: "analytics", roles: ["super_admin"] },
    ],
  },
  {
    title: "Team & Ops",
    items: [
      { key: "employees", label: "Employees", icon: UserCog, module: "employees" },
      { key: "attendance", label: "Attendance & Leave", icon: CalendarCheck, module: "attendance" },
      { key: "tasks", label: "Task Management", icon: CheckSquare, module: "tasks" },
      { key: "suppliers", label: "Suppliers", icon: Building2, module: "suppliers" },
      { key: "support", label: "Support", icon: LifeBuoy, module: "support" },
      { key: "notifications", label: "Notifications", icon: Bell, module: "notifications" },
    ],
  },
  {
    title: "Settings",
    items: [
      { key: "branding", label: "Branding", icon: Palette, module: "quote-templates" },
      { key: "quote-templates", label: "Quote Templates", icon: FileText, module: "quote-templates" },
    ],
  },
  {
    title: "Platform",
    items: [
      { key: "agencies", label: "Agency Management", icon: Building2, module: "agencies" },
      { key: "branches", label: "Branches", icon: GitBranch, module: "branches" },
      { key: "monitoring", label: "Monitoring", icon: Activity, module: "monitoring", roles: ["super_admin"] },
      { key: "marketing", label: "Coupons", icon: Megaphone, module: "marketing" },
      { key: "audit-logs", label: "Audit Logs", icon: History, module: "audit-logs" },
      { key: "settings", label: "Settings", icon: Settings, module: "settings" },
    ],
  },
];

export function getNavForUser(user: Pick<User, "role" | "permissions" | "productAccess">): NavSection[] {
  const mockOk = isMockInventoryEnabled();
  const stubsOk = isStubModulesEnabled();
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (item.mockInventoryOnly && !mockOk) return false;
      if (item.stubOnly && !stubsOk) return false;
      if (item.internalOnly && (user.role === "travel_agent")) return false;
      if (item.roles && !item.roles.includes(user.role)) return false;
      if (user.role === "travel_agent") {
        if (item.key === "flights" && !canBookProduct(user, "flights")) return false;
        if (item.key === "hotels" && !canBookProduct(user, "hotels")) return false;
        if (item.key === "packages" && !canBookProduct(user, "packages")) return false;
      }
      return !item.module || hasPermission(user, item.module);
    }).map((item) => (
      user.role === "travel_agent" && item.key === "crm"
        ? { ...item, label: "My Enquiries" }
        : item
    )),
  })).filter((section) => section.items.length > 0);
}

export function canAccessView(user: Pick<User, "role" | "permissions" | "productAccess">, view: ViewKey): boolean {
  // Wizard is opened from Quotations — same permission gate, not a sidebar item.
  if (view === "quotation-wizard") {
    return canAccessView(user, "quotations");
  }
  const mockOk = isMockInventoryEnabled();
  const stubsOk = isStubModulesEnabled();
  return NAV_SECTIONS.some((section) =>
    section.items.some((item) => {
      if (item.key !== view) return false;
      if (item.mockInventoryOnly && !mockOk) return false;
      if (item.stubOnly && !stubsOk) return false;
      if (item.internalOnly && (user.role === "travel_agent")) return false;
      if (item.roles && !item.roles.includes(user.role)) return false;
      if (user.role === "travel_agent") {
        if (item.key === "flights" && !canBookProduct(user, "flights")) return false;
        if (item.key === "hotels" && !canBookProduct(user, "hotels")) return false;
        if (item.key === "packages" && !canBookProduct(user, "packages")) return false;
      }
      return !item.module || hasPermission(user, item.module);
    })
  );
}

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Admin",
  agency_admin: "Admin",
  branch_manager: "Branch Manager",
  employee: "Employee / Agent",
  accountant: "Finance",
  sales_executive: "Sales Executive",
  product_executive: "Product Executive",
  operations: "Operations",
  travel_agent: "Travel Agent",
  team_lead: "Team Lead",
  management: "Management",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  super_admin: "Platform owner — manage all agencies, APIs & billing",
  agency_admin: "Agency owner — full control of your travel agency",
  branch_manager: "Manage a branch — oversee staff & approvals",
  employee: "Travel consultant — handle bookings & leads",
  accountant: "Finance staff — payments, GST & settlements",
  sales_executive: "Sales team — customers, quotations & bookings",
  product_executive: "Product team — manage hotels, activities & transfers",
  operations: "Operations team — confirm services, vouchers & suppliers",
  travel_agent: "B2B agency partner — book flights/hotels/packages for clients, or send quotes for Trevio ops to fulfill",
  team_lead: "Approves quotations before they can be sent. Cannot send a quote that is still pending.",
  management: "Leadership — dashboards, reports & approvals",
};
