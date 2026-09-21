import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { slugify } from './lib/slug.mjs';

const USAGE = `Create a blog post.

Usage:
  npm run new-post -- "Post title" [options]

Options:
  --tags a,b,c      Comma-separated tags
  --author "Name"   Credit a specific person (default: the configured "Cloche Project" author)
  --excerpt "..."   One-line summary shown in the post list
  --date YYYY-MM-DD Publication date (default: today)
  --featured        Pin the post in the blog sidebar
  --draft           Keep the post out of production builds
  -h, --help        Show this help
`;

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		tags: { type: 'string' },
		author: { type: 'string' },
		excerpt: { type: 'string' },
		date: { type: 'string' },
		featured: { type: 'boolean', default: false },
		draft: { type: 'boolean', default: false },
		help: { type: 'boolean', short: 'h', default: false },
	},
});

if (values.help) {
	console.log(USAGE);
	process.exit(0);
}

const title = positionals.join(' ').trim();
if (!title) {
	console.error(USAGE);
	process.exit(1);
}

const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const date = values.date ?? today;
if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
	console.error(`Invalid --date "${date}", expected YYYY-MM-DD.`);
	process.exit(1);
}

const slug = slugify(title);
if (!slug) {
	console.error('Could not derive a file name from that title. Use letters or digits.');
	process.exit(1);
}

const file = new URL(`../src/content/docs/blog/${date}-${slug}.md`, import.meta.url);
if (existsSync(file)) {
	console.error(`Already exists: src/content/docs/blog/${date}-${slug}.md`);
	process.exit(1);
}

// JSON strings are valid double-quoted YAML scalars, which keeps quoting safe for any title.
const q = (s) => JSON.stringify(s);
const tags = (values.tags ?? '')
	.split(',')
	.map((t) => t.trim())
	.filter(Boolean);

const lines = ['---', `title: ${q(title)}`, `date: ${date}`];
lines.push(values.excerpt ? `excerpt: ${q(values.excerpt)}` : '# excerpt: One-line summary shown in the post list.');
if (tags.length) lines.push('tags:', ...tags.map((t) => `  - ${q(t)}`));
if (values.author) lines.push('authors:', `  - name: ${q(values.author)}`);
if (values.featured) lines.push('featured: true');
if (values.draft) lines.push('draft: true');
lines.push('---', '', 'Write your post here.', '');

await mkdir(new URL('../src/content/docs/blog/', import.meta.url), { recursive: true });
await writeFile(file, lines.join('\n'));

console.log(`Created src/content/docs/blog/${date}-${slug}.md`);
if (values.draft) console.log('It is a draft: visible in `npm run dev`, left out of production builds. Remove `draft: true` to publish.');
