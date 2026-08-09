export type CouponDiscountType = "Flat" | "Percent";

export type CouponLike = {
  id: string;
  code: string;
  type: string;
  value: number;
  minOrderAmount: number;
  usageLimit: number;
  usedCount: number;
  maxDiscount: number | null;
  validFrom: Date;
  validTill: Date;
  status: string;
  agencyId: string;
};

export type CouponValidationError =
  | "NOT_FOUND"
  | "PAUSED"
  | "EXPIRED"
  | "NOT_STARTED"
  | "USAGE_EXHAUSTED"
  | "MIN_ORDER"
  | "INVALID_AMOUNT";

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function computeCouponDiscount(coupon: CouponLike, orderAmount: number): number {
  if (!Number.isFinite(orderAmount) || orderAmount <= 0) return 0;
  let discount = 0;
  if (coupon.type === "Percent") {
    discount = Math.round((orderAmount * coupon.value) / 100);
    if (coupon.maxDiscount != null && coupon.maxDiscount > 0) {
      discount = Math.min(discount, coupon.maxDiscount);
    }
  } else {
    discount = coupon.value;
  }
  return Math.max(0, Math.min(discount, orderAmount));
}

export function validateCouponForOrder(
  coupon: CouponLike | null | undefined,
  orderAmount: number,
  now = new Date()
): { ok: true; discountAmount: number } | { ok: false; error: CouponValidationError; message: string } {
  if (!coupon) {
    return { ok: false, error: "NOT_FOUND", message: "Coupon not found for this agency." };
  }
  if (coupon.status === "Paused") {
    return { ok: false, error: "PAUSED", message: "This coupon is paused." };
  }
  if (coupon.status === "Expired" || now > endOfDay(coupon.validTill)) {
    return { ok: false, error: "EXPIRED", message: "This coupon has expired." };
  }
  if (now < startOfDay(coupon.validFrom)) {
    return { ok: false, error: "NOT_STARTED", message: "This coupon is not active yet." };
  }
  if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
    return { ok: false, error: "USAGE_EXHAUSTED", message: "This coupon has reached its usage limit." };
  }
  if (!Number.isFinite(orderAmount) || orderAmount <= 0) {
    return { ok: false, error: "INVALID_AMOUNT", message: "Order amount must be greater than zero." };
  }
  if (orderAmount < coupon.minOrderAmount) {
    return {
      ok: false,
      error: "MIN_ORDER",
      message: `Minimum order amount is ₹${coupon.minOrderAmount.toLocaleString("en-IN")}.`,
    };
  }
  return { ok: true, discountAmount: computeCouponDiscount(coupon, orderAmount) };
}

export function effectiveCouponStatus(coupon: CouponLike, now = new Date()): "Active" | "Expired" | "Paused" {
  if (coupon.status === "Paused") return "Paused";
  if (coupon.status === "Expired" || now > endOfDay(coupon.validTill)) return "Expired";
  if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) return "Expired";
  return "Active";
}
