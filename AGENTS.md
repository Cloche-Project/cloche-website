## Project notes

- Cloche project website (Astro + Starlight + `starlight-blog`), static output served by Caddy in an OCI image. See `README.md` for the full workflow.
- The host is immutable: run Node/npm inside the `cloche-web-dev` distrobox (`flatpak-spawn --host distrobox enter cloche-web-dev -- <cmd>` from the Claude Code sandbox). Podman and git run on the host via `flatpak-spawn --host`.
- `scripts/fetch-status.mjs` writes `src/data/status.json` (git-ignored). Keep its `IMAGES` list in sync with the image names in the Cloche repos' recipes.
- No pushes or remote repo creation without the user's confirmation. Never commit `cosign.key`.
- Pending: generate the Cosign key pair (`cosign.pub` + `SIGNING_SECRET`), then re-enable the push/PR/cron triggers in `.github/workflows/build.yml` (manual-only for now). The site is not hosted yet; the user will run it on a homelab later.
- Domain, TLS, Quadlet and auto-update are deferred until Cloche Pro Server exists.
- Content authoring: `npm run studio` is a local, forge-agnostic editor for blog posts (content types live in `studio.config.mjs`); `npm run new-post` is the CLI equivalent. Add a collection there before writing a new one-off tool. Its body editor is Vditor (visual/WYSIWYG) served from `node_modules`; it only normalizes Markdown once the body is actually edited (see the README for the exact rewrites).
- Multilingual: English (root), `pt-br`, `es` via Starlight i18n. Translations are manual and paired by identical relative path/filename under `src/content/docs/<locale>/`; UI strings live in `src/content/i18n/<lang>.json` (add a key to all three when adding a string). The `@pelagornis/page` theme is localized by `localizeTheme()` in `astro.config.mjs` (compiled-module string patches; it warns when the theme changes). The studio reads `locales`/`localeDirs` from `studio.config.mjs`; it has separate `blog`, `docs` and `pages` collections (tabs; each `description` shows in the bottom-left help card). Docs feed the "Getting started" sidebar group via `autogenerate` from `docs/`, ordered by `sidebar.order`; `.mdx` opens as Markdown only. See the README's Languages section.
- The user is decoupling their tooling from GitHub and `gh`. Do not design new workflows that depend on GitHub features (web editor, OAuth apps, `gh`); prefer local, forge-agnostic tools. CI is still GitHub Actions for now.

## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
