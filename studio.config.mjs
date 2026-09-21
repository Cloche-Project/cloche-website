// Content types the local studio (`npm run studio`) can edit.
//
// Languages: `locales` lists them; the first one is the source language. A translation is the file with
// the SAME NAME in that language's folder (this is how Starlight and starlight-blog match them). The
// list shows which languages each entry has, and the properties panel creates the missing ones.
// Leave `locales` out for a single-language site.
//
// Each collection maps a folder of Markdown files to a form:
//   description  shown in the help card (bottom-left ?): what this content is and where it appears on the site
//   dir       folder relative to this file (the source language)
//   localeDirs  folder of every other language, by locale id
//   recursive   also list files in subfolders; file names then are relative paths (`docs/install.md`)
//   exclude     with `recursive`: top-level folders to skip (other collections, other languages)
//   filename  new-file name; {date} and {slug} (from `slugFrom`) are available
//   titleField  the field shown as the large title above the content (default: `slugFrom`, then `title`)
//   editor    body editor: 'visual' (WYSIWYG, the default) or 'source' (plain Markdown). Users can switch in the UI.
//   fields    form fields, in order. They are also written to the frontmatter in this order.
//             Every field except the title goes in the properties inspector; `group` sets its section.
//             Types: string, text, date, number, list (comma-separated), people (names or known ids), boolean
//             A name like `sidebar.order` writes `order` inside the `sidebar:` block and keeps its other keys.
//   Files ending in .mdx (pages with components) only open as Markdown: the visual editor and preview would break them.
//
// Frontmatter keys that are not listed in `fields` (for example `cover`) are kept as they are.
export default {
	// `id` matches the folder prefix in astro.config.mjs; `short` is the badge shown in the list.
	locales: [
		{ id: 'en', label: 'English', short: 'EN' },
		{ id: 'pt-br', label: 'Português (Brasil)', short: 'PT' },
		{ id: 'es', label: 'Español', short: 'ES' },
	],
	collections: [
		{
			id: 'blog',
			label: 'Blog posts',
			singular: 'post',
			description: 'Announcements and write-ups. They appear in the Blog, newest first.',
			dir: 'src/content/docs/blog',
			localeDirs: { 'pt-br': 'src/content/docs/pt-br/blog', es: 'src/content/docs/es/blog' },
			filename: '{date}-{slug}.md',
			slugFrom: 'title',
			titleField: 'title',
			editor: 'visual',
			fields: [
				{ name: 'title', label: 'Title', type: 'string', required: true },
				{ name: 'date', label: 'Date', type: 'date', required: true, default: 'today', group: 'Publishing' },
				{ name: 'excerpt', label: 'Excerpt', type: 'text', group: 'Summary', hint: 'One line shown in the post list. Without one, the whole post is shown.' },
				{ name: 'tags', label: 'Tags', type: 'list', group: 'Organization', hint: 'Comma-separated.' },
				{
					name: 'authors',
					label: 'Authors',
					type: 'people',
					group: 'Organization',
					known: ['cloche'],
					hint: 'Comma-separated names, or "cloche" for the default author. Empty means the default author.',
				},
				{ name: 'featured', label: 'Featured', type: 'boolean', group: 'Publishing', hint: 'Pin it in the blog sidebar.' },
				{ name: 'draft', label: 'Draft', type: 'boolean', group: 'Publishing', hint: 'Left out of production builds.' },
			],
		},
		{
			// Documentation: src/content/docs/docs/. Each file gets its own place in the "Getting started" sidebar group.
			id: 'docs',
			label: 'Docs',
			singular: 'doc',
			description: 'Documentation pages. They appear in the docs sidebar, in the order of the Order field.',
			dir: 'src/content/docs/docs',
			localeDirs: { 'pt-br': 'src/content/docs/pt-br/docs', es: 'src/content/docs/es/docs' },
			filename: '{slug}.md',
			slugFrom: 'title',
			titleField: 'title',
			editor: 'source',
			fields: [
				{ name: 'title', label: 'Title', type: 'string', required: true },
				{ name: 'description', label: 'Description', type: 'text', group: 'Summary', hint: 'Shown in search results and link previews.' },
				{ name: 'sidebar.order', label: 'Order', type: 'number', group: 'Sidebar', hint: 'Position in the sidebar group. Lower comes first.' },
				{ name: 'sidebar.label', label: 'Sidebar label', type: 'string', group: 'Sidebar', hint: 'Shorter text for the sidebar. Empty uses the title.' },
				{ name: 'draft', label: 'Draft', type: 'boolean', group: 'Publishing', hint: 'Left out of production builds.' },
			],
		},
		{
			// Standalone pages at the top of src/content/docs/: home, download, status, changelog...
			id: 'pages',
			label: 'Pages',
			singular: 'page',
			description: 'Site pages outside the docs: home, download, status, changelog. Most use components (.mdx). Links to them are in the header or the sidebar in astro.config.mjs.',
			dir: 'src/content/docs',
			localeDirs: { 'pt-br': 'src/content/docs/pt-br', es: 'src/content/docs/es' },
			filename: '{slug}.md',
			slugFrom: 'title',
			titleField: 'title',
			editor: 'source',
			fields: [
				{ name: 'title', label: 'Title', type: 'string', required: true },
				{ name: 'description', label: 'Description', type: 'text', group: 'Summary', hint: 'Shown in search results and link previews.' },
				{ name: 'draft', label: 'Draft', type: 'boolean', group: 'Publishing', hint: 'Left out of production builds.' },
			],
		},
	],
};
