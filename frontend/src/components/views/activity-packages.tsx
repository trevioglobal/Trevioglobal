"use client";

import { ProductCatalog, DestinationNameCell } from "@/components/shared/product-catalog";
import { ActivityBookingPicker } from "@/components/shared/activity-booking-picker";
import { PageHeader, PageShell, StatusBadge } from "@/components/shared/ui-helpers";
import type { ProductRecord } from "@/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatActivityPrice, formatProductPrice, normalizeCurrency } from "@/lib/currency";

function ApprovalStatusBadge(item: ProductRecord) {
  const status = String(item.approvalStatus || "Draft");
  const mapped =
    status === "Approved" ? "Active" :
    status === "Pending" ? "Pending" :
    status === "Rejected" ? "Cancelled" :
    "Draft";
  return <StatusBadge status={mapped} />;
}

/** Sidebar: Tours & Activities — tours catalog + book only (cars live under Cars & Transfers). */
export function ActivityPackagesView() {
  return (
    <PageShell>
      <PageHeader
        title="Tours & Activities"
        subtitle="Paid tours, tickets and experiences"
      />

      <Tabs defaultValue="catalog" className="space-y-5">
        <TabsList className="h-10 w-full max-w-md grid grid-cols-2">
          <TabsTrigger value="catalog" className="text-sm">Tours catalog</TabsTrigger>
          <TabsTrigger value="book" className="text-sm">Book for customer</TabsTrigger>
        </TabsList>

        <TabsContent value="catalog" className="mt-0">
          <ProductCatalog
            title="Tours & Activities"
            subtitle="Ticketed experiences — rope course, theme parks, city tours"
            kind="activities"
            apiPath="/api/products/activities"
            hideHeader
            embedded
            columns={[
              { key: "name", label: "Tour / Activity" },
              { key: "destination", label: "Destination", render: (i) => <DestinationNameCell item={i} /> },
              { key: "duration", label: "Duration" },
              { key: "adultPrice", label: "Adult Price", render: (i) => formatActivityPrice(i) },
              { key: "childPrice", label: "Child Price", render: (i) => formatProductPrice(Number(i.childPrice ?? 0), i.currency as string) },
              { key: "currency", label: "Currency", render: (i) => normalizeCurrency(i.currency as string) },
              { key: "rateValidTo", label: "Validity", render: (i) => String(i.rateValidTo || "—") },
              { key: "approvalStatus", label: "Approval", render: ApprovalStatusBadge },
            ]}
          />
        </TabsContent>

        <TabsContent value="book" className="mt-0">
          <ActivityBookingPicker />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
