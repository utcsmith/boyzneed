import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowDownToLine,
  ArrowLeft,
  AtSign,
  Check,
  ChevronDown,
  FileText,
  Heart,
  ImagePlus,
  LogOut,
  MessageCircle,
  MoreHorizontal,
  Paperclip,
  Plus,
  Send,
  Sparkles,
  Users,
  X,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import nightshiftCharm from "@/assets/nightshift-charm.png";
import nightshiftStudio from "@/assets/nightshift-studio.jpg";
import { ThemePicker } from "@/components/theme-picker";

type Profile = Tables<"profiles">;
type FeedPost = Tables<"posts"> & {
  profile: Profile | null;
  likes: number;
  liked: boolean;
  imageUrl: string | null;
  comments: (Tables<"post_comments"> & { profile: Profile | null })[];
};
type SharedItem = Tables<"shared_items"> & { profile: Profile | null; downloadUrl: string | null };
type GroupMessage = Tables<"group_messages"> & { profile: Profile | null };
type View = "home" | "chat" | "files" | "profile";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Nightshift — Friends, in one place" },
      { name: "description", content: "A private place for your friends to share moments, chat, and swap files." },
      { property: "og:title", content: "Nightshift — Friends, in one place" },
      { property: "og:description", content: "Your private corner for photos, chats, and shared things." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FriendsSpace,
});

const uploadBucket = "friends-share";
const vibeOptions = ["main character", "chaotic good", "photo dump", "night owl", "soft launch", "always outside"];

function FriendsSpace() {
  const [user, setUser] = useState<{ id: string; email?: string | undefined } | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activeInviteCode, setActiveInviteCode] = useState("");
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<"join" | "login">("join");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [pickedVibes, setPickedVibes] = useState<string[]>([]);
  const [view, setView] = useState<View>("home");
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [sharedItems, setSharedItems] = useState<SharedItem[]>([]);
  const [feedBusy, setFeedBusy] = useState(false);
  const [pageMessage, setPageMessage] = useState("");
  const [caption, setCaption] = useState("");
  const [postImage, setPostImage] = useState<File | null>(null);
  const [messageDraft, setMessageDraft] = useState("");
  const [shareTitle, setShareTitle] = useState("");
  const [shareBody, setShareBody] = useState("");
  const [shareFile, setShareFile] = useState<File | null>(null);
  const [sharing, setSharing] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const feedFileInput = useRef<HTMLInputElement>(null);
  const sharedFileInput = useRef<HTMLInputElement>(null);
  const chatEnd = useRef<HTMLDivElement>(null);

  const getSignedUrl = useCallback(async (path: string | null, seconds = 3600) => {
    if (!path) return null;
    const { data } = await supabase.storage.from(uploadBucket).createSignedUrl(path, seconds);
    return data?.signedUrl ?? null;
  }, []);

  const loadMembers = useCallback(async () => {
    const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: true });
    if (!error) setMembers(data ?? []);
  }, []);

  const loadInviteCode = useCallback(async () => {
    const { data } = await supabase.from("group_invites").select("invite_code").eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (data?.invite_code) setActiveInviteCode(data.invite_code);
  }, []);

  const loadPosts = useCallback(async () => {
    const { data: rows, error } = await supabase.from("posts").select("*").order("created_at", { ascending: false }).limit(40);
    if (error) { setPageMessage(error.message); return; }
    const postRows = rows ?? [];
    const ids = postRows.map((post) => post.id);
    const [profileResult, likeResult, commentResult] = await Promise.all([
      supabase.from("profiles").select("*"),
      ids.length ? supabase.from("post_likes").select("post_id,user_id").in("post_id", ids) : Promise.resolve({ data: [], error: null }),
      ids.length ? supabase.from("post_comments").select("*").in("post_id", ids).order("created_at") : Promise.resolve({ data: [], error: null }),
    ]);
    const profileById = new Map((profileResult.data ?? []).map((item) => [item.id, item]));
    const likeRows = likeResult.data ?? [];
    const commentRows = commentResult.data ?? [];
    const commentProfiles = new Map((profileResult.data ?? []).map((item) => [item.id, item]));
    const enriched = await Promise.all(postRows.map(async (post) => ({
      ...post,
      profile: profileById.get(post.author_id) ?? null,
      likes: likeRows.filter((like) => like.post_id === post.id).length,
      liked: likeRows.some((like) => like.post_id === post.id && like.user_id === user?.id),
      imageUrl: await getSignedUrl(post.image_path),
      comments: commentRows.filter((comment) => comment.post_id === post.id).map((comment) => ({
        ...comment, profile: commentProfiles.get(comment.author_id) ?? null,
      })),
    })));
    setPosts(enriched);
  }, [getSignedUrl, user?.id]);

  const loadMessages = useCallback(async () => {
    const { data, error } = await supabase.from("group_messages").select("*").order("created_at", { ascending: true }).limit(150);
    if (error) return;
    const profileMap = new Map(members.map((item) => [item.id, item]));
    setMessages((data ?? []).map((item) => ({ ...item, profile: profileMap.get(item.author_id) ?? null })));
  }, [members]);

  const loadShared = useCallback(async () => {
    const { data, error } = await supabase.from("shared_items").select("*").order("created_at", { ascending: false });
    if (error) return;
    const profileMap = new Map(members.map((item) => [item.id, item]));
    const enriched = await Promise.all((data ?? []).map(async (item) => ({
      ...item,
      profile: profileMap.get(item.author_id) ?? null,
      downloadUrl: await getSignedUrl(item.storage_path),
    })));
    setSharedItems(enriched);
  }, [getSignedUrl, members]);

  useEffect(() => {
    let alive = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!alive) return;
      setUser(data.user ? { id: data.user.id, email: data.user.email ?? undefined } : null);
      setAuthReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      setUser(session?.user ? { id: session.user.id, email: session.user.email ?? undefined } : null);
      if (!session?.user) setProfile(null);
    });
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!user) { setProfile(null); return; }
    let alive = true;
    void supabase.from("profiles").select("*").eq("id", user.id).maybeSingle().then(({ data }) => {
      if (alive) setProfile(data);
    });
    return () => { alive = false; };
  }, [user]);

  useEffect(() => {
    if (!profile) return;
    setFeedBusy(true);
    void Promise.all([loadMembers(), loadPosts(), loadInviteCode()]).finally(() => setFeedBusy(false));
  }, [loadInviteCode, loadMembers, loadPosts, profile]);

  useEffect(() => {
    if (!user || profile) return;
    try {
      const pending = sessionStorage.getItem("nightshift-pending-join");
      if (!pending) return;
      const details = JSON.parse(pending) as { inviteCode?: string; username?: string; bio?: string; vibes?: string[] };
      setInviteCode(details.inviteCode ?? "");
      setUsername(details.username ?? "");
      setBio(details.bio ?? "");
      setPickedVibes(details.vibes ?? []);
    } catch {
      sessionStorage.removeItem("nightshift-pending-join");
    }
  }, [profile, user]);

  useEffect(() => {
    if (!profile) return;
    void loadMessages();
    void loadShared();
  }, [loadMessages, loadShared, profile]);

  useEffect(() => {
    if (!profile) return;
    const channel = supabase.channel("nightshift-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "group_messages" }, () => { void loadMessages(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, () => { void loadPosts(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "shared_items" }, () => { void loadShared(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [loadMessages, loadPosts, loadShared, profile]);

  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const visiblePosts = useMemo(() => view === "profile" ? posts.filter((post) => post.author_id === user?.id) : posts, [posts, user?.id, view]);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthBusy(true); setAuthMessage("");
    try {
      if (authMode === "join") {
        if (!inviteCode.trim()) { setAuthMessage("An invite code is needed to join."); return; }
        if (!username.trim()) { setAuthMessage("Choose a username first."); return; }
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: window.location.origin } });
        if (error) throw error;
        if (!data.session) {
          sessionStorage.setItem("nightshift-pending-join", JSON.stringify({ inviteCode: inviteCode.trim(), username: username.trim(), bio: bio.trim(), vibes: pickedVibes }));
          setAuthMessage("Check your email to confirm your account, then come back to join the group.");
          setAuthMode("login");
          return;
        }
        if (!data.user) throw new Error("Your account wasn’t returned. Please try signing in.");
        setUser({ id: data.user.id, email: data.user.email ?? undefined });
        const { error: joinError } = await supabase.rpc("join_friends_group", {
          p_invite_code: inviteCode.trim(), p_username: username.trim(), p_bio: bio.trim(), p_vibe_tags: pickedVibes,
        });
        if (joinError) throw joinError;
        sessionStorage.removeItem("nightshift-pending-join");
        setAuthMessage("You’re in. Welcome to the group.");
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        if (!data.user) throw new Error("That sign-in didn’t work.");
        setUser({ id: data.user.id, email: data.user.email ?? undefined });
      }
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "Couldn’t finish that. Try again.");
    } finally { setAuthBusy(false); }
  }

  async function signInGoogle() {
    setAuthBusy(true); setAuthMessage("");
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) { setAuthMessage(result.error.message); setAuthBusy(false); }
  }

  async function joinExistingAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    setAuthBusy(true); setAuthMessage("");
    const { error } = await supabase.rpc("join_friends_group", {
      p_invite_code: inviteCode.trim(), p_username: username.trim(), p_bio: bio.trim(), p_vibe_tags: pickedVibes,
    });
    if (error) setAuthMessage(error.message);
    else {
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      setProfile(data);
      sessionStorage.removeItem("nightshift-pending-join");
      setAuthMessage("");
    }
    setAuthBusy(false);
  }

  async function signOut() { await supabase.auth.signOut(); setUser(null); setProfile(null); }

  async function uploadFile(file: File) {
    if (!user) throw new Error("Sign in to upload.");
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-90);
    const path = `group/${user.id}/${crypto.randomUUID()}-${safeName}`;
    const { error } = await supabase.storage.from(uploadBucket).upload(path, file, { upsert: false });
    if (error) throw error;
    return path;
  }

  async function updateAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) { setPageMessage("Choose an image for your profile photo."); return; }
    setAvatarBusy(true); setPageMessage("");
    try {
      const avatarPath = await uploadFile(file);
      const { error } = await supabase.from("profiles").update({ avatar_path: avatarPath }).eq("id", user.id);
      if (error) throw error;
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      setProfile(data);
    } catch (error) { setPageMessage(error instanceof Error ? error.message : "Couldn’t update your photo."); }
    finally { setAvatarBusy(false); event.target.value = ""; }
  }

  async function copyInvite() {
    if (!activeInviteCode) { setPageMessage("Your invite code isn’t ready yet."); return; }
    try {
      await navigator.clipboard.writeText(activeInviteCode);
      setPageMessage(`Invite code copied: ${activeInviteCode}`);
    } catch { setPageMessage(`Your invite code is ${activeInviteCode}`); }
  }

  async function submitPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || (!caption.trim() && !postImage)) return;
    setFeedBusy(true); setPageMessage("");
    try {
      const imagePath = postImage ? await uploadFile(postImage) : null;
      const { error } = await supabase.from("posts").insert({ author_id: user.id, caption: caption.trim(), image_path: imagePath });
      if (error) throw error;
      setCaption(""); setPostImage(null);
      if (feedFileInput.current) feedFileInput.current.value = "";
      await loadPosts();
    } catch (error) { setPageMessage(error instanceof Error ? error.message : "Your post couldn’t be shared."); }
    finally { setFeedBusy(false); }
  }

  async function toggleLike(post: FeedPost) {
    if (!user) return;
    const nextLiked = !post.liked;
    setPosts((current) => current.map((item) => item.id === post.id ? { ...item, liked: nextLiked, likes: item.likes + (nextLiked ? 1 : -1) } : item));
    const result = nextLiked
      ? await supabase.from("post_likes").insert({ post_id: post.id, user_id: user.id })
      : await supabase.from("post_likes").delete().eq("post_id", post.id).eq("user_id", user.id);
    if (result.error) void loadPosts();
  }

  async function addComment(postId: string, form: HTMLFormElement) {
    if (!user) return;
    const data = new FormData(form);
    const body = String(data.get("comment") ?? "").trim();
    if (!body) return;
    const { error } = await supabase.from("post_comments").insert({ post_id: postId, author_id: user.id, body });
    if (error) setPageMessage(error.message);
    else { form.reset(); await loadPosts(); }
  }

  async function sendChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !messageDraft.trim()) return;
    const body = messageDraft.trim(); setMessageDraft("");
    const { error } = await supabase.from("group_messages").insert({ author_id: user.id, body });
    if (error) { setMessageDraft(body); setPageMessage(error.message); }
  }

  async function submitShared(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !shareTitle.trim()) return;
    setSharing(true); setPageMessage("");
    try {
      const storagePath = shareFile ? await uploadFile(shareFile) : null;
      const { error } = await supabase.from("shared_items").insert({
        author_id: user.id, item_type: shareFile ? "file" : "note", title: shareTitle.trim(), body: shareBody.trim(),
        storage_path: storagePath, mime_type: shareFile?.type ?? null, size_bytes: shareFile?.size ?? null,
      });
      if (error) throw error;
      setShareTitle(""); setShareBody(""); setShareFile(null);
      if (sharedFileInput.current) sharedFileInput.current.value = "";
      await loadShared();
    } catch (error) { setPageMessage(error instanceof Error ? error.message : "Couldn’t share that item."); }
    finally { setSharing(false); }
  }

  if (!authReady) return <div className="boot-screen"><img src={nightshiftCharm} alt="" width={86} height={86} /><span className="boot-wordmark">nightshift</span></div>;

  if (!user) {
    return (
      <main className="entry-page">
        <img className="entry-scene" src={nightshiftStudio} alt="Chrome star sculpture with lime and pink charms" width={1536} height={1024} />
        <div className="entry-nav"><Brand /><div className="entry-nav-actions"><span className="private-mark"><span className="status-dot" /> FRIENDS ONLY</span><ThemePicker /></div></div>
        <div className="entry-layout">
          <section className="entry-copy">
            <div className="eyebrow"><Sparkles size={14} /> YOUR PEOPLE. YOUR SPACE.</div>
            <h1>nightshift<span>.<br />your people.</span></h1>
            <p className="entry-subtitle">A little corner for the people who get you.</p>
            <div className="entry-stamp"><span>✳</span> ONLY THE REAL ONES</div>
            <div className="entry-footnote"><Zap size={14} /> GOOD VIBES, NO STRANGERS</div>
          </section>
          <section className="auth-panel" aria-label="Sign in or join the group">
            <div className="auth-tabs" role="tablist" aria-label="Account access">
              <button type="button" role="tab" aria-selected={authMode === "join"} onClick={() => { setAuthMode("join"); setAuthMessage(""); }}>Join the group</button>
              <button type="button" role="tab" aria-selected={authMode === "login"} onClick={() => { setAuthMode("login"); setAuthMessage(""); }}>Log in</button>
            </div>
            <div className="auth-heading"><h2>{authMode === "join" ? "You’re invited." : "You’re back."}</h2><p>{authMode === "join" ? "Your friends saved you a spot." : "Pick up where the group left off."}</p></div>
            <form className="auth-form" onSubmit={submitAuth}>
              {authMode === "join" && <>
                <FieldLabel label="Your invite code"><Input autoComplete="off" required value={inviteCode} onChange={(event) => setInviteCode(event.target.value.toUpperCase())} placeholder="ASK A FRIEND" /></FieldLabel>
                <FieldLabel label="Username"><div className="input-prefix"><AtSign size={16} /><Input required maxLength={24} autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value.replace(/[^a-zA-Z0-9_]/g, ""))} placeholder="yourname" /></div></FieldLabel>
                <FieldLabel label="A little about you"><Textarea maxLength={160} value={bio} onChange={(event) => setBio(event.target.value)} placeholder="What’s your current thing?" rows={2} /></FieldLabel>
                <div className="field-label"><span>Your vibe</span><div className="vibe-options">{vibeOptions.map((vibe) => <button className={`vibe-chip ${pickedVibes.includes(vibe) ? "selected" : ""}`} type="button" key={vibe} onClick={() => setPickedVibes((current) => current.includes(vibe) ? current.filter((item) => item !== vibe) : current.length < 5 ? [...current, vibe] : current)}>{pickedVibes.includes(vibe) && <Check size={12} />}{vibe}</button>)}</div></div>
                <FieldLabel label="Email"><Input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></FieldLabel>
                <FieldLabel label="Password"><Input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" /></FieldLabel>
              </>}
              {authMode === "login" && <>
                <FieldLabel label="Email"><Input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></FieldLabel>
                <FieldLabel label="Password"><Input type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your password" /></FieldLabel>
              </>}
              {authMessage && <p className="form-message" role="status">{authMessage}</p>}
              <Button className="auth-submit" type="submit" disabled={authBusy}>{authBusy ? "One sec…" : authMode === "join" ? <>Join the group <ArrowLeft className="arrow-flip" size={17} /></> : <>Log in <ArrowLeft className="arrow-flip" size={17} /></>}</Button>
            </form>
            <div className="auth-divider"><span /> or <span /></div>
            <Button variant="outline" className="google-button" onClick={() => void signInGoogle()} disabled={authBusy}><GoogleMark /> Continue with Google</Button>
            <p className="auth-legal">By joining, you’re here with your friends. Keep it kind. Keep it yours.</p>
          </section>
        </div>
        <footer className="entry-footer"><span>made for your inner circle</span><span>EST. AFTER THE GROUP CHAT</span></footer>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="entry-page profile-setup">
        <div className="entry-nav"><Brand /><div className="entry-nav-actions"><ThemePicker /><Button variant="ghost" size="icon" title="Sign out" aria-label="Sign out" onClick={() => void signOut()}><LogOut size={18} /></Button></div></div>
        <section className="setup-panel">
          <div className="eyebrow"><Sparkles size={14} /> ONE LAST THING</div>
          <h1>You’re almost<br /><span>in.</span></h1>
          <p>Drop your invite code and set up your little corner.</p>
          <form className="auth-form" onSubmit={joinExistingAccount}>
            <FieldLabel label="Invite code"><Input required value={inviteCode} onChange={(event) => setInviteCode(event.target.value.toUpperCase())} placeholder="ASK A FRIEND" /></FieldLabel>
            <FieldLabel label="Username"><div className="input-prefix"><AtSign size={16} /><Input required maxLength={24} value={username} onChange={(event) => setUsername(event.target.value.replace(/[^a-zA-Z0-9_]/g, ""))} placeholder="yourname" /></div></FieldLabel>
            <FieldLabel label="A little about you"><Textarea maxLength={160} value={bio} onChange={(event) => setBio(event.target.value)} placeholder="What’s your current thing?" rows={2} /></FieldLabel>
            <div className="field-label"><span>Your vibe</span><div className="vibe-options">{vibeOptions.map((vibe) => <button className={`vibe-chip ${pickedVibes.includes(vibe) ? "selected" : ""}`} type="button" key={vibe} onClick={() => setPickedVibes((current) => current.includes(vibe) ? current.filter((item) => item !== vibe) : current.length < 5 ? [...current, vibe] : current)}>{pickedVibes.includes(vibe) && <Check size={12} />}{vibe}</button>)}</div></div>
            {authMessage && <p className="form-message" role="status">{authMessage}</p>}
            <Button className="auth-submit" type="submit" disabled={authBusy}>{authBusy ? "Checking your invite…" : <>Open the door <ArrowLeft className="arrow-flip" size={17} /></>}</Button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <aside className="left-rail">
        <div className="rail-brand"><Brand /></div>
        <div className="group-switcher"><span className="group-symbol">✳</span><span><strong>the inner circle</strong><small>{members.length || 1} besties</small></span><ChevronDown size={15} /></div>
        <nav className="primary-nav" aria-label="Main navigation">
          <NavItem icon={<Sparkles size={18} />} label="The feed" active={view === "home"} onClick={() => setView("home")} />
          <NavItem icon={<MessageCircle size={18} />} label="Group chat" active={view === "chat"} onClick={() => setView("chat")} badge={messages.length > 0 ? "live" : undefined} />
          <NavItem icon={<Paperclip size={18} />} label="Shared stuff" active={view === "files"} onClick={() => setView("files")} />
          <NavItem icon={<Users size={18} />} label="Your profile" active={view === "profile"} onClick={() => setView("profile")} />
        </nav>
        <div className="rail-spacer" />
        <div className="rail-now"><span className="status-dot" /> YOUR CIRCLE IS ACTIVE</div>
        <button type="button" className="account-switch" onClick={() => setView("profile")}><Avatar profile={profile} size="sm" /><span><strong>@{profile.username}</strong><small>your space</small></span><MoreHorizontal size={17} /></button>
      </aside>

      <main className={`main-content ${view === "chat" ? "chat-main" : ""}`}>
        <div className="community-style-bar"><span>✳ &nbsp; NIGHTSHIFT SOCIAL CLUB</span><ThemePicker /></div>
        <header className="mobile-topbar"><Brand /><button type="button" className="mobile-profile" onClick={() => setView("profile")}><Avatar profile={profile} size="sm" /></button></header>
        <div className="content-heading"><div><div className="eyebrow"><span className="status-dot" /> YOUR LITTLE CORNER OF THE INTERNET</div><h1>{view === "home" ? <>the <span>feed.</span></> : view === "chat" ? <>say <span>anything.</span></> : view === "files" ? <>good <span>things.</span></> : <>that’s <span>you.</span></>}</h1><p>{view === "home" ? "The latest from your favorite people." : view === "chat" ? "The group chat, minus the chaos of 200 unread texts." : view === "files" ? "Notes, files, links — all in one spot." : "Your corner of the group."}</p></div><div className="heading-date"><span className="live-badge"><span className="status-dot" /> CLOSE FRIENDS</span><span>EST. AFTER THE GROUP CHAT</span></div></div>

        {pageMessage && <div className="page-alert" role="status">{pageMessage}<button type="button" aria-label="Dismiss" onClick={() => setPageMessage("")}><X size={16} /></button></div>}

        {view === "home" && <div className="feed-layout"><section className="feed-column" aria-label="Friends feed">
          <form className="composer" onSubmit={submitPost}>
            <div className="composer-top"><Avatar profile={profile} /><Textarea maxLength={2000} value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="What’s the vibe today?" aria-label="Write a post" rows={2} /></div>
            {postImage && <div className="selected-file"><ImagePlus size={15} /><span>{postImage.name}</span><button type="button" onClick={() => { setPostImage(null); if (feedFileInput.current) feedFileInput.current.value = ""; }} aria-label="Remove selected image"><X size={15} /></button></div>}
            <div className="composer-bottom"><div className="composer-tools"><input ref={feedFileInput} className="visually-hidden" type="file" accept="image/*" onChange={(event) => setPostImage(event.target.files?.[0] ?? null)} /><Button variant="ghost" size="sm" type="button" onClick={() => feedFileInput.current?.click()}><ImagePlus size={16} /> Photo</Button><span className="composer-hint">only your circle sees it</span></div><Button type="submit" size="sm" disabled={feedBusy || (!caption.trim() && !postImage)}>{feedBusy ? "Posting…" : <>Post <ArrowLeft className="arrow-flip" size={15} /></>}</Button></div>
          </form>
          {feedBusy && posts.length === 0 && <div className="empty-line">getting the latest…</div>}
          {!feedBusy && visiblePosts.length === 0 && <div className="empty-state"><span className="empty-icon"><Sparkles size={22} /></span><h2>It’s giving fresh start.</h2><p>Drop the first photo or thought in the group.</p></div>}
          <div className="post-list">{visiblePosts.map((post) => <PostCard key={post.id} post={post} profile={profile} onLike={() => void toggleLike(post)} onComment={(form) => void addComment(post.id, form)} />)}</div>
        </section><aside className="right-rail"><div className="rail-section"><div className="section-label">YOUR PEOPLE <span>{members.length.toString().padStart(2, "0")}</span></div><div className="people-list">{members.slice(0, 8).map((member, index) => <div className="person-row" key={member.id}><div className="person-avatar-wrap"><Avatar profile={member} size="sm" accent={index} /><span className="person-online" /></div><span><strong>{member.id === user.id ? "you" : `@${member.username}`}</strong><small>{member.vibe_tags?.[0] ?? "one of the crew"}</small></span><span className="person-spark">✳</span></div>)}{members.length === 0 && <p className="muted-text">Your people will show up here.</p>}</div></div><div className="sticker-note"><img src={nightshiftCharm} alt="" width={74} height={74} loading="lazy" /><div><strong>the group, but better.</strong><span>just your people ✳</span></div></div><div className="rail-quote">“we should make a group for this”<span>— every friend group, ever</span></div></aside></div>}

        {view === "chat" && <section className="chat-panel" aria-label="Group chat"><div className="chat-topline"><div className="chat-dot-stack">{members.slice(0, 4).map((member, index) => <Avatar key={member.id} profile={member} size="xs" accent={index} />)}</div><div><strong>the inner circle</strong><span>{members.length} friends · private</span></div><span className="live-badge"><span className="status-dot" /> HERE NOW</span></div><div className="message-list">{messages.length === 0 && <div className="chat-empty"><MessageCircle size={24} /><p>It’s quiet in here. Someone break the ice.</p></div>}{messages.map((message, index) => { const mine = message.author_id === user.id; const showAuthor = !mine && (index === 0 || messages[index - 1]?.author_id !== message.author_id); return <div className={`message-row ${mine ? "mine" : ""}`} key={message.id}>{!mine && <div className="message-avatar-slot">{showAuthor && <Avatar profile={message.profile} size="xs" />}</div>}<div className="message-content">{showAuthor && <span className="message-author">@{message.profile?.username ?? "friend"}</span>}<div className="message-bubble">{message.body}</div><time>{new Date(message.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time></div></div>; })}<div ref={chatEnd} /></div><form className="chat-compose" onSubmit={sendChat}><Input value={messageDraft} onChange={(event) => setMessageDraft(event.target.value)} maxLength={2000} placeholder="drop a thought…" aria-label="Message" /><Button size="icon" aria-label="Send message" disabled={!messageDraft.trim()}><Send size={17} /></Button></form></section>}

        {view === "files" && <div className="files-layout"><section className="files-column"><form className="share-composer" onSubmit={submitShared}><div className="share-composer-heading"><div className="share-icon"><Plus size={17} /></div><div><h2>Drop something in.</h2><p>Leave a note or pass a file around.</p></div></div><FieldLabel label="Title"><Input value={shareTitle} onChange={(event) => setShareTitle(event.target.value)} required maxLength={120} placeholder="what are we saving?" /></FieldLabel><FieldLabel label="Note"><Textarea value={shareBody} onChange={(event) => setShareBody(event.target.value)} maxLength={10000} rows={3} placeholder="Add a little context…" /></FieldLabel><div className="share-actions"><input ref={sharedFileInput} className="visually-hidden" type="file" onChange={(event) => setShareFile(event.target.files?.[0] ?? null)} /><Button type="button" variant="outline" size="sm" onClick={() => sharedFileInput.current?.click()}><Paperclip size={15} />{shareFile ? shareFile.name : "Attach a file"}</Button><Button type="submit" size="sm" disabled={sharing || !shareTitle.trim()}>{sharing ? "Sharing…" : "Share it"}</Button></div></form><div className="files-feed-heading"><span>THE SHARED DRAWER</span><span>{sharedItems.length} ITEMS</span></div>{sharedItems.length === 0 && <div className="empty-state"><span className="empty-icon"><FileText size={21} /></span><h2>Nothing saved. Yet.</h2><p>Notes and files from the group will live here.</p></div>}<div className="shared-list">{sharedItems.map((item) => <SharedItemCard item={item} key={item.id} currentUserId={user.id} />)}</div></section><aside className="files-aside"><div className="section-label">A LITTLE REMINDER</div><p className="files-aside-copy">Some things are too good to get lost in the chat.</p><div className="files-count"><span>{sharedItems.length.toString().padStart(2, "0")}</span><small>things the group<br />wanted to keep</small></div></aside></div>}

        {view === "profile" && <div className="profile-layout"><section className="profile-main"><div className="profile-cover"><span className="cover-spark">✳</span><span className="cover-text">made of<br />good times</span></div><div className="profile-header"><div className="profile-avatar-large"><Avatar profile={profile} size="xl" /></div><div className="profile-actions"><Button variant="outline" size="sm" onClick={() => void signOut()}><LogOut size={15} /> Log out</Button></div><h2>@{profile.username}</h2><p>{profile.bio || "A work in progress, like the rest of us."}</p><div className="profile-tags">{(profile.vibe_tags ?? []).map((tag) => <span key={tag}>{tag}</span>)}</div><div className="profile-stats"><div><strong>{posts.filter((post) => post.author_id === user.id).length}</strong><span>posts</span></div><div><strong>{members.length}</strong><span>close friends</span></div><div><strong>✳</strong><span>your circle</span></div></div></div><div className="profile-grid-heading"><span>YOUR GRID</span><span>{posts.filter((post) => post.author_id === user.id).length} POSTS</span></div>{posts.filter((post) => post.author_id === user.id).length === 0 ? <div className="empty-state profile-empty"><span className="empty-icon"><ImagePlus size={21} /></span><h2>Your grid starts here.</h2><p>Share a moment with your friends.</p><Button size="sm" onClick={() => setView("home")}>Back to the feed</Button></div> : <div className="profile-grid">{posts.filter((post) => post.author_id === user.id).map((post) => <button type="button" className="grid-image" key={post.id} onClick={() => setView("home")}>{post.imageUrl ? <img src={post.imageUrl} alt={post.caption || "Your post"} /> : <span>{post.caption}</span>}</button>)}</div>}</section><aside className="profile-aside"><div className="section-label">YOUR VIBE</div><p className="profile-aside-text">You made it your own. Keep doing that.</p><img src={nightshiftCharm} alt="Chrome lime star charm" width={114} height={114} loading="lazy" /><div className="member-count"><Users size={16} /><span>You’re one of <strong>{members.length}</strong> here.</span></div></aside></div>}

        <footer className="app-footer"><span>THE INNER CIRCLE · {members.length} FRIENDS</span><button type="button" onClick={() => setView("home")}>back to the good stuff ↑</button></footer>
      </main>
    </div>
  );
}

function Brand() { return <div className="brand"><img src={nightshiftCharm} alt="" width={36} height={36} /><span>nightshift<span className="brand-period">.</span></span></div>; }

function FieldLabel({ label, children }: { label: string; children: ReactNode }) { return <label className="field-label"><span>{label}</span>{children}</label>; }

function Avatar({ profile, size = "md", accent = 0 }: { profile: Profile | null; size?: "xs" | "sm" | "md" | "xl"; accent?: number }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (profile?.avatar_path) void supabase.storage.from(uploadBucket).createSignedUrl(profile.avatar_path, 3600).then(({ data }) => { if (active) setUrl(data?.signedUrl ?? null); });
    return () => { active = false; };
  }, [profile?.avatar_path]);
  return <span className={`avatar avatar-${size} avatar-accent-${accent % 4}`}>{url ? <img src={url} alt={`@${profile?.username ?? "friend"}`} /> : <span>{profile?.username?.slice(0, 1).toUpperCase() ?? "✳"}</span>}</span>;
}

function NavItem({ icon, label, active, onClick, badge }: { icon: ReactNode; label: string; active: boolean; onClick: () => void; badge?: string | undefined }) {
  return <button type="button" className={`nav-item ${active ? "active" : ""}`} onClick={onClick}>{icon}<span>{label}</span>{badge && <i>{badge}</i>}</button>;
}

function PostCard({ post, profile, onLike, onComment }: { post: FeedPost; profile: Profile; onLike: () => void; onComment: (form: HTMLFormElement) => void }) {
  return <article className="post-card"><div className="post-header"><Avatar profile={post.profile} size="sm" /><div className="post-author"><strong>@{post.profile?.username ?? "friend"}</strong><span>{new Date(post.created_at).toLocaleDateString([], { month: "short", day: "numeric" })} · close friends</span></div><button type="button" className="icon-plain" aria-label="More post options"><MoreHorizontal size={19} /></button></div>{post.imageUrl && <div className="post-image-wrap"><img src={post.imageUrl} alt={post.caption || "Photo shared with the group"} /></div>}{post.caption && <p className="post-caption"><strong>@{post.profile?.username ?? "friend"}</strong> {post.caption}</p>}<div className="post-actions"><Button type="button" variant="ghost" size="sm" className={`like-button ${post.liked ? "liked" : ""}`} onClick={onLike}><Heart size={17} fill={post.liked ? "currentColor" : "none"} />{post.likes}</Button><span className="comment-count"><MessageCircle size={16} />{post.comments.length}</span><span className="group-only">ONLY THE GROUP</span></div>{post.comments.slice(-3).map((comment) => <p className="post-comment" key={comment.id}><strong>@{comment.profile?.username ?? "friend"}</strong> {comment.body}</p>)}<form className="comment-form" onSubmit={(event) => { event.preventDefault(); onComment(event.currentTarget); }}><Avatar profile={profile} size="xs" /><Input name="comment" maxLength={1000} aria-label="Write a comment" placeholder="add your two cents…" /><Button type="submit" variant="ghost" size="sm">Post</Button></form></article>;
}

function SharedItemCard({ item, currentUserId }: { item: SharedItem; currentUserId: string }) {
  const isFile = item.item_type === "file";
  return <article className="shared-item"><div className={`shared-item-icon ${isFile ? "file-icon" : "note-icon"}`}>{isFile ? <Paperclip size={19} /> : <FileText size={19} />}</div><div className="shared-item-copy"><div className="shared-item-meta"><span>{isFile ? "FILE" : "NOTE"}</span><span>·</span><span>@{item.profile?.username ?? "friend"}{item.author_id === currentUserId ? " · YOU" : ""}</span></div><h3>{item.title}</h3>{item.body && <p>{item.body}</p>}{isFile && <span className="shared-file-info">{item.mime_type?.split("/").pop()?.toUpperCase() ?? "FILE"}{item.size_bytes ? ` · ${formatBytes(item.size_bytes)}` : ""}</span>}</div>{isFile && item.downloadUrl && <a className="download-button" href={item.downloadUrl} target="_blank" rel="noreferrer" aria-label={`Open ${item.title}`}><ArrowDownToLine size={17} /></a>}</article>;
}

function formatBytes(bytes: number) { return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`; }

function GoogleMark() { return <span className="google-mark" aria-hidden="true">G</span>; }
