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

## Project architecture

- Public seller applications submit through a public server function with strict validation; approvals remain admin-only so visitor contact details are never exposed. 
- Protected server functions are invoked only after browser session hydration from public routes; server-side middleware remains the authority for admin and seller authorization.
