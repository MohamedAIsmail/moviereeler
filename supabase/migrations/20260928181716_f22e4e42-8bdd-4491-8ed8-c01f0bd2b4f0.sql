ALTER TABLE public.recommendations ADD COLUMN feedback smallint;

CREATE TABLE public.ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  ip_hash text,
  kind text NOT NULL DEFAULT 'recommend',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ai_usage TO service_role;
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
CREATE INDEX ai_usage_user_idx ON public.ai_usage (user_id, created_at);
CREATE INDEX ai_usage_ip_idx ON public.ai_usage (ip_hash, created_at);

CREATE TABLE public.demo_cache (
  key text PRIMARY KEY,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.demo_cache TO service_role;
ALTER TABLE public.demo_cache ENABLE ROW LEVEL SECURITY;