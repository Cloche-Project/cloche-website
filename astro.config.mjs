// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightBlog from 'starlight-blog';
import pagePlugin from '@pelagornis/page';
import { unified } from '@astrojs/markdown-remark';

// The page theme imports Inter from fonts.googleapis.com. Drop remote @imports so the site
// makes no third-party requests (fonts are self-hosted via @fontsource).
const dropRemoteCssImports = {
	postcssPlugin: 'drop-remote-css-imports',
	AtRule: {
		import(rule) {
			if (/(^|\()['"]?https?:\/\//.test(rule.params)) rule.remove();
		},
	},
};

// Wrap Markdown tables in a div so they can share one bordered, scrollable style (see custom.css).
function rehypeWrapTables() {
	const wrap = (node) => {
		if (!node.children) return;
		node.children = node.children.map((child) => {
			wrap(child);
			if (child.type === 'element' && child.tagName === 'table') {
				return { type: 'element', tagName: 'div', properties: { className: ['md-table-wrap'] }, children: [child] };
			}
			return child;
		});
	};
	return (tree) => wrap(tree);
}

// The page theme hardcodes English for its header links and a few accessibility labels. Route them
// through Starlight's translation function (`Astro.locals.t`, strings in src/content/i18n/*.json).
// The header links are configured below as translation keys.
// The Vite `transform` hook sees the theme's already compiled .astro modules: static attributes are
// plain text inside a template literal, and `Astro` is only declared in components whose code uses it.
// So the replacements are `${...}` interpolations that build the Astro object from the render result,
// as the compiled code itself does. If the compiler changes, the build fails instead of silently
// falling back to English.
const T = '$$result.createAstro($$props, $$slots).locals.t';
const THEME_STRINGS = {
	'overrides/Header.astro': [['${item.label}', `\${${T}(item.label)}`]],
	'overrides/Search.astro': [
		['aria-label="Search"', `aria-label="\${${T}('search.label')}"`],
		['title="Search (Ctrl+K)"', `title="\${${T}('search.label')} (Ctrl+K)"`],
	],
	'overrides/MobileMenuToggle.astro': [['aria-label="Open menu"', `aria-label="\${${T}('cloche.a11y.openMenu')}"`]],
	'overrides/MobileMenuOverlay.astro': [['aria-label="Close menu"', `aria-label="\${${T}('cloche.a11y.closeMenu')}"`]],
};

function localizeTheme() {
	return {
		name: 'cloche-localize-theme',
		enforce: /** @type {'pre'} */ ('pre'),
		transform(/** @type {string} */ code, /** @type {string} */ id) {
			if (id.includes('?')) return null;
			const entry = Object.entries(THEME_STRINGS).find(([file]) => id.endsWith(`@pelagornis/page/${file}`));
			if (!entry) return null;
			let out = code;
			for (const [from, to] of entry[1]) {
				if (!out.includes(from)) this.warn(`theme localization: "${from}" not found in ${entry[0]}; the theme may have changed.`);
				// A function, because `$$` in a replacement string would collapse to a single `$`.
				out = out.replaceAll(from, () => to);
			}
			return { code: out, map: null };
		},
	};
}

export default defineConfig({
	// Set SITE_URL (for example https://cloche.example) to enable the RSS feed, sitemap and canonical URLs.
	site: process.env.SITE_URL || undefined,
	markdown: { processor: unified({ rehypePlugins: [rehypeWrapTables] }) },
	vite: {
		css: { postcss: { plugins: [dropRemoteCssImports] } },
		plugins: [localizeTheme()],
	},
	integrations: [
		starlight({
			title: 'Cloche',
			description: 'Immutable, container-native desktop and server images built on Fedora Atomic and bootc.',
			logo: { src: './src/assets/logo.svg' },
			customCss: ['./src/styles/custom.css'],
			routeMiddleware: './src/routeData.ts',
			// English lives at the root (existing URLs keep working); other languages get a prefix.
			// Content: src/content/docs/<locale>/..., UI strings: src/content/i18n/<lang>.json.
			// A page without a translation falls back to English with a notice.
			defaultLocale: 'root',
			locales: {
				root: { label: 'English', lang: 'en' },
				'pt-br': { label: 'Português (Brasil)', lang: 'pt-BR' },
				es: { label: 'Español', lang: 'es' },
			},
			// starlightBlog must come first so its component overrides take precedence over the theme's.
			// navigation: 'none' because the page theme's header already links to the blog, and the blog's
			// own sidebar link would make the home page render a sidebar.
			plugins: [
				starlightBlog({
					navigation: 'none',
					metrics: { readingTime: true },
					authors: {
						cloche: {
							name: 'Cloche Project',
							title: 'Maintainers',
							picture: '/favicon.svg',
							url: 'https://github.com/cloche-project',
						},
					},
				}),
				pagePlugin({
					siteTitle: 'Cloche',
					footerText: '© 2026 Cloche project · Apache 2.0',
					// Labels are translation keys (see localizeTheme above and src/content/i18n).
					navigation: [
						{ href: '/download/', label: 'cloche.nav.download' },
						{ href: '/docs/variants/', label: 'cloche.nav.docs' },
						{ href: '/blog/', label: 'cloche.nav.blog' },
						{ href: '/changelog/', label: 'cloche.nav.changelog' },
						{ href: '/status/', label: 'cloche.nav.status' },
					],
				}),
			],
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/cloche-project' }],
			sidebar: [
				{ label: 'Download', translations: { 'pt-BR': 'Baixar', es: 'Descargar' }, slug: 'download' },
				{
					label: 'Getting started',
					translations: { 'pt-BR': 'Primeiros passos', es: 'Primeros pasos' },
					// Pages in src/content/docs/docs/, ordered by `sidebar.order` in their frontmatter.
					items: [{ autogenerate: { directory: 'docs' } }],
				},
				{ label: 'Image status', translations: { 'pt-BR': 'Status das imagens', es: 'Estado de las imágenes' }, slug: 'status' },
				{ label: 'Changelog', slug: 'changelog' },
			],
		}),
	],
});
