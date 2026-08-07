/**
 * CSV parsing for movie imports (Letterboxd exports and generic CSVs).
 * Pure, browser-safe.
 */

export interface ParsedRow {
  title: string;
  year: number | null;
  rating: number | null;
  watchedOn: string | null;
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

/** Letterboxd ratings are 0–5 stars; IMDb and most others are already 0–10. */
function normalizeRating(raw: string, doubleScale: boolean): number | null {
  const value = Number(raw);
  if (!raw.trim() || Number.isNaN(value)) return null;
  const scaled = doubleScale ? value * 2 : value;
  return Math.min(10, Math.max(0, Math.round(scaled * 10) / 10));
}

export function parseMovieCsv(text: string): { rows: ParsedRow[]; skipped: number } {
  const table = splitCsv(text.replace(/^\uFEFF/, ""));
  if (table.length < 2) return { rows: [], skipped: 0 };

  const headers = table[0]!.map((header) => header.trim().toLowerCase());
  const titleIndex = findIndex(headers, ["name", "title", "film", "movie"]);
  const yearIndex = findIndex(headers, ["year", "release year"]);
  const ratingIndex = findIndex(headers, ["your rating", "rating", "score"]);
  const dateIndex = findIndex(headers, ["watched date", "date rated", "date", "date watched"]);
  const isLetterboxd = headers.includes("letterboxd uri");
  // IMDb exports rate 1–10 already; Letterboxd uses 0–5 stars.
  const doubleScale = isLetterboxd;

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

    const key = `${title.toLowerCase()}|${year ?? ""}`;
    if (seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);

    const dateRaw = dateIndex >= 0 ? (cells[dateIndex] ?? "").trim() : "";
    rows.push({
      title: title.slice(0, 300),
      year,
      rating: ratingIndex >= 0 ? normalizeRating(cells[ratingIndex] ?? "", doubleScale) : null,
      watchedOn: /^\d{4}-\d{2}-\d{2}/.test(dateRaw) ? dateRaw.slice(0, 10) : null,
    });
  }

  return { rows, skipped };
}
