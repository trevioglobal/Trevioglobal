"use client";

import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "#solutions", label: "Solutions" },
  { href: "#why-trevio", label: "Why Trevio" },
  { href: "#how-it-works", label: "How It Works" },
  { href: "#partner-benefits", label: "Partner Benefits" },
] as const;

export function PublicNavbar({
  onLogin,
  onBecomePartner,
}: {
  onLogin: () => void;
  onBecomePartner: () => void;
}) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const linkClass = cn(
    "text-sm font-medium tracking-wide transition-colors",
    scrolled ? "text-slate-700 hover:text-[var(--brand-blue)]" : "text-white/85 hover:text-white",
  );

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-[background-color,box-shadow,backdrop-filter] duration-300",
        scrolled
          ? "bg-[#f7f4ef]/90 backdrop-blur-xl shadow-[0_1px_0_rgba(15,23,42,0.06)]"
          : "bg-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:h-[4.5rem] lg:px-8">
        <a href="#top" className="relative z-10 flex items-center gap-3 min-w-0">
          <img
            src="/trevio-logo.png"
            alt="Trevio Global"
            className="h-8 w-auto sm:h-9 object-contain"
          />
          <span
            className={cn(
              "hidden sm:block text-[11px] font-semibold uppercase tracking-[0.18em]",
              scrolled ? "text-slate-500" : "text-white/70",
            )}
          >
            MyPartner
          </span>
        </a>

        <nav className="hidden lg:flex items-center gap-8" aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className={linkClass}>
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden lg:flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={onLogin}
            className={cn(
              "h-10 px-4 rounded-xl font-semibold",
              scrolled
                ? "text-slate-800 hover:bg-slate-900/5"
                : "text-white hover:bg-white/10 hover:text-white",
            )}
          >
            Login
          </Button>
          <Button
            type="button"
            onClick={onBecomePartner}
            className="h-10 rounded-xl bg-[var(--brand-teal)] px-5 font-semibold text-white hover:bg-[var(--brand-teal)]/90 shadow-lg shadow-teal-900/20"
          >
            Become a Partner
          </Button>
        </div>

        <div className="flex lg:hidden items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onLogin}
            className={cn(
              "h-9 rounded-lg font-semibold",
              scrolled ? "text-slate-800" : "text-white hover:bg-white/10 hover:text-white",
            )}
          >
            Login
          </Button>
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className={cn(
              "inline-flex h-10 w-10 items-center justify-center rounded-xl border",
              scrolled
                ? "border-slate-200 text-slate-800 bg-white/70"
                : "border-white/25 text-white bg-white/10",
            )}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={reduce ? false : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="lg:hidden border-t border-slate-200/70 bg-[#f7f4ef]/98 backdrop-blur-xl"
          >
            <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-4 sm:px-6">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="rounded-xl px-3 py-3 text-sm font-medium text-slate-800 hover:bg-white"
                >
                  {link.label}
                </a>
              ))}
              <Button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onBecomePartner();
                }}
                className="mt-2 h-11 rounded-xl bg-[var(--brand-teal)] font-semibold text-white"
              >
                Become a Partner
              </Button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
