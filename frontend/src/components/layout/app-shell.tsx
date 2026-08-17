"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { useAppStore, useAuthStore } from "@/store/app-store";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { Footer } from "@/components/layout/footer";
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { GlobalSearch } from "@/components/layout/global-search";
import { useApiSync } from "@/hooks/use-api-sync";
import { PageLoadingSkeleton } from "@/components/shared/enterprise";
import type { ViewKey } from "@/types";
import { Construction } from "lucide-react";
import { canAccessView } from "@/lib/nav-config";

const viewLoading = () => <PageLoadingSkeleton />;

const lazy = (loader: () => Promise<{ [key: string]: React.ComponentType }>, exportName: string) =>
  dynamic(() => loader().then((m) => ({ default: m[exportName] })), { loading: viewLoading });

const DashboardView = lazy(() => import("@/components/views/dashboard"), "DashboardView");
const FlightsView = lazy(() => import("@/components/views/flights"), "FlightsView");
const HotelsView = lazy(() => import("@/components/views/hotels"), "HotelsView");
const HolidayView = lazy(() => import("@/components/views/holiday"), "HolidayView");
const CrmView = lazy(() => import("@/components/views/crm"), "CrmView");
const CustomersView = lazy(() => import("@/components/views/customers"), "CustomersView");
const QuotationsView = lazy(() => import("@/components/views/quotations"), "QuotationsView");
const BookingsView = lazy(() => import("@/components/views/bookings"), "BookingsView");
const PaymentsView = lazy(() => import("@/components/views/payments"), "PaymentsView");
const WalletView = lazy(() => import("@/components/views/wallet"), "WalletView");
const CommissionView = lazy(() => import("@/components/views/commission"), "CommissionView");
const ReportsView = lazy(() => import("@/components/views/reports"), "ReportsView");
const EmployeesView = lazy(() => import("@/components/views/employees"), "EmployeesView");
const TasksView = lazy(() => import("@/components/views/tasks"), "TasksView");
const SupportView = lazy(() => import("@/components/views/support"), "SupportView");
const NotificationsView = lazy(() => import("@/components/views/notifications"), "NotificationsView");
const SettingsView = lazy(() => import("@/components/views/settings"), "SettingsView");
const AgenciesView = lazy(() => import("@/components/views/agencies"), "AgenciesView");
const BranchesView = lazy(() => import("@/components/views/branches"), "BranchesView");
const ApiMarketplaceView = lazy(() => import("@/components/views/api-marketplace"), "ApiMarketplaceView");
const ApiManagementView = lazy(() => import("@/components/views/api-management"), "ApiManagementView");
const MonitoringView = lazy(() => import("@/components/views/monitoring"), "MonitoringView");
const MarketingView = lazy(() => import("@/components/views/marketing"), "MarketingView");
const CmsView = lazy(() => import("@/components/views/cms"), "CmsView");
const FinanceView = lazy(() => import("@/components/views/finance"), "FinanceView");
const AuditLogsView = lazy(() => import("@/components/views/audit-logs"), "AuditLogsView");
const AnalyticsView = lazy(() => import("@/components/views/analytics"), "AnalyticsView");
const PackagesView = lazy(() => import("@/components/views/packages"), "PackagesView");
const TripPlannerView = lazy(() => import("@/components/views/trip-planner"), "TripPlannerView");
const BrandingView = lazy(() => import("@/components/views/branding"), "BrandingView");
const QuoteTemplatesView = lazy(() => import("@/components/views/quote-templates"), "QuoteTemplatesView");
const TravelProposalsView = lazy(() => import("@/components/views/travel-proposals"), "TravelProposalsView");
const DestinationsView = lazy(() => import("@/components/views/destinations"), "DestinationsView");
const HotelProductsView = lazy(() => import("@/components/views/hotel-products"), "HotelProductsView");
const ActivityPackagesView = lazy(() => import("@/components/views/activity-packages"), "ActivityPackagesView");
const ProductApprovalsView = lazy(() => import("@/components/views/product-approvals"), "ProductApprovalsView");
const AttendanceLeaveView = lazy(() => import("@/components/views/attendance-leave"), "AttendanceLeaveView");

const VIEW_REGISTRY: Record<ViewKey, React.ComponentType> = {
  dashboard: DashboardView,
  flights: FlightsView,
  hotels: HotelsView,
  "hotel-products": HotelProductsView,
  destinations: DestinationsView,
  packages: PackagesView,
  "activity-packages": ActivityPackagesView,
  "product-approvals": ProductApprovalsView,
  holiday: HolidayView,
  customers: CustomersView,
  crm: CrmView,
  "trip-planner": TripPlannerView,
  "travel-proposals": TravelProposalsView,
  branding: BrandingView,
  "quote-templates": QuoteTemplatesView,
  quotations: QuotationsView,
  bookings: BookingsView,
  payments: PaymentsView,
  wallet: WalletView,
  commission: CommissionView,
  reports: ReportsView,
  employees: EmployeesView,
  tasks: TasksView,
  support: SupportView,
  notifications: NotificationsView,
  settings: SettingsView,
  agencies: AgenciesView,
  branches: BranchesView,
  "api-marketplace": ApiMarketplaceView,
  "api-management": ApiManagementView,
  monitoring: MonitoringView,
  marketing: MarketingView,
  cms: CmsView,
  finance: FinanceView,
  "audit-logs": AuditLogsView,
  analytics: AnalyticsView,
  attendance: AttendanceLeaveView,
};

export function AppShell() {
  const { activeView, syncViewFromUrl } = useAppStore();
  const { user } = useAuthStore();

  useEffect(() => {
    syncViewFromUrl();
  }, [syncViewFromUrl]);

  useApiSync();

  if (!user) return null;
  const ViewComponent = canAccessView(user, activeView)
    ? VIEW_REGISTRY[activeView] || DashboardView
    : DashboardView;

  return (
    <div className="min-h-screen flex bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow-md"
      >
        Skip to main content
      </a>
      <GlobalSearch />
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main
          id="main-content"
          className="flex-1 w-full mx-auto max-w-[1600px] px-4 py-4 sm:px-6 sm:py-6 md:px-6 lg:px-8 lg:py-8 pb-24 lg:pb-8 animate-fade-in"
          tabIndex={-1}
        >
          <ViewComponent />
        </main>
        <Footer />
        <MobileTabBar />
      </div>
    </div>
  );
}

export function PlaceholderView({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <Construction className="w-12 h-12 text-muted-foreground/40 mb-4" />
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <p className="text-sm text-muted-foreground mt-1">This module is under development.</p>
    </div>
  );
}
