"use client";

import { ProductCatalog, DestinationNameCell } from "@/components/shared/product-catalog";
import { StatusBadge } from "@/components/shared/ui-helpers";
import type { ProductRecord } from "@/types";
import { formatTransferPrice, normalizeCurrency } from "@/lib/currency";

function ApprovalStatusBadge(item: ProductRecord) {
  const status = String(item.approvalStatus || "Draft");
  const mapped =
    status === "Approved" ? "Active" :
    status === "Pending" ? "Pending" :
    status === "Rejected" ? "Cancelled" :
    "Draft";
  return <StatusBadge status={mapped} />;
}

/** Sidebar: Cars & Transfers — dedicated page (not shared with Tours). */
export function TransferProductsView() {
  return (
    <ProductCatalog
      title="Cars & Transfers"
      subtitle="Airport pickup, private cars and city transfers"
      kind="transfers"
      apiPath="/api/products/transfers"
      columns={[
        { key: "name", label: "Transfer" },
        { key: "transferType", label: "Shared/Private" },
        { key: "vehicleType", label: "Vehicle Type" },
        { key: "destination", label: "Destination", render: (i) => <DestinationNameCell item={i} /> },
        { key: "privatePrice", label: "Price", render: (i) => formatTransferPrice(i) },
        { key: "currency", label: "Currency", render: (i) => normalizeCurrency(i.currency as string) },
        { key: "rateValidTo", label: "Validity", render: (i) => String(i.rateValidTo || "—") },
        { key: "approvalStatus", label: "Approval", render: ApprovalStatusBadge },
      ]}
    />
  );
}
