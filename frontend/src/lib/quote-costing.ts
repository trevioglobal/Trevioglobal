/** Display-only costing. Server `calcPackageCosting` is the source of truth on save. */

export type CostLine = {
  costPrice?: number;
  sellingPrice?: number;
  qty?: number;
  quantity?: number;
  adultRate?: number;
  childRate?: number;
  adults?: number;
  children?: number;
};

export function lineTotals(line: CostLine) {
  const qty = Number(line.qty ?? line.quantity ?? 1) || 1;
  let selling = Number(line.sellingPrice ?? 0);
  let cost = Number(line.costPrice ?? 0);
  if (line.adultRate != null || line.childRate != null) {
    selling =
      Number(line.adultRate || 0) * Number(line.adults || 0) +
      Number(line.childRate || 0) * Number(line.children || 0);
    if (!cost) cost = Math.round(selling * 0.75);
  } else {
    selling = selling * qty;
    cost = cost * qty;
  }
  return { cost, selling, profit: selling - cost };
}

export function sumServiceLines(lines: unknown): { cost: number; selling: number } {
  if (!Array.isArray(lines)) return { cost: 0, selling: 0 };
  return lines.reduce(
    (acc, line) => {
      const t = lineTotals(line as CostLine);
      return { cost: acc.cost + t.cost, selling: acc.selling + t.selling };
    },
    { cost: 0, selling: 0 },
  );
}

export function calcPackageCosting(pkg: {
  hotels?: unknown;
  flights?: unknown;
  transfers?: unknown;
  activities?: unknown;
  meals?: unknown;
  addOns?: unknown;
  visa?: { enabled?: boolean; costPrice?: number; sellingPrice?: number } | null;
  insurance?: { enabled?: boolean; costPrice?: number; sellingPrice?: number } | null;
  taxRate?: number;
  discountType?: string | null;
  discountValue?: number;
  adults?: number;
  children?: number;
  infants?: number;
}) {
  const parts = [
    sumServiceLines(pkg.hotels),
    sumServiceLines(pkg.flights),
    sumServiceLines(pkg.transfers),
    sumServiceLines(pkg.activities),
    sumServiceLines(pkg.meals),
    sumServiceLines(pkg.addOns),
  ];
  let totalNetCost = parts.reduce((s, p) => s + p.cost, 0);
  let totalSelling = parts.reduce((s, p) => s + p.selling, 0);
  if (pkg.visa?.enabled) {
    totalNetCost += Number(pkg.visa.costPrice || 0);
    totalSelling += Number(pkg.visa.sellingPrice || 0);
  }
  if (pkg.insurance?.enabled) {
    totalNetCost += Number(pkg.insurance.costPrice || 0);
    totalSelling += Number(pkg.insurance.sellingPrice || 0);
  }

  let discountAmount = 0;
  if (pkg.discountType === "Percentage") {
    discountAmount = Math.round(totalSelling * (Number(pkg.discountValue || 0) / 100));
  } else if (pkg.discountType === "Fixed") {
    discountAmount = Math.round(Number(pkg.discountValue || 0));
  }
  discountAmount = Math.min(discountAmount, totalSelling);
  const afterDiscount = totalSelling - discountAmount;
  const taxRate = Number(pkg.taxRate ?? 18);
  const gst = Math.round(afterDiscount * (taxRate / (100 + taxRate)));
  const taxableAmount = afterDiscount - gst;
  const grossProfit = afterDiscount - totalNetCost;
  const profitMargin = afterDiscount > 0 ? (grossProfit / afterDiscount) * 100 : 0;
  const pax = Math.max(1, Number(pkg.adults || 0) + Number(pkg.children || 0));
  const perPersonCost = Math.round(afterDiscount / pax);

  return {
    totalNetCost,
    totalSelling: afterDiscount,
    grossProfit,
    profitMargin: Math.round(profitMargin * 100) / 100,
    discountAmount,
    taxableAmount,
    gst,
    total: afterDiscount,
    perPersonCost,
  };
}
