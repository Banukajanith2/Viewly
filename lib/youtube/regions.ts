/**
 * Region codes for the YouTube Data API (Part 8.2).
 *
 * Pure: no "server-only", Firestore or googleapis imports, so it runs under node
 * and is safe in a client component (the settings selector needs it).
 *
 * Hardcoded rather than fetched from i18nRegions.list. That call costs a unit every
 * time and returns a list that changes perhaps once a year, so paying for it out of
 * a budget shared by every user would be a poor trade. If a region is ever missing,
 * add it here.
 *
 * The names are the plain English ones a creator would recognise, not the ISO
 * long forms: "South Korea", not "Korea, Republic of".
 */

export interface Region {
  /** ISO 3166-1 alpha-2, which is what regionCode expects. */
  code: string;
  name: string;
}

export const REGIONS: readonly Region[] = [
  { code: "AR", name: "Argentina" },
  { code: "AU", name: "Australia" },
  { code: "AT", name: "Austria" },
  { code: "BD", name: "Bangladesh" },
  { code: "BE", name: "Belgium" },
  { code: "BR", name: "Brazil" },
  { code: "CA", name: "Canada" },
  { code: "CL", name: "Chile" },
  { code: "CO", name: "Colombia" },
  { code: "CZ", name: "Czechia" },
  { code: "DK", name: "Denmark" },
  { code: "EG", name: "Egypt" },
  { code: "FI", name: "Finland" },
  { code: "FR", name: "France" },
  { code: "DE", name: "Germany" },
  { code: "GR", name: "Greece" },
  { code: "HK", name: "Hong Kong" },
  { code: "HU", name: "Hungary" },
  { code: "IN", name: "India" },
  { code: "ID", name: "Indonesia" },
  { code: "IE", name: "Ireland" },
  { code: "IL", name: "Israel" },
  { code: "IT", name: "Italy" },
  { code: "JP", name: "Japan" },
  { code: "KE", name: "Kenya" },
  { code: "MY", name: "Malaysia" },
  { code: "MX", name: "Mexico" },
  { code: "NL", name: "Netherlands" },
  { code: "NZ", name: "New Zealand" },
  { code: "NG", name: "Nigeria" },
  { code: "NO", name: "Norway" },
  { code: "PK", name: "Pakistan" },
  { code: "PE", name: "Peru" },
  { code: "PH", name: "Philippines" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "RO", name: "Romania" },
  { code: "RU", name: "Russia" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "SG", name: "Singapore" },
  { code: "ZA", name: "South Africa" },
  { code: "KR", name: "South Korea" },
  { code: "ES", name: "Spain" },
  { code: "LK", name: "Sri Lanka" },
  { code: "SE", name: "Sweden" },
  { code: "CH", name: "Switzerland" },
  { code: "TW", name: "Taiwan" },
  { code: "TH", name: "Thailand" },
  { code: "TR", name: "Turkey" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
  { code: "UA", name: "Ukraine" },
  { code: "VN", name: "Vietnam" },
] as const;

const BY_CODE = new Map(REGIONS.map((r) => [r.code, r]));

export function isSupportedRegion(code: string | null | undefined): boolean {
  return typeof code === "string" && BY_CODE.has(code.toUpperCase());
}

export function regionName(code: string | null | undefined): string | null {
  if (!code) return null;
  return BY_CODE.get(code.toUpperCase())?.name ?? null;
}

/**
 * The region to use for a given creator.
 *
 * Order matters and is the whole point of Part 8.2. An explicit choice wins; with
 * no choice, the channel's OWN country is the right default, because a Sri Lankan
 * creator opening a trending list should not be shown what is popular in the United
 * States. Falling back to US only when nothing else is known keeps the API call
 * valid, since regionCode has no "global" value.
 */
export const FALLBACK_REGION = "US";

export function resolveRegion(
  explicit: string | null | undefined,
  channelCountry?: string | null,
): string {
  if (isSupportedRegion(explicit)) return explicit!.toUpperCase();
  if (isSupportedRegion(channelCountry)) return channelCountry!.toUpperCase();
  return FALLBACK_REGION;
}
