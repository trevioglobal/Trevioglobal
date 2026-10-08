"use client";

const COLUMNS = [
  {
    title: "Solutions",
    links: [
      { label: "Flights", href: "#solutions" },
      { label: "Hotels", href: "#solutions" },
      { label: "Packages", href: "#solutions" },
      { label: "Transfers", href: "#solutions" },
      { label: "Activities", href: "#solutions" },
      { label: "Visa", href: "#solutions" },
    ],
  },
  {
    title: "Platform",
    links: [
      { label: "Quotations", href: "#how-it-works" },
      { label: "Bookings", href: "#how-it-works" },
      { label: "Customers", href: "#partner-benefits" },
      { label: "Payments", href: "#partner-benefits" },
      { label: "Invoices", href: "#partner-benefits" },
    ],
  },
] as const;

export function PublicFooter({
  onLogin,
  onBecomePartner,
}: {
  onLogin: () => void;
  onBecomePartner: () => void;
}) {
  return (
    <footer className="bg-[#0b1220] text-white">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-16">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-4 space-y-4">
            <img src="/trevio-logo.png" alt="Trevio Global" className="h-9 w-auto object-contain" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/50">
              MyPartner
            </p>
            <p className="max-w-sm text-sm leading-relaxed text-white/65">
              Premium B2B travel platform for travel agents, tour operators and travel businesses.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title} className="lg:col-span-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">
                {col.title}
              </p>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <a href={link.href} className="text-sm text-white/70 hover:text-white transition-colors">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="lg:col-span-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">Partner</p>
            <ul className="mt-4 space-y-2.5">
              <li>
                <button type="button" onClick={onBecomePartner} className="text-sm text-white/70 hover:text-white transition-colors">
                  Become a Partner
                </button>
              </li>
              <li>
                <button type="button" onClick={onLogin} className="text-sm text-white/70 hover:text-white transition-colors">
                  Login
                </button>
              </li>
              <li>
                <a href="mailto:support@trevioglobal.com" className="text-sm text-white/70 hover:text-white transition-colors">
                  Partner Support
                </a>
              </li>
            </ul>
          </div>

          <div className="lg:col-span-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">Company</p>
            <ul className="mt-4 space-y-2.5">
              <li>
                <a href="#why-trevio" className="text-sm text-white/70 hover:text-white transition-colors">
                  About Trevio
                </a>
              </li>
              <li>
                <a href="mailto:hello@trevioglobal.com" className="text-sm text-white/70 hover:text-white transition-colors">
                  Contact
                </a>
              </li>
              <li>
                <span className="text-sm text-white/40">Terms</span>
              </li>
              <li>
                <span className="text-sm text-white/40">Privacy</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-white/45">© {new Date().getFullYear()} Trevio Global. All rights reserved.</p>
          <p className="text-xs text-white/35">Luxury Travel · Professional SaaS · Global DMC</p>
        </div>
      </div>
    </footer>
  );
}
