ALTER TABLE public.watched_movies ADD COLUMN IF NOT EXISTS media_type text NOT NULL DEFAULT 'movie';
ALTER TABLE public.recommendations ADD COLUMN IF NOT EXISTS media_type text NOT NULL DEFAULT 'movie';
CREATE INDEX IF NOT EXISTS watched_movies_user_media_idx ON public.watched_movies (user_id, media_type);
CREATE INDEX IF NOT EXISTS recommendations_user_media_idx ON public.recommendations (user_id, media_type);