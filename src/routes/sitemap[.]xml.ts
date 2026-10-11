import { createFileRoute } from "@tanstack/react-router";

const BASE_URL = "https://moviereeler.com";
const STATIC_PATHS = ["/", "/try", "/movies-like", "/privacy", "/terms"];

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const { createClient } = await import("@supabase/supabase-js");
        const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
        const supabase = createClient(process.env["SUPABASE_URL"]!, key, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: {
            fetch: (input, init) => {
              const headers = new Headers(init?.headers);
              if (key.startsWith("sb_") && headers.get("Authorization") === "Bearer " + key) headers.delete("Authorization");
              headers.set("apikey", key);
              return fetch(input, { ...init, headers });
            },
          },
        });

        const urls: string[] = STATIC_PATHS.map((p) => `<url><loc>${esc(BASE_URL + p)}</loc></url>`);
        const pageSize = 1000;
        for (let offset = 0; ; ) {
          const { data, error } = await supabase
            .from("seo_pages")
            .select("slug, updated_at")
            .eq("status", "published")
            .order("slug")
            .range(offset, offset + pageSize - 1);
          if (error) return new Response("Sitemap unavailable", { status: 503 });
          if (!data.length) break;
          for (const row of data) {
            urls.push(
              `<url><loc>${esc(`${BASE_URL}/movies-like/${encodeURIComponent(row.slug)}`)}</loc><lastmod>${row.updated_at.slice(0, 10)}</lastmod></url>`,
            );
          }
          offset += data.length;
        }
        const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`;
        return new Response(xml, {
          headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" },
        });
      },
    },
  },
});
