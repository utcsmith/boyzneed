CREATE OR REPLACE FUNCTION public.delete_own_post(p_post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to delete a post.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.posts
    WHERE id = p_post_id AND author_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You can only delete your own posts.' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.post_comments WHERE post_id = p_post_id;
  DELETE FROM public.post_likes WHERE post_id = p_post_id;
  DELETE FROM public.posts WHERE id = p_post_id AND author_id = auth.uid();
END;
$$;
REVOKE ALL ON FUNCTION public.delete_own_post(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_own_post(uuid) TO authenticated;