<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep selectable theme tokens and treatments in global CSS via the root data-theme; keep the signed-out entry on a transient, non-persisted neon look and expose saved theme switching only after authentication, so public presentation stays independent of personal preferences.
- Keep theme preferences in browser storage, read after hydration; theme changes are personal and never alter group data.
