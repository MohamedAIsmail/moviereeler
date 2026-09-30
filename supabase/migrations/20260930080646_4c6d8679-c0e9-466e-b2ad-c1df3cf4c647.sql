CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  visitor_id text NOT NULL CHECK (char_length(visitor_id) BETWEEN 8 AND 64),
  user_id uuid,
  event_name text NOT NULL CHECK (char_length(event_name) BETWEEN 1 AND 64),
  properties jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (pg_column_size(properties) < 8192)
);
GRANT INSERT ON public.events TO anon, authenticated;
GRANT SELECT ON public.events TO authenticated;
GRANT ALL ON public.events TO service_role;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Guests insert anonymous events" ON public.events FOR INSERT TO anon WITH CHECK (user_id IS NULL);
CREATE POLICY "Users insert own events" ON public.events FOR INSERT TO authenticated WITH CHECK (user_id IS NULL OR user_id = auth.uid());
CREATE POLICY "Admins read events" ON public.events FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'));
CREATE INDEX events_created_at_idx ON public.events (created_at DESC);
CREATE INDEX events_visitor_idx ON public.events (visitor_id);
CREATE INDEX events_name_idx ON public.events (event_name, created_at DESC);