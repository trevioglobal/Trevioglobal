"use client";

import { useMemo, useState } from "react";
import { Check, Clock, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  activityPlaceholderImage,
  asActivityStringList,
  defaultTourExclusions,
  defaultTourInclusions,
  formatActivityTimingBar,
  isTourActivity,
} from "@/lib/activity-catalog";
import { cn } from "@/lib/utils";

export type ActivityDetailsSource = {
  id?: string;
  name?: string | null;
  description?: string | null;
  images?: unknown;
  startTime?: string | null;
  closingTime?: string | null;
  duration?: string | null;
  operatingHours?: string | null;
  timeSlot?: string | null;
  location?: string | null;
  city?: string | null;
  ticketType?: string | null;
  activityCategory?: string | null;
  inclusions?: unknown;
  exclusions?: unknown;
  passengerInfo?: string | null;
  meetingPoint?: string | null;
  cancellationPolicy?: string | null;
};

type TabId = "description" | "about" | "inclusions" | "restrictions" | "recommendation";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "description", label: "Description" },
  { id: "about", label: "About" },
  { id: "inclusions", label: "Inclusions & Exclusions" },
  { id: "restrictions", label: "Restrictions" },
  { id: "recommendation", label: "Recommendation" },
];

function activityImages(item: ActivityDetailsSource): string[] {
  const raw = Array.isArray(item.images) ? item.images.map((v) => String(v || "").trim()).filter(Boolean) : [];
  if (raw.length) return raw;
  const placeholder = activityPlaceholderImage();
  return [placeholder, placeholder, placeholder, placeholder, placeholder];
}

export function ActivityDetailsDialog({
  open,
  onOpenChange,
  activity,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activity: ActivityDetailsSource | null;
}) {
  const [tab, setTab] = useState<TabId>("inclusions");
  const [activeImage, setActiveImage] = useState(0);

  const images = useMemo(() => (activity ? activityImages(activity) : []), [activity]);
  const timing = activity ? formatActivityTimingBar(activity) : "";
  const title = String(activity?.name || "Activity").trim();
  const description = String(activity?.description || "").trim();
  const location = String(activity?.location || activity?.city || "").trim();

  const inclusions = useMemo(() => {
    if (!activity) return [];
    const listed = asActivityStringList(activity.inclusions);
    if (listed.length) return listed;
    if (isTourActivity(activity)) return defaultTourInclusions(activity);
    return ["As per supplier confirmation"];
  }, [activity]);

  const exclusions = useMemo(() => {
    if (!activity) return [];
    const listed = asActivityStringList(activity.exclusions);
    if (listed.length) return listed;
    if (isTourActivity(activity)) return defaultTourExclusions(activity);
    return ["Personal expenses", "Anything not mentioned in inclusions"];
  }, [activity]);

  const hero = images[Math.min(activeImage, Math.max(0, images.length - 1))] || activityPlaceholderImage();

  return (
    <Dialog
      open={open && Boolean(activity)}
      onOpenChange={(next) => {
        if (!next) {
          setTab("inclusions");
          setActiveImage(0);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent
        className="max-w-3xl p-0 gap-0 overflow-hidden border-slate-200 sm:rounded-2xl"
        showCloseButton
      >
        <DialogTitle className="sr-only">{title} details</DialogTitle>
        {activity ? (
          <div className="max-h-[min(90vh,880px)] overflow-y-auto">
            <div className="relative aspect-[16/8] bg-slate-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={hero} alt="" className="absolute inset-0 w-full h-full object-cover" />
            </div>

            {images.length > 1 ? (
              <div className="flex justify-center gap-2 px-4 py-3 bg-white">
                {images.slice(0, 5).map((src, i) => (
                  <button
                    key={`${src}-${i}`}
                    type="button"
                    onClick={() => setActiveImage(i)}
                    className={cn(
                      "h-14 w-14 rounded-md overflow-hidden border-2 transition-colors",
                      i === activeImage ? "border-slate-900" : "border-transparent opacity-80 hover:opacity-100",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            ) : null}

            <div className="px-5 sm:px-6 pb-6 space-y-4">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 pt-1">{title}</h2>

              <div className="rounded-xl bg-slate-100/90 px-4 py-3 flex items-start gap-2.5">
                <Clock className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                <div className="min-w-0 text-sm">
                  <p className="font-semibold text-slate-900">Timing &amp; Duration</p>
                  <p className="text-slate-500 mt-0.5">{timing}</p>
                </div>
              </div>

              <div className="border-b border-slate-200 overflow-x-auto">
                <div className="flex gap-5 min-w-max">
                  {TABS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTab(t.id)}
                      className={cn(
                        "pb-2.5 text-sm whitespace-nowrap border-b-2 transition-colors",
                        tab === t.id
                          ? "border-slate-900 font-semibold text-slate-900"
                          : "border-transparent text-slate-500 hover:text-slate-800",
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {tab === "description" ? (
                <div className="text-sm text-slate-600 leading-relaxed space-y-2">
                  <p>{description || "Details will be confirmed with the supplier."}</p>
                  {location ? <p className="text-slate-500">Location: {location}</p> : null}
                </div>
              ) : null}

              {tab === "about" ? (
                <div className="text-sm text-slate-600 leading-relaxed space-y-2">
                  <p>
                    {description
                      || `${title} is a contracted activity available for this destination.`}
                  </p>
                  {activity.meetingPoint ? (
                    <p>Meeting point: {String(activity.meetingPoint)}</p>
                  ) : null}
                  {activity.passengerInfo ? (
                    <p>
                      <span className="font-medium text-slate-800">Guest instructions: </span>
                      {String(activity.passengerInfo)}
                    </p>
                  ) : null}
                  {activity.ticketType || activity.activityCategory ? (
                    <p className="text-slate-500">
                      Category: {String(activity.ticketType || activity.activityCategory)}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {tab === "inclusions" ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
                  <div>
                    <p className="text-sm font-bold tracking-wide text-emerald-600 mb-3">INCLUSIONS</p>
                    <ul className="space-y-2.5">
                      {inclusions.map((line) => (
                        <li key={line} className="flex items-start gap-2 text-sm text-slate-700">
                          <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" strokeWidth={2.5} />
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-sm font-bold tracking-wide text-rose-600 mb-3">EXCLUSIONS</p>
                    <ul className="space-y-2.5">
                      {exclusions.map((line) => (
                        <li key={line} className="flex items-start gap-2 text-sm text-slate-700">
                          <X className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" strokeWidth={2.5} />
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : null}

              {tab === "restrictions" ? (
                <div className="text-sm text-slate-600 leading-relaxed space-y-2">
                  <p>{String(activity.cancellationPolicy || "").trim() || "Subject to supplier blackout dates and local operating conditions."}</p>
                  <p>Children and infant policies follow the contracted rate sheet unless noted otherwise.</p>
                </div>
              ) : null}

              {tab === "recommendation" ? (
                <div className="text-sm text-slate-600 leading-relaxed space-y-2">
                  <p>Book early for peak dates. Confirm pickup time with your guests the day before.</p>
                  {/optional|entrance/i.test(title) ? (
                    <p>Entrance tickets marked optional can be added separately if guests want them.</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
