-- Backfill profiles.github_username and avatar_url from users table
-- So Radar works immediately without waiting for "next login"

UPDATE public.profiles p
SET github_username = u.github_username,
    avatar_url = COALESCE(p.avatar_url, u.avatar_url),
    updated_at = now()
FROM public.users u
WHERE p.id = u.id
  AND p.github_username IS NULL
  AND u.github_username IS NOT NULL;
