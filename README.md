*[Leia em Português](README.pt-BR.md)*

# cloche-website

Source of the Cloche project website: landing page, documentation, blog/changelog and an image status page.

- Built with [Astro](https://astro.build) and [Starlight](https://starlight.astro.build); the blog comes from the `starlight-blog` plugin.
- Output is 100% static, packaged as an OCI image served by [Caddy](https://caddyserver.com).
- Built and Cosign-signed by GitHub Actions, published to `ghcr.io/cloche-project/cloche-website`.
- Run on demand with Podman. Nothing here is meant to be permanent on a machine yet.

## Repository layout

| Path | Purpose |
|------|---------|
| `src/content/docs/index.mdx` | Landing page (Starlight `splash` template) |
| `src/content/docs/docs/` | Documentation pages (`variants.md`, `install.md`) |
| `src/content/docs/blog/` | Blog posts, named `YYYY-MM-DD-slug.md` |
| `src/content/docs/{pt-br,es}/`, `src/content/i18n/` | Translated pages and posts (same paths as the English ones), and the interface strings per language |
| `src/content/docs/status.mdx` | Image status page, renders `src/components/ImageStatus.astro` |
| `studio.config.mjs`, `scripts/studio/` | Local content editor (`npm run studio`): content types in the config, server and UI in the folder |
| `scripts/new-post.mjs` | `npm run new-post`: creates a blog post file from the terminal |
| `scripts/fetch-status.mjs` | Queries the latest CI run of each image repo and writes `src/data/status.json` (git-ignored) |
| `astro.config.mjs` | Site title, sidebar, plugins |
| `src/content.config.ts` | Content schema (docs + blog frontmatter) |
| `Containerfile`, `Caddyfile` | Multi-stage image: Node builds `dist/`, Caddy serves it |
| `run-local.sh` | Build the image and serve it on `localhost:8080` |
| `.github/workflows/build.yml` | CI: build, push to GHCR, sign with Cosign |
| `cosign.pub` | Public key to verify the image (add after key generation, see below) |

## 1. Run the site (no dev tooling needed)

Podman is all you need. Pull and run the published image:

```bash
podman run --rm -p 8080:80 ghcr.io/cloche-project/cloche-website:latest
```

Or build it from this checkout and serve it in the foreground:

```bash
./run-local.sh            # PORT=9090 ./run-local.sh to change the port
```

Open <http://localhost:8080>. Stop with Ctrl+C. To run detached instead:

```bash
podman run -d --rm --name cloche-website -p 8080:80 ghcr.io/cloche-project/cloche-website:latest
podman stop cloche-website
```

On an immutable host where Podman lives on the host and you work from a sandbox (for example the Claude Code Flatpak), prefix commands with `flatpak-spawn --host`.

## 2. Develop the site

### The dev distrobox (`cloche-web-dev`)

All the Node tooling (`npm install`, the dev server, the studio, builds and the content scripts) runs in a [Distrobox](https://distrobox.it) container named `cloche-web-dev`. The host is an immutable Cloche system, so Node is kept out of it instead of being layered with `rpm-ostree install`, which would need a reboot and stay on the host for good.

**What it is.** A Fedora container (`fedora:latest`, currently Fedora 44) with Node.js 22, npm and git. Unlike a plain container, it shares parts of the host:

- **Your home directory.** The repository has the same path inside and outside (`~/Documents/git/cloche-website`), and nothing is copied. `node_modules/` lives in the repository.
- **The network.** A server started inside, such as `npm run dev` (port 4321) or `npm run studio` (port 4400), is reachable from the host browser at `localhost`, with no port forwarding.
- **Your user.** Same name and UID, so files it creates belong to you.

**What runs where.** Node, npm and the scripts run in the distrobox. Podman (building and running the site image, `run-local.sh`) runs on the host, not in the distrobox. Git works in both.

Create it once:

```bash
distrobox create --name cloche-web-dev --image fedora:latest --yes
distrobox enter cloche-web-dev -- sudo dnf install -y nodejs npm git
```

The first `enter` finishes the container setup and can take a minute. Today `nodejs` resolves to Node 22; keep it on the same major as CI and the `Containerfile` (both use 22).

Using it:

| Goal | Command |
|------|---------|
| Open a shell inside it | `cd ~/Documents/git/cloche-website`, then `distrobox enter cloche-web-dev` (it keeps your current directory) |
| Run a single command | `distrobox enter cloche-web-dev -- sh -c 'cd ~/Documents/git/cloche-website && npm run build'` |
| Do the same from a Flatpak-sandboxed terminal (for example the VS Code or Claude Code terminal) | prefix with `flatpak-spawn --host`: `flatpak-spawn --host distrobox enter cloche-web-dev -- ...` |
| List or stop it | `distrobox list`, `distrobox stop cloche-web-dev` |

Maintenance:

- **Update its packages:** `distrobox enter cloche-web-dev -- sudo dnf upgrade -y`.
- **Start over:** `distrobox rm --force cloche-web-dev`, then run the two create commands again. The container holds no data of its own (the repository and `node_modules/` are in your home), so recreating it is safe. After recreating it, run `npm install` again only if `node_modules/` was built for a different Node version.
- **Optional, visual checks:** Chromium lets you take headless screenshots of the site or the studio. It is not needed to develop or build. Install it with `distrobox enter cloche-web-dev -- sudo dnf install -y chromium` and run `chromium-browser --headless=new --no-sandbox --screenshot=out.png URL`.

Troubleshooting:

| Symptom | Cause and fix |
|---------|---------------|
| `npm error ... Could not read package.json` | You are not in the repository directory (for example you entered the distrobox from `~`). `cd ~/Documents/git/cloche-website`. `distrobox enter` keeps the directory you were in, so entering from the repository already lands you there. |
| `node: command not found` | You are on the host, not inside the distrobox. Enter it first. |
| `distrobox: command not found` | You are in a Flatpak-sandboxed terminal. Prefix the command with `flatpak-spawn --host`. |
| A dev server does not open at `localhost` | Another process is probably using the port. Change it (`STUDIO_PORT=4500 npm run studio`, or `npm run dev -- --port 4322`). No forwarding is needed since the network is shared. |

### Everyday commands

`distrobox enter` keeps your current directory, so `cd` into the repository first and then enter:

```bash
cd ~/Documents/git/cloche-website
distrobox enter cloche-web-dev
```

Then, inside the distrobox:

```bash
npm install
npm run dev        # fetch status and changelog, then dev server with live reload (http://localhost:4321)
npm run build      # fetch status and changelog, then production build into dist/
npm run preview    # serve dist/ locally
npm run studio     # local content editor (http://localhost:4400)
npm run new-post -- "Title"   # create a blog post from the terminal
```

`fetch-status` and `fetch-changelog` call the GitHub API anonymously (60 requests/hour limit). If it fails or is rate limited, they keep the previous data files and the build still succeeds. Set `GITHUB_TOKEN` in the environment to raise the limit.

### Editing content

- **Docs page**: add a Markdown file under `src/content/docs/docs/` with `title` and `description` frontmatter, then add it to the `sidebar` in `astro.config.mjs`.
- **Blog post**: add `src/content/docs/blog/YYYY-MM-DD-slug.md`:

  ```markdown
  ---
  title: Post title
  date: 2026-09-20
  excerpt: One-line summary shown in the post list.
  ---
  ```

- **Header**: translucent and blurred, floating over the scrolling content. The `backdrop-filter` is set on the `.header` wrapper (it has no effect on the theme's own `.page-header`) and written unprefixed, because the CSS minifier collapses a prefixed pair into the `-webkit-` one, which Chrome and Firefox ignore. The theme hides the header links on small screens; `custom.css` keeps Download, Docs, Blog and Status visible; under 400px the GitHub icon is hidden and the links scroll sideways so the search and theme buttons stay on screen.
- **Download page**: `src/content/docs/download.mdx` renders `src/components/DownloadCards.astro`, one card per family (Cloche, Cloche PRO, Cloche Xe) with a disabled "ISO coming soon" button. When an ISO is published, replace that button with a link in the component. `src/content/docs/docs/build-iso.md` documents building an ISO yourself with `cloche-build` (from the `cloche-utils` repo); keep it in sync with `cloche-utils/cloche-build/README.md` (variants, requirements, the unattended-install disk warning).
- **Tables**: every Markdown table is wrapped in `<div class="md-table-wrap">` by a small rehype plugin in `astro.config.mjs`, and styled in `custom.css` (border, padding, sideways scroll). Starlight makes tables `display: block`, so the CSS sets `display: table` to let them fill the width. The status page reuses the same class.
- **Home carousel** (Cloche, Cloche PRO and Cloche Xe): edit the `slides` array at the top of `src/components/HeroCarousel.astro` (titles follow the images' os-release pretty names, e.g. "Cloche PRO"; text and buttons). Slides cross-fade in a stacked grid. It auto-rotates every 8 s, pauses on hover/focus and via its pause button, and respects `prefers-reduced-motion`. The footer text is the `footerText` option in `astro.config.mjs`.
- **New image on the status page**: add an entry (`image` and `repo`) to `IMAGES` in `scripts/fetch-status.mjs`, and a row in `src/content/docs/docs/variants.md`.

### Studio: a local editor for content

`npm run studio` starts a small local web editor for the site's content, so you can write without the terminal or GitHub. Inside the distrobox:

```bash
npm run studio          # then open http://localhost:4400
```

The window follows the layout of a document app: the list of entries on the left, the content in the center, and a properties inspector on the right. The title is the large field above the content (press Enter to jump into the text). The other fields (date, excerpt, tags, authors, featured, draft) live in the inspector, grouped in sections. Both side panels collapse, with the buttons at the ends of the toolbar or with `Ctrl/⌘+Alt+S` (list) and `Ctrl/⌘+Alt+I` (inspector), and the choice is remembered, so you can write with only the text on screen. On narrow windows the panels float over the content. The surfaces are translucent, blurred glass (the toolbar, the document bar, the formatting bar and the two panels, which float inset from the window edges) over a soft background, and the colors follow the system's light or dark mode; the sun/moon button in the toolbar overrides it and the choice is remembered. Browsers without `backdrop-filter` get solid surfaces instead.

The **Visual | Markdown | Preview** control above the content switches between a visual (WYSIWYG) editor ([Vditor](https://github.com/Vanessa219/vditor)) with a formatting toolbar for headings, lists, tables, code and links, a plain Markdown editor over the same text, and a preview rendered by the site's Markdown pipeline. The file is written into the repository (`src/content/docs/blog/`). `Ctrl+S` saves, and deep links work (`http://localhost:4400/#2026-09-20-hello-cloche.md`). **Download** downloads the file exactly as it would be saved (frontmatter and content) without saving anything. The studio does not run git: commit and publish the way you normally do.

- **Local only.** It listens on `127.0.0.1`, rejects requests addressed to any other host name and requires a token that only the page it serves knows, so other websites cannot make it write files. There is no login, and the visual editor's files are served by the studio itself from `node_modules`, so nothing is loaded from the internet.
- **Languages.** With `locales` in `studio.config.mjs` (English is the source, then Português and Español), every list row shows one badge per language: filled when the file exists, outlined when it is missing. Open an entry and the *Language* section at the top of the properties panel lists the languages: **Open** switches to that translation, **Create** starts a copy of the English text to translate in place, and nothing is written until you save. A new translation is saved with the same file name in the language's folder (`localeDirs`), which is what pairs it with the original, and keeps keys the form does not edit (such as `cover`). Deep links include the language: `#pt-br:2026-09-20-hello-cloche.md`. Leave `locales` out for a single-language site.
- **Safe with existing files.** Frontmatter keys the form does not know (`cover`, `metrics`...) and authors written as objects are kept as they are. Comments inside the frontmatter are not preserved. The studio never renames or deletes files.
- **The visual editor rewrites some Markdown, but only once you edit the content.** Opening a post and saving it without touching the content never reformats it. After an edit in the visual editor, its Markdown is normalized: tables are rewritten with compact separator rows (`| - | - |`), `<https://...>` autolinks become `[url](url)`, `[x]` becomes `[X]`, GitHub-style `> [!NOTE]` alerts get an emoji title, and a hard line break written as two trailing spaces is lost (it becomes a soft break, which renders differently). Starlight `:::note` and `:::caution` asides, code blocks and lists are kept. Switch to the Markdown editor when you need exact control. Image upload is not set up.
- **The preview is approximate.** It uses the same Markdown pipeline as the site (tables, code blocks), but not Starlight's `:::note` callouts or components, and not the site theme.
- Change the port with `STUDIO_PORT=4500 npm run studio`.

Content types are defined in `studio.config.mjs`: a folder, a file-name pattern and a list of fields. To edit another kind of content, add a collection (several collections show up as tabs):

```js
{
	id: 'notes',
	label: 'Release notes',
	singular: 'note',
	dir: 'src/content/docs/notes',
	filename: '{date}-{slug}.md',
	slugFrom: 'title',
	fields: [
		{ name: 'title', label: 'Title', type: 'string', required: true },
		{ name: 'date', label: 'Date', type: 'date', required: true, default: 'today' },
		{ name: 'tags', label: 'Tags', type: 'list' },
	],
},
```

Field types: `string`, `text` (multi-line), `date`, `number`, `list` (comma-separated), `people` (names, or ids listed in `known`) and `boolean`. A field name with a dot, such as `sidebar.order`, is written inside that block of the frontmatter (`sidebar:` then `order:`) and the block's other keys (`badge`, `label`...) are kept. The optional `editor` setting (`'visual'`, the default, or `'source'`) chooses which content editor a collection opens with; the last choice is remembered in the browser. The `titleField` (default: `slugFrom`, then `title`) is the field shown as the large title above the content; every other field goes into the inspector, in the section named by its `group` (fields without one go under "Properties").

For languages, add `locales: [{ id, label, short }]` at the top level (the first is the source) and `localeDirs: { <id>: '<folder>' }` to each collection whose content is translated.

**Blog, Docs and Pages.** Each kind of content is its own tab, and a discreet help button (?) in the bottom-left corner opens a small card saying what it is, where it shows up on the site (the collection's `description`) and which folder its files live in. *Blog posts* are `src/content/docs/blog/`. *Docs* are `src/content/docs/docs/`: the "Getting started" sidebar group is generated from that folder (`autogenerate` in `astro.config.mjs`) and ordered by `sidebar.order` in each page's frontmatter (the *Order* field), so a new doc shows up without touching the config; without an order it sorts alphabetically. *Pages* are the standalone pages at the top of `src/content/docs/` (home, download, status, changelog); they are reached from the header or the sidebar in `astro.config.mjs`, not automatically. Files ending in `.mdx` use components and imports, so they open as Markdown only (no Visual, no Preview). In the sidebar of another language an untranslated doc keeps its English title until it is translated. Collections can also set `recursive` and `exclude` to read subfolders (file names are then relative paths); none of the current ones need it.

To reuse the studio in another repository, copy `scripts/studio/`, `scripts/lib/slug.mjs` and `studio.config.mjs`, install `yaml`, `vditor` and `@astrojs/markdown-remark`, and add the `studio` script to `package.json`.

### Languages

The site is in **English** (the default, at the root: `/docs/install/`), **Português (Brasil)** (`/pt-br/`) and **Español** (`/es/`). It uses Starlight's i18n, so a page that has no translation shows the English version with a notice ("This page is not available in your language yet"). Nothing breaks when a translation is missing.

| What | Where |
|------|-------|
| Languages, labels, `lang` codes | `locales` in `astro.config.mjs` |
| Interface strings (nav, buttons, the carousel, download, status, changelog, blog UI) | `src/content/i18n/<lang>.json` (`en.json`, `pt-BR.json`, `es.json`), read with `Astro.locals.t()` |
| Sidebar labels | `translations` on each `sidebar` entry in `astro.config.mjs` |
| Pages | `src/content/docs/<locale>/...`, with the same path as the English file (`pt-br/download.mdx`, `es/docs/install.md`) |
| Blog posts | `src/content/docs/<locale>/blog/`, with **the same file name** as the English post |

- **Translate a page or post**: create the file with the same relative path under the language folder. That is the whole pairing rule. For a post, the English one is the original: a translation only counts when its file name matches, and the English one is shown for languages that do not have it. In the studio, open the post and use *Language* in the properties panel (below).
- **Translated `.mdx` pages** that import components use one more `../` per folder level (`../../../components/...` from `pt-br/`), and their internal links carry the prefix (`/pt-br/download/`). Components read the current language and translate themselves; only the *content* of the page is duplicated.
- **Interface strings**: `en.json` is the reference. Keys are `cloche.*` (ours), `starlightBlog.*` (blog plugin) and Starlight's own. When you add a string in a component, add the key to all three files.
- **Add a language**: add it to `locales` (the key is the folder and URL prefix, `lang` is the BCP 47 code) and to `studio.config.mjs`, create `src/content/i18n/<lang>.json` (copy `en.json`), add `translations` for the sidebar labels, and create the folders. Right-to-left languages also need a review of the CSS (physical `left`/`right` in `custom.css` and the components).
- **Theme strings**: the `@pelagornis/page` theme hardcodes English in a few places (header links, search and menu labels). `localizeTheme()` in `astro.config.mjs` rewrites them at build time to use `Astro.locals.t`. It warns during the build when the theme changed and a pattern no longer matches: update `THEME_STRINGS` then. The header links in `pagePlugin({ navigation })` are translation keys for the same reason.
- **Search, RSS and sitemap** follow the language. Set `SITE_URL` to get per-language canonical and `hreflang` links (see below).
- Image names (Cloche, Cloche PRO, Cloche Xe) and technical terms are not translated.

### Writing blog posts

Posts are Markdown files in `src/content/docs/blog/`. The easiest way to write one is the [Studio](#studio-a-local-editor-for-content) above; the helper below does the same from a terminal (inside the distrobox):

```bash
npm run new-post -- "Cloche 44 is out" --tags release,cloche --excerpt "What is new in 44."
```

It writes `src/content/docs/blog/YYYY-MM-DD-cloche-44-is-out.md` (accents and symbols in the title are cleaned up for the file name) and refuses to overwrite an existing post. Options:

| Option | What it does |
|--------|--------------|
| `--tags a,b` | Comma-separated tags. Each tag gets its own page and shows in the blog sidebar. |
| `--author "Name"` | Credit a specific person. Without it the post is credited to the configured "Cloche Project" author. |
| `--excerpt "..."` | One-line summary shown in the post list. Without one, the whole post is shown in the list. |
| `--date YYYY-MM-DD` | Publication date (default: today). |
| `--featured` | Pin the post in the "Featured posts" group of the sidebar. |
| `--draft` | Keep the post out of production builds (it still shows in `npm run dev`). Remove `draft: true` to publish. |

Then edit the file, preview it with `npm run dev`, and publish by committing it to `main`. That works from a terminal or from the GitHub web editor (create the file in `src/content/docs/blog/`). CI rebuilds and publishes the image; a running container shows the post once it pulls the new image.

Frontmatter reference (only `title` and `date` are required):

| Field | Notes |
|-------|-------|
| `title`, `date` | `date` is `YYYY-MM-DD`. |
| `excerpt` | Summary for the list. |
| `tags` | A YAML list. |
| `authors` | An author id from `astro.config.mjs` (`cloche`), or `- name: "Person"` (optionally `title`, `picture`, `url`) for one-offs. Authors defined in the config are credited on every post that does not set `authors`, so keep only the default one there. |
| `featured` | `true` pins it in the sidebar. |
| `draft` | `true` excludes it from production builds. |
| `cover` | `cover: { alt: "...", image: ../../../assets/blog/pic.png }`, a path relative to the post file (images live under `src/assets/`). |

The reading time is calculated automatically. Code blocks and callouts (`:::note`, `:::caution`) work as in the docs pages.

### Changelog

`src/content/docs/changelog.mdx` renders `src/components/Changelog.astro` from `src/data/changelog.json` (git-ignored). `scripts/fetch-changelog.mjs` builds that file at build time from each image repository's commit history on `main`, grouped by family (Cloche, Cloche PRO, Cloche Xe; the repo lists are at the top of the script). Commits are read as conventional commits (`fix:`, `feat:`, `perf:`...); `docs`, `ci`, `chore`, `test`, `style` and `build` commits and merge commits are left out. The daily CI run keeps it fresh. If the GitHub API is unreachable or rate limited, the script keeps the previous data file, as `fetch-status` does. Use the Blog for announcements and longer write-ups.

### RSS, sitemap and canonical URLs

They only exist once the site knows its public URL. Set `SITE_URL`:

- locally: `SITE_URL=https://example.org npm run build`
- in CI: define a repository **variable** named `SITE_URL` (Settings → Secrets and variables → Actions → Variables). The workflow passes it to the `Containerfile` as a build argument.

The feed is then at `/blog/rss.xml`, and a sitemap is generated. Without `SITE_URL` none of these are produced.

### Dates and time zones

The `dev` and `build` scripts run with `TZ=UTC`, so a post dated `2026-09-20` never renders as the 19th on a machine west of UTC.

### Theme and fonts

- **Theme**: [`@pelagornis/page`](https://github.com/pelagornis/starlight-theme-page) (Starlight plugin), configured in `astro.config.mjs`. `starlightBlog()` must stay before `pagePlugin()` so the blog's component overrides win, and uses `navigation: 'none'` because the theme's header already links to the blog (the blog's own sidebar link would make the home page render a sidebar). Header links are set in the theme's `navigation` option.
- **No sidebar on the home page**: the theme ignores Starlight's `hasSidebar`, so `src/routeData.ts` (a Starlight route middleware) empties the sidebar on pages that shouldn't have one, such as the `splash` home.
- **Fonts** (self-hosted through `@fontsource-variable`, no third-party requests): Red Hat Text for body, Red Hat Display for headings, Red Hat Mono for code, and Zalando Sans Expanded Bold (700) for the Cloche wordmark (site title). All set in `src/styles/custom.css`.
- **Accent color**: Cloche blue `#004aff`, also in `src/styles/custom.css`. The theme's CSS loads after ours, so overrides there use `:root:root` to win.
- **Third-party imports are stripped**: the theme imports Inter from Google Fonts; `astro.config.mjs` drops remote CSS `@import`s at build time.
- **Icon fonts**: the theme expects `/fonts/refineui-system-icons-*.woff2` at the site root, so copies live in `public/fonts/`. After updating `@pelagornis/page`, refresh them from `node_modules/@refineui/web-icons/dist/fonts/`.
- **Logo**: `src/assets/logo.svg` (also `public/favicon.svg`) is the Cloche mark from `rpm-repo/sources/cloche-common/usr/share/icons/breeze/places/cloche-symbolic-current.svg`.

## 3. Publish (first time)

The repository starts local-only. Do these once:

1. **Create the remote and push** (needs `gh` authenticated, see the workspace `CLAUDE.md` for the `gh-tools` distrobox):

   ```bash
   git add -A && git commit -m "Initial site"
   gh repo create cloche-project/cloche-website --public --source . --push
   ```

2. **Generate the Cosign key pair** (no password, same as the other Cloche repos, so `COSIGN_PASSWORD` stays empty):

   ```bash
   distrobox enter gh-tools -- sudo dnf install -y cosign
   distrobox enter gh-tools -- cosign generate-key-pair   # answer empty password
   ```

   - Save the contents of `cosign.key` as the repository secret `SIGNING_SECRET` (Settings → Secrets and variables → Actions).
   - Commit `cosign.pub`. **Never commit `cosign.key`** (it is git-ignored).

3. **Run the workflow** (Actions → build → Run workflow, or push to `main`). It publishes `ghcr.io/cloche-project/cloche-website`.

4. **Make the package public** (GitHub → Packages → cloche-website → Package settings → Change visibility), otherwise `podman pull` needs a login.

## 4. CI

`.github/workflows/build.yml` runs on push to `main`, pull requests, daily at 07:00 UTC and manually.

1. Installs Node and runs `scripts/fetch-status.mjs` with the workflow token.
2. Builds the image from `Containerfile`. On pull requests it builds but does not push or sign.
3. On `main`, pushes `:latest` and `:<commit sha>` to GHCR.
4. Signs the pushed digest with `cosign sign`, using the `SIGNING_SECRET` secret.

The daily run keeps the status page fresh even when the site itself did not change.

## 5. Verify the image

```bash
cosign verify --key cosign.pub ghcr.io/cloche-project/cloche-website:latest
```

## Later: running it permanently on Cloche Pro Server

Out of scope for now (domain, TLS, public exposure and auto-update are deferred until that host exists). The intended shape is a Quadlet unit with `podman-auto-update`. This is a sketch and has not been tested yet.

`~/.config/containers/systemd/cloche-website.container`:

```ini
[Unit]
Description=Cloche website

[Container]
Image=ghcr.io/cloche-project/cloche-website:latest
AutoUpdate=registry
PublishPort=8080:80

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload
systemctl --user start cloche-website.service
systemctl --user enable --now podman-auto-update.timer
```

For a public site, put TLS in front. Caddy can do automatic HTTPS: replace `auto_https off` in `Caddyfile` with a real site address once a domain points at the host.

## License

Apache 2.0, see [LICENSE](LICENSE).
