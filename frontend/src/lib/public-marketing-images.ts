/**
 * Central image config for the public MyPartner marketing site.
 * Prefer swapping these for owned Trevio assets under /public when available.
 */

export const PUBLIC_IMAGES = {
  hero: {
    src: "/marketing/hero-mediterranean.jpg",
    alt: "Luxury cliffside villa overlooking a Mediterranean sunset",
  },
  network: {
    src: "https://images.unsplash.com/photo-1506929562872-bb421503ef21?auto=format&fit=crop&w=2000&q=80",
    alt: "Tropical coastline and turquoise water at golden hour",
  },
  finalCta: {
    src: "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=2000&q=80",
    alt: "Lake and mountain landscape under soft evening light",
  },
  solutions: {
    flights: {
      src: "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=1200&q=80",
      alt: "Aircraft wing above clouds during daytime flight",
    },
    hotels: {
      src: "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80",
      alt: "Luxury hotel pool and resort architecture",
    },
    packages: {
      src: "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=1200&q=80",
      alt: "Scenic road trip through open landscape",
    },
    transfers: {
      src: "https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?auto=format&fit=crop&w=1200&q=80",
      alt: "Premium car on a coastal road",
    },
    activities: {
      src: "https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=1200&q=80",
      alt: "Temple and tropical destination experience",
    },
    visa: {
      src: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1200&q=80",
      alt: "Travellers preparing documents and passports",
    },
  },
} as const;
