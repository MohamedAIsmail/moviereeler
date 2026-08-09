/**
 * CSV parsing for movie imports (Letterboxd exports and generic CSVs).
 * Pure, browser-safe.
 */

export interface ParsedRow {
  title: string;
  year: number | null;
  rating: number | null;
  watchedOn: string | null;
  mediaType?: "movie" | "series";
  imdbId?: string | null;
}

function splitCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
}

function findIndex(headers: string[], candidates: string[]): number {
  return headers.findIndex((header) => candidates.includes(header));
}

/** Normalize common numeric, fractional, percentage and Letterboxd star ratings to 0–10. */
function normalizeRating(raw: string, scale: 5 | 10 | 100): number | null {
  const cleaned = raw.trim().replace(",", ".");
  if (!cleaned) return null;

  const stars = cleaned.match(/[★⭐]/g)?.length ?? 0;
  const halfStar = /[½⯪]/.test(cleaned) ? 0.5 : 0;
  const fraction = /^\s*(\d+(?:\.\d+)?)\s*\/\s*(5|10|100)\s*$/.exec(cleaned);
  const value = stars > 0 ? stars + halfStar : fraction ? Number(fraction[1]) : Number(cleaned.replace("%", ""));
  const sourceScale = stars > 0 ? 5 : fraction ? Number(fraction[2]) : cleaned.includes("%") ? 100 : scale;
  if (Number.isNaN(value)) return null;
  const scaled = (value / sourceScale) * 10;
  return Math.min(10, Math.max(0, Math.round(scaled * 10) / 10));
}

function parseMediaType(raw: string): "movie" | "series" | undefined {
  const value = raw.trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (!value) return undefined;
  if (
    value.includes("series") ||
    value.includes("tvshow") ||
    value.includes("television") ||
    value.includes("miniseries") ||
    value === "show"
  ) {
    return "series";
  }
  if (value.includes("movie") || value === "film" || value === "feature") return "movie";
  return undefined;
}

export function parseMovieCsv(text: string): { rows: ParsedRow[]; skipped: number } {
  const table = splitCsv(text.replace(/^\uFEFF/, ""));
  if (table.length < 2) return { rows: [], skipped: 0 };

  const headers = table[0]!.map((header) => header.trim().toLowerCase());
  const titleIndex = findIndex(headers, ["name", "title", "film", "movie"]);
  const yearIndex = findIndex(headers, ["year", "release year", "release date"]);
  const ratingIndex = findIndex(headers, [
    "your rating",
    "my rating",
    "personal rating",
    "user rating",
    "rating",
    "score",
  ]);
  const dateIndex = findIndex(headers, ["watched date", "date rated", "date", "date watched"]);
  const typeIndex = findIndex(headers, ["title type", "media type", "type", "kind"]);
  const imdbIndex = findIndex(headers, ["const", "imdb id", "imdb_id"]);
  const isLetterboxd = headers.includes("letterboxd uri");
  const ratingHeader = ratingIndex >= 0 ? headers[ratingIndex] ?? "" : "";
  const ratingScale: 5 | 10 | 100 = isLetterboxd || ratingHeader.includes("5") ? 5 : ratingHeader.includes("100") ? 100 : 10;

  if (titleIndex === -1) return { rows: [], skipped: table.length - 1 };


  const seen = new Set<string>();
  const rows: ParsedRow[] = [];
  let skipped = 0;

  for (const cells of table.slice(1)) {
    const title = (cells[titleIndex] ?? "").trim();
    if (!title) {
      skipped++;
      continue;
    }
    const yearRaw = yearIndex >= 0 ? (cells[yearIndex] ?? "").trim() : "";
    const yearMatch = /\d{4}/.exec(yearRaw);
    const year = yearMatch ? Number(yearMatch[0]) : null;

    const mediaType = typeIndex >= 0 ? parseMediaType(cells[typeIndex] ?? "") : undefined;
    const key = `${title.toLowerCase()}|${year ?? ""}|${mediaType ?? ""}`;
    if (seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);

    const dateRaw = dateIndex >= 0 ? (cells[dateIndex] ?? "").trim() : "";
    rows.push({
      title: title.slice(0, 300),
      year,
      rating: ratingIndex >= 0 ? normalizeRating(cells[ratingIndex] ?? "", ratingScale) : null,
      watchedOn: /^\d{4}-\d{2}-\d{2}/.test(dateRaw) ? dateRaw.slice(0, 10) : null,
      ...(mediaType ? { mediaType } : {}),
      imdbId: imdbIndex >= 0 ? (cells[imdbIndex] ?? "").trim() || null : null,
    });
  }

  return { rows, skipped };
}
