"use client";

import { ProductCatalog, DestinationNameCell } from "@/components/shared/product-catalog";
import { StatusBadge } from "@/components/shared/ui-helpers";
import type { ProductRecord } from "@/types";

function ApprovalStatusBadge(item: ProductRecord) {
  const status = String(item.approvalStatus || "Draft");
  const mapped =
    status === "Approved" ? "Active" :
    status === "Pending" ? "Pending" :
    status === "Rejected" ? "Cancelled" :
    "Draft";
  return <StatusBadge status={mapped} />;
}

function RoomCountCell(item: ProductRecord) {
  const rooms = Array.isArray(item.roomCategories) ? item.roomCategories.length : 0;
  return rooms ? `${rooms} room${rooms === 1 ? "" : "s"}` : "—";
}

function ContractCell(item: ProductRecord) {
  const start = item.contractStart ? String(item.contractStart) : "";
  const end = item.contractEnd ? String(item.contractEnd) : "";
  if (!start && !end) return "—";
  return `${start || "…"} → ${end || "…"}`;
}

export function HotelProductsView() {
  return (
    <ProductCatalog
      title="Hotels"
      subtitle="Rooms, rates and contacts"
      kind="hotels"
      apiPath="/api/products/hotels"
      columns={[
        { key: "name", label: "Hotel Name" },
        { key: "starCategory", label: "Stars", render: (i) => `${i.starCategory ?? 3}★` },
        { key: "country", label: "Country" },
        { key: "city", label: "City" },
        { key: "destination", label: "Destination", render: (i) => <DestinationNameCell item={i} /> },
        { key: "roomCategories", label: "Rooms", render: RoomCountCell },
        { key: "contractEnd", label: "Contract", render: ContractCell },
        { key: "currency", label: "Currency" },
        { key: "approvalStatus", label: "Approval", render: ApprovalStatusBadge },
      ]}
    />
  );
}
