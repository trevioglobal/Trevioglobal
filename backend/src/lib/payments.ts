const OFFLINE_METHODS = new Set(["Cash", "Bank Transfer", "Cheque"]);

export function isOfflinePaymentMethod(method: string | undefined): boolean {
  return OFFLINE_METHODS.has(String(method || ""));
}

/** Gateway methods may only be Success after Razorpay verification. Offline collection defaults to Success. */
export function bookkeepingPaymentStatus(method: string | undefined, requested?: string): "Success" | "Pending" | "Failed" | "Refunded" {
  if (requested === "Failed" || requested === "Refunded") return requested;
  if (isOfflinePaymentMethod(method)) return requested === "Pending" ? "Pending" : "Success";
  return "Pending";
}
