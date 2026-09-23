import { db } from "./db.js";

export async function adjustAgencyWallet(opts: {
  agencyId: string;
  type: "Credit" | "Debit";
  amount: number;
  source: string;
  description: string;
  paymentRef?: string;
}) {
  const amount = Math.round(Number(opts.amount) || 0);
  if (amount <= 0) throw new Error("Wallet amount must be positive");
  if (!opts.agencyId) throw new Error("agencyId required");

  return db.$transaction(async (tx) => {
    if (opts.paymentRef) {
      const existing = await tx.walletTransaction.findUnique({ where: { paymentRef: opts.paymentRef } });
      if (existing) {
        return { balance: existing.balance, transaction: existing, idempotent: true as const };
      }
    }
    const agency = await tx.agency.findUnique({ where: { id: opts.agencyId } });
    if (!agency) throw new Error("Agency not found");
    const delta = opts.type === "Credit" ? amount : -amount;
    const balance = (agency.walletBalance ?? 0) + delta;
    if (balance < 0) throw new Error("Insufficient wallet balance");
    await tx.agency.update({
      where: { id: opts.agencyId },
      data: { walletBalance: balance },
    });
    const txn = await tx.walletTransaction.create({
      data: {
        agencyId: opts.agencyId,
        type: opts.type,
        source: opts.source,
        amount,
        balance,
        description: opts.description,
        paymentRef: opts.paymentRef,
      },
    });
    return { balance, transaction: txn, idempotent: false as const };
  });
}
