-- Postgres requires both table-level GRANTs AND RLS policies.
-- Existing RLS policies already restrict rows correctly; we just need the base GRANTs.

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;

GRANT SELECT, INSERT, UPDATE ON public.pets TO authenticated;
GRANT SELECT ON public.pets TO anon;

GRANT SELECT, INSERT ON public.exercise_logs TO authenticated;

GRANT SELECT, INSERT ON public.battles TO authenticated;
GRANT SELECT ON public.battles TO anon;