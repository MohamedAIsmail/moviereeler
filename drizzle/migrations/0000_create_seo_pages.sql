CREATE TABLE public.seo_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  source_title text NOT NULL,
  source_year integer,
  imdb_id text,
  source_poster text,
  intro text NOT NULL DEFAULT '',
  meta_title text,
  meta_description text,
  recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX seo_pages_status_idx ON public.seo_pages(status, updated_at DESC);
GRANT SELECT ON public.seo_pages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seo_pages TO authenticated;
GRANT ALL ON public.seo_pages TO service_role;
ALTER TABLE public.seo_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public reads published seo pages" ON public.seo_pages FOR SELECT TO anon, authenticated USING (status = 'published');
CREATE POLICY "Admins read all seo pages" ON public.seo_pages FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins insert seo pages" ON public.seo_pages FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update seo pages" ON public.seo_pages FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete seo pages" ON public.seo_pages FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));