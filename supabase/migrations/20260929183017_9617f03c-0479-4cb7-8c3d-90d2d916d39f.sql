ALTER TABLE public.recommendations ADD COLUMN IF NOT EXISTS hook text;

CREATE TABLE public.pick_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  year integer,
  media_type text NOT NULL DEFAULT 'movie',
  kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, media_type, title, year)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pick_feedback TO authenticated;
GRANT ALL ON public.pick_feedback TO service_role;
ALTER TABLE public.pick_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own pick feedback" ON public.pick_feedback FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX pick_feedback_user_idx ON public.pick_feedback (user_id, media_type);