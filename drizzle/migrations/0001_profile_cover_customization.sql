ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cover_path text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cover_style text NOT NULL DEFAULT 'squad';