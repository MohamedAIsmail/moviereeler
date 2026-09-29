export const REFINES = {
  obscure: { label: "More obscure", prompt: "Go more obscure: lesser-known, under-seen titles, avoid anything widely popular." },
  recent: { label: "More recent", prompt: "Favour recent releases, ideally from the last 5-7 years." },
  lighter: { label: "Lighter / funnier", prompt: "Make it lighter and funnier than their picks, while keeping what connects to their taste." },
  darker: { label: "Darker", prompt: "Go darker and heavier in tone than their picks." },
  director: { label: "Same director vibe", prompt: "Match the directorial style/creator signatures of their picks as closely as possible." },
  shorter: { label: "Shorter (<100 min)", prompt: "Only titles with a runtime under 100 minutes (for series: short episodes or a single short season)." },
} as const;

export type RefineKey = keyof typeof REFINES;
export const REFINE_KEYS = Object.keys(REFINES) as RefineKey[];

export function trailerUrl(title: string, year: number | null | undefined) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${title} ${year ?? ""} trailer`.replace(/\s+/g, " ").trim())}`;
}
