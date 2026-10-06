/**
 * Destination/travel imagery for quotation PDFs.
 * Prefer catalogue images; fall back to curated destination photography
 * (same approach as proposal-preview hero fallbacks) so destination/itinerary
 * pages never render empty gray boxes when cover/hotel imagery already works.
 */

const GENERIC_TRAVEL = [
  "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=1400&q=80",
  "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=1400&q=80",
];

/** Curated destination photography keyed by destination / city / country tokens. */
const DESTINATION_FALLBACKS: Array<{ match: RegExp; images: string[] }> = [
  {
    match: /kuala\s*lumpur|\bkl\b|petronas|malaysia/i,
    images: [
      // Visually verified Petronas / Kuala Lumpur photography only
      "https://images.unsplash.com/photo-1533118673680-d7eaa85beb24?auto=format&fit=crop&w=1400&q=80",
      "https://images.unsplash.com/photo-1576506730652-f0e4ad14828f?auto=format&fit=crop&w=1400&q=80",
      "https://images.unsplash.com/photo-1753814088327-569e8a28295a?auto=format&fit=crop&w=1400&q=80",
      "https://images.unsplash.com/photo-1508062878650-88b52897f298?auto=format&fit=crop&w=1400&q=80",
      "https://images.unsplash.com/photo-1764866557865-1f4e4060211f?auto=format&fit=crop&w=1400&q=80",
      "https://images.unsplash.com/photo-1764923163983-486b18540f72?auto=format&fit=crop&w=1400&q=80",
    ],
  },
  {
    match: /bali|indonesia/i,
    images: [
      "https://images.unsplash.com/photo-1537996194471-e667a5835a1d?auto=format&fit=crop&w=1400&q=80",
      "https://images.unsplash.com/photo-1555400038-63f5ba517a47?auto=format&fit=crop&w=1400&q=80",
    ],
  },
  {
    match: /dubai|uae|emirates/i,
    images: [
      "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=1400&q=80",
    ],
  },
  {
    match: /singapore/i,
    images: [
      "https://images.unsplash.com/photo-1525625293386-3f8f99389edd?auto=format&fit=crop&w=1400&q=80",
    ],
  },
  {
    match: /goa|mumbai|india/i,
    images: [
      "https://images.unsplash.com/photo-1512343879784-a960cd67eb2b?auto=format&fit=crop&w=1400&q=80",
    ],
  },
];

function isImageUrl(value: unknown): boolean {
  const s = String(value ?? "").trim();
  return /^(https?:\/\/|data:image\/|\/)/i.test(s);
}

function uniqUrls(urls: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  for (const raw of urls) {
    const s = String(raw || "").trim();
    if (!s || !isImageUrl(s)) continue;
    if (!out.includes(s)) out.push(s);
  }
  return out;
}

function curatedFor(destinationName?: string | null, country?: string | null, city?: string | null): string[] {
  const haystack = [destinationName, city, country].filter(Boolean).join(" ");
  if (!haystack.trim()) return [...GENERIC_TRAVEL];
  for (const row of DESTINATION_FALLBACKS) {
    if (row.match.test(haystack)) return [...row.images];
  }
  return [...GENERIC_TRAVEL];
}

/**
 * Merge catalogue destination imagery with curated travel fallbacks.
 * Catalogue URLs always win; curated URLs fill gaps so PDF pages stay image-led.
 */
export function resolveDestinationTravelImages(input: {
  destinationName?: string | null;
  country?: string | null;
  city?: string | null;
  catalogueImages?: Array<string | null | undefined>;
}): string[] {
  const catalogue = uniqUrls(input.catalogueImages || []);
  const curated = curatedFor(input.destinationName, input.country, input.city);
  return uniqUrls([...catalogue, ...curated]);
}

export function defaultTravelFallbackImage(): string {
  return GENERIC_TRAVEL[0];
}
