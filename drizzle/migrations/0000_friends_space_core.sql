CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  bio TEXT NOT NULL DEFAULT '',
  vibe_tags TEXT[] NOT NULL DEFAULT '{}',
  avatar_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT profiles_username_format CHECK (username ~ '^[A-Za-z0-9_]{2,24}$'),
  CONSTRAINT profiles_bio_length CHECK (char_length(bio) <= 160),
  CONSTRAINT profiles_vibe_tags_count CHECK (cardinality(vibe_tags) <= 5)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.group_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_code TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_invites TO authenticated;
GRANT ALL ON public.group_invites TO service_role;
ALTER TABLE public.group_invites ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  caption TEXT NOT NULL DEFAULT '',
  image_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT posts_caption_length CHECK (char_length(caption) <= 2000)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.posts TO authenticated;
GRANT ALL ON public.posts TO service_role;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.post_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT post_comments_body_length CHECK (char_length(body) BETWEEN 1 AND 1000)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_comments TO authenticated;
GRANT ALL ON public.post_comments TO service_role;
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.post_likes (
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_likes TO authenticated;
GRANT ALL ON public.post_likes TO service_role;
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.group_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT group_messages_body_length CHECK (char_length(body) BETWEEN 1 AND 2000)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_messages TO authenticated;
GRANT ALL ON public.group_messages TO service_role;
ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.shared_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('note', 'file')),
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  storage_path TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT shared_items_title_length CHECK (char_length(title) BETWEEN 1 AND 120),
  CONSTRAINT shared_items_body_length CHECK (char_length(body) <= 10000)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shared_items TO authenticated;
GRANT ALL ON public.shared_items TO service_role;
ALTER TABLE public.shared_items ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_group_member()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid());
$$;
REVOKE ALL ON FUNCTION public.is_group_member() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_group_member() TO authenticated;

CREATE OR REPLACE FUNCTION public.join_friends_group(
  p_invite_code TEXT,
  p_username TEXT,
  p_bio TEXT DEFAULT '',
  p_vibe_tags TEXT[] DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  joined_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in before joining the group';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.group_invites
    WHERE is_active = true AND invite_code = upper(trim(p_invite_code))
  ) THEN
    RAISE EXCEPTION 'That invite code is not valid';
  END IF;
  IF p_username IS NULL OR p_username !~ '^[A-Za-z0-9_]{2,24}$' THEN
    RAISE EXCEPTION 'Username must be 2–24 letters, numbers, or underscores';
  END IF;
  IF char_length(coalesce(p_bio, '')) > 160 OR cardinality(coalesce(p_vibe_tags, '{}')) > 5 THEN
    RAISE EXCEPTION 'Profile details are too long';
  END IF;
  INSERT INTO public.profiles (id, username, bio, vibe_tags)
  VALUES (auth.uid(), p_username, coalesce(p_bio, ''), coalesce(p_vibe_tags, '{}'))
  ON CONFLICT (id) DO UPDATE
    SET username = EXCLUDED.username, bio = EXCLUDED.bio, vibe_tags = EXCLUDED.vibe_tags
  RETURNING id INTO joined_id;
  RETURN joined_id;
END;
$$;
REVOKE ALL ON FUNCTION public.join_friends_group(TEXT, TEXT, TEXT, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_friends_group(TEXT, TEXT, TEXT, TEXT[]) TO authenticated;

CREATE POLICY profiles_read_group ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_group_member());
CREATE POLICY profiles_join_self ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
CREATE POLICY profiles_update_self ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY posts_read_group ON public.posts FOR SELECT TO authenticated USING (public.is_group_member());
CREATE POLICY posts_add_self ON public.posts FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid() AND public.is_group_member());
CREATE POLICY posts_edit_self ON public.posts FOR UPDATE TO authenticated USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());
CREATE POLICY posts_remove_self ON public.posts FOR DELETE TO authenticated USING (author_id = auth.uid());

CREATE POLICY comments_read_group ON public.post_comments FOR SELECT TO authenticated USING (public.is_group_member());
CREATE POLICY comments_add_self ON public.post_comments FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid() AND public.is_group_member());
CREATE POLICY comments_edit_self ON public.post_comments FOR UPDATE TO authenticated USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());
CREATE POLICY comments_remove_self ON public.post_comments FOR DELETE TO authenticated USING (author_id = auth.uid());

CREATE POLICY likes_read_group ON public.post_likes FOR SELECT TO authenticated USING (public.is_group_member());
CREATE POLICY likes_add_self ON public.post_likes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.is_group_member());
CREATE POLICY likes_remove_self ON public.post_likes FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE POLICY messages_read_group ON public.group_messages FOR SELECT TO authenticated USING (public.is_group_member());
CREATE POLICY messages_add_self ON public.group_messages FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid() AND public.is_group_member());
CREATE POLICY messages_edit_self ON public.group_messages FOR UPDATE TO authenticated USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());
CREATE POLICY messages_remove_self ON public.group_messages FOR DELETE TO authenticated USING (author_id = auth.uid());

CREATE POLICY shared_items_read_group ON public.shared_items FOR SELECT TO authenticated USING (public.is_group_member());
CREATE POLICY shared_items_add_self ON public.shared_items FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid() AND public.is_group_member());
CREATE POLICY shared_items_edit_self ON public.shared_items FOR UPDATE TO authenticated USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());
CREATE POLICY shared_items_remove_self ON public.shared_items FOR DELETE TO authenticated USING (author_id = auth.uid());

CREATE POLICY group_invites_read_members ON public.group_invites FOR SELECT TO authenticated USING (public.is_group_member());

CREATE POLICY "Friends can view shared uploads" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'friends-share' AND (storage.foldername(name))[1] = 'group' AND public.is_group_member());
CREATE POLICY "Members upload to their own folder" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'friends-share' AND (storage.foldername(name))[1] = 'group' AND (storage.foldername(name))[2] = auth.uid()::text AND public.is_group_member());
CREATE POLICY "Members manage their own uploads" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'friends-share' AND (storage.foldername(name))[1] = 'group' AND (storage.foldername(name))[2] = auth.uid()::text AND public.is_group_member())
  WITH CHECK (bucket_id = 'friends-share' AND (storage.foldername(name))[1] = 'group' AND (storage.foldername(name))[2] = auth.uid()::text AND public.is_group_member());
CREATE POLICY "Members delete their own uploads" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'friends-share' AND (storage.foldername(name))[1] = 'group' AND (storage.foldername(name))[2] = auth.uid()::text AND public.is_group_member());

ALTER PUBLICATION supabase_realtime ADD TABLE public.group_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;
