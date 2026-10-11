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

- SEO "movies like" pages are generated once by the admin and stored in `seo_pages`; public routes only read published rows (never call the AI on page view) — keeps pages fast, crawlable and cost-free per visit.
- `/sitemap.xml` is a server route with a hand-kept static path list plus published `seo_pages`; add new public pages to that list — no router-derived helper is installed.
