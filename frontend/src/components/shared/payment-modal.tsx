"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  CreditCard, Wallet, Building2, Loader2, ShieldCheck, CheckCircle2, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useDemoDataStore } from "@/store/demo-data-store";
import { payWithRazorpay } from "@/lib/razorpay";
import { ShareTicket } from "@/components/shared/share-ticket";
import { formatFullINR } from "@/components/shared/ui-helpers";

export type BookingPaymentMethod = "Razorpay" | "Wallet";

export function PaymentModal({
  open, amount, title, description, shareSubject, shareText, onClose, onSuccess,
}: {
  open: boolean;
  amount: number;
  title: string;
  description: string;
  shareSubject: string;
  shareText: string;
  onClose: () => void;
  onSuccess: (method: BookingPaymentMethod) => void;
}) {
  const { toast } = useToast();
  const walletBalance = useDemoDataStore((s) => s.walletBalance);
  const walletTransfer = useDemoDataStore((s) => s.walletTransfer);
  const [method, setMethod] = useState<"card" | "upi" | "netbanking" | "wallet">("card");
  const [processing, setProcessing] = useState(false);
  const [paidVia, setPaidVia] = useState<BookingPaymentMethod | null>(null);

  const insufficientWallet = amount > walletBalance;

  const reset = () => {
    setProcessing(false);
    setPaidVia(null);
    setMethod("card");
  };

  const handlePay = async () => {
    if (method === "wallet") {
      if (insufficientWallet) {
        toast({ title: "Insufficient wallet balance", description: `Your wallet has ${formatFullINR(walletBalance)}, but this booking costs ${formatFullINR(amount)}.`, variant: "destructive" });
        return;
      }
      setProcessing(true);
      walletTransfer(amount, description);
      setTimeout(() => {
        setProcessing(false);
        setPaidVia("Wallet");
        onSuccess("Wallet");
      }, 700);
      return;
    }

    setProcessing(true);
    const result = await payWithRazorpay({ amount, name: "TravelPro", description });
    setProcessing(false);
    if (!result.success) {
      toast({
        title: "Payment cancelled or failed",
        description: result.error || "No amount was charged.",
        variant: "destructive",
      });
      return;
    }
    if (result.demo) {
      toast({ title: "Checkout not configured", description: "Razorpay live keys are not set — this booking was recorded without a charge." });
    }
    setPaidVia("Razorpay");
    onSuccess("Razorpay");
  };

  const handleClose = (o: boolean) => {
    if (!o && !processing) {
      onClose();
      setTimeout(reset, 200);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md" showCloseButton={!processing}>
        {paidVia ? (
          <div className="py-6 text-center space-y-4">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 220, damping: 14 }}
              className="mx-auto w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-500/15 flex items-center justify-center"
            >
              <CheckCircle2 className="w-9 h-9 text-emerald-600 dark:text-emerald-400" />
            </motion.div>
            <div>
              <h3 className="text-lg font-semibold">Booking Confirmed!</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {formatFullINR(amount)} paid via {paidVia === "Wallet" ? "Agency Wallet" : "Razorpay"}.
              </p>
            </div>
            <div className="pt-1">
              <p className="text-xs text-muted-foreground mb-2">Share this ticket with the customer</p>
              <ShareTicket subject={shareSubject} text={shareText} />
            </div>
            <Button variant="outline" size="sm" onClick={() => handleClose(false)}>Done</Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center text-white">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <DialogTitle className="text-base">Secure Payment</DialogTitle>
                  <DialogDescription>{title}</DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="rounded-lg bg-gradient-to-r from-teal-50 to-emerald-50 dark:from-teal-950/30 dark:to-emerald-950/30 border border-teal-200 dark:border-teal-900 p-4 text-center">
              <p className="text-xs text-muted-foreground">Amount Payable</p>
              <p className="text-3xl font-bold text-teal-700 dark:text-teal-300 mt-1">{formatFullINR(amount)}</p>
            </div>

            <Tabs value={method} onValueChange={(v) => setMethod(v as typeof method)}>
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="card"><CreditCard className="w-3.5 h-3.5 mr-1" /> Card</TabsTrigger>
                <TabsTrigger value="upi"><Wallet className="w-3.5 h-3.5 mr-1" /> UPI</TabsTrigger>
                <TabsTrigger value="netbanking"><Building2 className="w-3.5 h-3.5 mr-1" /> Net</TabsTrigger>
                <TabsTrigger value="wallet"><Wallet className="w-3.5 h-3.5 mr-1" /> Wallet</TabsTrigger>
              </TabsList>
              <TabsContent value="card" className="space-y-3 mt-3">
                <Input placeholder="Card Number • 4111 1111 1111 1111" />
                <div className="grid grid-cols-2 gap-2"><Input placeholder="MM / YY" /><Input placeholder="CVV" /></div>
              </TabsContent>
              <TabsContent value="upi" className="space-y-3 mt-3">
                <Input placeholder="yourname@upi" />
              </TabsContent>
              <TabsContent value="netbanking" className="space-y-2 mt-3">
                {["HDFC Bank", "ICICI Bank", "State Bank of India", "Axis Bank"].map((b) => (
                  <label key={b} className="flex items-center gap-2 p-2 rounded-md border cursor-pointer hover:bg-muted/50 text-sm">
                    <input type="radio" name="pm-nb" defaultChecked={b === "HDFC Bank"} className="accent-teal-600" />
                    {b}
                  </label>
                ))}
              </TabsContent>
              <TabsContent value="wallet" className="space-y-2 mt-3">
                <div className="rounded-lg border p-3 text-sm flex items-center justify-between">
                  <span className="text-muted-foreground">Agency wallet balance</span>
                  <span className="font-semibold">{formatFullINR(walletBalance)}</span>
                </div>
                {insufficientWallet && (
                  <p className="text-xs text-rose-600 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" /> Insufficient balance for this booking. Top up the wallet first.
                  </p>
                )}
              </TabsContent>
            </Tabs>

            <DialogFooter>
              <Button
                className="w-full h-11"
                onClick={handlePay}
                disabled={processing || (method === "wallet" && insufficientWallet)}
              >
                {processing ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</> : <>Pay {formatFullINR(amount)}</>}
              </Button>
            </DialogFooter>
            <p className="text-[11px] text-muted-foreground text-center flex items-center justify-center gap-1">
              <ShieldCheck className="w-3 h-3" /> 256-bit encrypted. Runs in demo mode until a real gateway key is configured.
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
