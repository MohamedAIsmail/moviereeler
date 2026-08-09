DROP INDEX IF EXISTS public.watched_movies_unique;
CREATE UNIQUE INDEX watched_movies_unique ON public.watched_movies (user_id, lower(title), COALESCE(year, 0), media_type);