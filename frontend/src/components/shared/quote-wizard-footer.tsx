"use client";

import { ChevronLeft, ChevronRight, FileDown, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function QuoteWizardFooter({
  busy,
  onBack,
  onSaveDraft,
  onNext,
  nextLabel,
  showNext = true,
  onCreatePdf,
  onSend,
  meta,
  error,
  className,
}: {
  busy?: boolean;
  onBack?: () => void;
  onSaveDraft?: () => void | Promise<void>;
  onNext?: () => void;
  nextLabel?: string;
  showNext?: boolean;
  onCreatePdf?: () => void | Promise<void>;
  onSend?: () => void | Promise<void>;
  meta?: React.ReactNode;
  error?: string | null;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "shrink-0 border-t bg-card",
        className,
      )}
    >
      <div className="px-4 sm:px-5 py-3 space-y-3">
        {meta}
        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {onBack ? (
              <Button type="button" variant="outline" size="sm" disabled={busy} className="h-8" onClick={onBack}>
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
            ) : null}
            {onSaveDraft ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                className="h-8"
                onClick={() => void onSaveDraft()}
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
                Save draft
              </Button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {onCreatePdf ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                className="h-8"
                onClick={() => void onCreatePdf()}
              >
                <FileDown className="w-3.5 h-3.5 mr-1.5" />
                PDF
              </Button>
            ) : null}
            {onSend ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                className="h-8"
                onClick={() => void onSend()}
              >
                <Send className="w-3.5 h-3.5 mr-1.5" />
                Send quotation
              </Button>
            ) : null}
            {showNext && onNext ? (
              <Button type="button" size="sm" disabled={busy} className="h-8" onClick={onNext}>
                {nextLabel || "Next"}
                <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
