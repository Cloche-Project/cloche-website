import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createMarkdownProcessor } from '@astrojs/markdown-remark';
import YAML from 'yaml';
import { slugify } from '../lib/slug.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.env.STUDIO_ROOT ?? path.join(HERE, '../..'));
const PORT = Number(process.env.STUDIO_PORT ?? 4400);
const HOST = '127.0.0.1';
const TOKEN = randomBytes(16).toString('hex');

const { default: config } = await import(pathToFileURL(path.join(ROOT, 'studio.config.mjs')).href);
const collections = config.collections;
// Without `locales` the site has one language and everything behaves as before.
const locales = config.locales?.length ? config.locales : [{ id: 'default', label: 'Default', short: '' }];
const DEFAULT_LOCALE = locales[0].id;
const markdown = await createMarkdownProcessor();

class HttpError extends Error {
	constructor(status, message) {
		super(message);
		this.status = status;
	}
}

// ---------------------------------------------------------------- frontmatter

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/;

function parseDoc(text) {
	const m = text.match(FRONTMATTER);
	if (!m) return { fm: {}, body: text };
	return { fm: YAML.parse(m[1]) ?? {}, body: m[2] };
}

// A field name can be a path into the frontmatter (`sidebar.order`).
const topKey = (name) => name.split('.')[0];
const getPath = (obj, name) => name.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);
const declaredKeys = (col) => new Set(col.fields.map((f) => topKey(f.name)));

const dateString = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v ? String(v) : '');
const clean = (v) => (Array.isArray(v) ? v : []).map((s) => String(s).trim()).filter(Boolean);

function toForm(col, fm) {
	const data = {};
	for (const f of col.fields) {
		const v = getPath(fm, f.name);
		if (f.type === 'boolean') data[f.name] = v === true;
		else if (f.type === 'number') data[f.name] = typeof v === 'number' ? String(v) : '';
		else if (f.type === 'list') data[f.name] = Array.isArray(v) ? v.map(String) : [];
		else if (f.type === 'people') data[f.name] = Array.isArray(v) ? v.map((a) => (typeof a === 'string' ? a : a?.name)).filter(Boolean) : [];
		else if (f.type === 'date') data[f.name] = dateString(v);
		else data[f.name] = v == null ? '' : String(v);
	}
	const declared = declaredKeys(col);
	const extra = Object.keys(fm).filter((k) => !declared.has(k));
	return { data, extra };
}

// JSON strings are valid double-quoted YAML scalars, so quoting is always safe.
const q = JSON.stringify;

function serialize(col, data, body, originalFm) {
	const lines = ['---'];
	// Fields written as `parent.child` are grouped under `parent`, merged with the keys already there.
	const nested = new Map();
	for (const f of col.fields) {
		if (!f.name.includes('.')) continue;
		const [top, ...rest] = f.name.split('.');
		if (rest.length > 1) throw new Error(`Field "${f.name}": only one level of nesting is supported.`);
		if (!nested.has(top)) nested.set(top, { ...(originalFm?.[top] && typeof originalFm[top] === 'object' ? originalFm[top] : {}) });
		const v = data[f.name];
		const empty = v == null || v === '' || v === false;
		if (empty) delete nested.get(top)[rest[0]];
		else nested.get(top)[rest[0]] = f.type === 'number' ? Number(v) : f.type === 'boolean' ? true : typeof v === 'string' ? v.trim() : v;
	}
	const emitted = new Set();
	for (const f of col.fields) {
		const v = data[f.name];
		if (f.name.includes('.')) {
			const top = topKey(f.name);
			if (emitted.has(top)) continue;
			emitted.add(top);
			if (Object.keys(nested.get(top)).length) lines.push(YAML.stringify({ [top]: nested.get(top) }, { lineWidth: 0 }).trimEnd());
			continue;
		}
		if (f.type === 'number') {
			if (v !== '' && v != null) lines.push(`${f.name}: ${Number(v)}`);
		} else if (f.type === 'string' || f.type === 'text') {
			if (typeof v === 'string' && v.trim()) lines.push(`${f.name}: ${q(v.trim())}`);
		} else if (f.type === 'date') {
			if (v) lines.push(`${f.name}: ${v}`);
		} else if (f.type === 'boolean') {
			if (v === true) lines.push(`${f.name}: true`);
		} else if (f.type === 'list') {
			const items = clean(v);
			if (items.length) lines.push(`${f.name}:`, ...items.map((i) => `  - ${q(i)}`));
		} else if (f.type === 'people') {
			const items = clean(v);
			if (!items.length) continue;
			const original = new Map(
				(Array.isArray(originalFm?.[f.name]) ? originalFm[f.name] : []).filter((a) => a && typeof a === 'object').map((a) => [a.name, a]),
			);
			lines.push(`${f.name}:`);
			for (const name of items) {
				if ((f.known ?? []).includes(name)) lines.push(`  - ${q(name)}`);
				else if (original.has(name)) lines.push(...YAML.stringify([original.get(name)], { lineWidth: 0 }).trimEnd().split('\n').map((l) => `  ${l}`));
				else lines.push(`  - name: ${q(name)}`);
			}
		}
	}

	const declared = declaredKeys(col);
	const extra = Object.fromEntries(Object.entries(originalFm ?? {}).filter(([k]) => !declared.has(k)));
	if (Object.keys(extra).length) lines.push(YAML.stringify(extra, { lineWidth: 0 }).trimEnd());
	lines.push('---');

	const text = String(body ?? '').replace(/\r\n/g, '\n').replace(/^\s*\n/, '').replace(/\s*$/, '');
	return `${lines.join('\n')}\n${text ? `\n${text}\n` : ''}`;
}

function validate(col, data) {
	for (const f of col.fields) {
		const v = data[f.name];
		if (f.required && (typeof v !== 'string' || !v.trim())) throw new HttpError(400, `${f.label} is required.`);
		if (f.type === 'number' && v !== '' && v != null && !Number.isFinite(Number(v))) throw new HttpError(400, `${f.label} must be a number.`);
		if (f.type === 'date' && v && (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v)))) {
			throw new HttpError(400, `${f.label} must be a valid YYYY-MM-DD date.`);
		}
	}
}

// ---------------------------------------------------------------- files

const collectionById = (id) => {
	const col = collections.find((c) => c.id === id);
	if (!col) throw new HttpError(404, 'Unknown collection.');
	return col;
};

// Folder of each language: `dir` for the source language, `localeDirs[id]` for the others.
const dirsOf = (col) => Object.fromEntries(locales.map((l) => [l.id, l.id === DEFAULT_LOCALE ? col.dir : col.localeDirs?.[l.id]]).filter(([, dir]) => dir));
const localeOf = (id) => {
	const locale = id ?? DEFAULT_LOCALE;
	if (!locales.some((l) => l.id === locale)) throw new HttpError(400, 'Unknown language.');
	return locale;
};
const dirOf = (col, locale) => {
	const dir = dirsOf(col)[locale];
	if (!dir) throw new HttpError(400, `${col.label} has no folder for "${locale}".`);
	return path.join(ROOT, dir);
};

// Top-level folders a recursive collection skips: other collections' folders and the other languages.
const excluded = (col, file) => (col.exclude ?? []).includes(file.split('/')[0]);

async function listFiles(col, locale) {
	const dir = dirOf(col, locale);
	const names = col.recursive ? await readdir(dir, { recursive: true }) : await readdir(dir);
	return names.map((n) => n.split(path.sep).join('/')).filter((f) => /\.mdx?$/.test(f) && !excluded(col, f));
}

function pathOf(col, locale, file) {
	// Only for collections that look into subfolders may the name be a relative path (`docs/install.md`).
	const segment = '[A-Za-z0-9_-][A-Za-z0-9._-]*';
	const pattern = col.recursive ? new RegExp(`^(${segment}/)*${segment}\\.mdx?$`) : /^[A-Za-z0-9._-]+\.mdx?$/;
	if (typeof file !== 'string' || !pattern.test(file) || file.split('/').includes('..') || excluded(col, file)) throw new HttpError(400, 'Invalid file name.');
	return path.join(dirOf(col, locale), file);
}

// One row per file name, across all languages; `locales` says which languages have it.
async function listEntries(col) {
	const rows = new Map();
	for (const locale of Object.keys(dirsOf(col))) {
		let files = [];
		try {
			files = await listFiles(col, locale);
		} catch {
			// The folder does not exist yet; it is created on the first save.
		}
		for (const file of files) {
			let info;
			try {
				const { fm } = parseDoc(await readFile(path.join(dirOf(col, locale), file), 'utf8'));
				info = { title: fm.title ? String(fm.title) : file, date: dateString(fm.date), draft: fm.draft === true };
			} catch {
				info = { title: file, date: '', draft: false, error: true };
			}
			if (!rows.has(file)) rows.set(file, { file, locales: [], byLocale: {} });
			const row = rows.get(file);
			row.locales.push(locale);
			row.byLocale[locale] = info;
		}
	}
	const items = [...rows.values()].map(({ file, locales: present, byLocale }) => {
		// Shown in the source language when it exists, otherwise in the first translation found.
		const main = byLocale[DEFAULT_LOCALE] ?? byLocale[present[0]];
		return { file, ...main, locales: present, drafts: present.filter((l) => byLocale[l].draft) };
	});
	return items.sort((a, b) => b.date.localeCompare(a.date) || a.file.localeCompare(b.file));
}

function newFilename(col, data) {
	const slug = slugify(data[col.slugFrom ?? 'title'] ?? '');
	if (!slug) throw new HttpError(400, 'Could not derive a file name. Use letters or digits in the title.');
	return col.filename.replace('{date}', data.date ?? '').replace('{slug}', slug);
}

// ---------------------------------------------------------------- http

const UI = path.join(HERE, 'ui');
const VDITOR = path.join(ROOT, 'node_modules/vditor/dist');
const MIME = {
	'.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.html': 'text/html; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.gif': 'image/gif',
	'.jpg': 'image/jpeg',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.ttf': 'font/ttf',
};
const fontFile = (pkg, name) => path.join(ROOT, 'node_modules/@fontsource-variable', pkg, 'files', name);
const ASSETS = {
	'/app.js': [path.join(UI, 'app.js'), 'text/javascript; charset=utf-8'],
	'/style.css': [path.join(UI, 'style.css'), 'text/css; charset=utf-8'],
	'/slug.js': [path.join(HERE, '../lib/slug.mjs'), 'text/javascript; charset=utf-8'],
	'/favicon.svg': [path.join(ROOT, 'public/favicon.svg'), 'image/svg+xml'],
	'/fonts/text.woff2': [fontFile('red-hat-text', 'red-hat-text-latin-wght-normal.woff2'), 'font/woff2'],
	'/fonts/mono.woff2': [fontFile('red-hat-mono', 'red-hat-mono-latin-wght-normal.woff2'), 'font/woff2'],
	'/fonts/wordmark.woff2': [fontFile('zalando-sans-expanded', 'zalando-sans-expanded-latin-wght-normal.woff2'), 'font/woff2'],
};

function send(res, status, body, type = 'application/json; charset=utf-8', headers = {}) {
	res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', ...headers });
	res.end(body);
}
const json = (res, status, obj) => send(res, status, JSON.stringify(obj));

async function readJson(req) {
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		size += chunk.length;
		if (size > 2_000_000) throw new HttpError(413, 'Request too large.');
		chunks.push(chunk);
	}
	try {
		return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
	} catch {
		throw new HttpError(400, 'Invalid JSON.');
	}
}

const server = createServer(async (req, res) => {
	try {
		// Only answer requests addressed to this machine: blocks DNS rebinding.
		if (req.headers.host !== `${HOST}:${PORT}` && req.headers.host !== `localhost:${PORT}`) throw new HttpError(403, 'Forbidden host.');
		// Writes need the per-run token embedded in the page: blocks other sites from posting here.
		if (req.method !== 'GET' && req.headers['x-studio-token'] !== TOKEN) throw new HttpError(403, 'Bad token.');

		const url = new URL(req.url, `http://${HOST}:${PORT}`);
		const route = `${req.method} ${url.pathname}`;

		if (route === 'GET /') {
			const html = (await readFile(path.join(UI, 'index.html'), 'utf8')).replace('__STUDIO_TOKEN__', TOKEN);
			return send(res, 200, html, 'text/html; charset=utf-8');
		}

		if (req.method === 'GET' && ASSETS[url.pathname]) {
			const [file, type] = ASSETS[url.pathname];
			if (!existsSync(file)) throw new HttpError(404, 'Not found.');
			const cors = url.pathname.startsWith('/fonts/') ? { 'access-control-allow-origin': '*' } : {};
			return send(res, 200, await readFile(file), type, cors);
		}

		// The visual editor (Vditor) is served from node_modules so the studio never talks to a CDN.
		if (req.method === 'GET' && url.pathname.startsWith('/vditor/dist/')) {
			let relative;
			try {
				relative = decodeURIComponent(url.pathname.slice('/vditor/dist/'.length));
			} catch {
				throw new HttpError(400, 'Bad path.');
			}
			const file = path.resolve(VDITOR, relative);
			if (!file.startsWith(VDITOR + path.sep)) throw new HttpError(403, 'Forbidden.');
			if (!existsSync(file)) throw new HttpError(404, 'Not found.');
			return send(res, 200, await readFile(file), MIME[path.extname(file)] ?? 'application/octet-stream', { 'cache-control': 'public, max-age=3600' });
		}

		if (route === 'GET /api/config') {
			return json(res, 200, {
				locales,
				collections: collections.map((c) => ({ id: c.id, label: c.label, singular: c.singular, description: c.description ?? '', fields: c.fields, filename: c.filename, slugFrom: c.slugFrom, dir: c.dir, dirs: dirsOf(c), editor: c.editor ?? 'visual', titleField: c.titleField ?? c.slugFrom ?? 'title' })),
			});
		}

		if (route === 'GET /api/entries') {
			return json(res, 200, { entries: await listEntries(collectionById(url.searchParams.get('collection'))) });
		}

		if (route === 'GET /api/entry') {
			const col = collectionById(url.searchParams.get('collection'));
			const locale = localeOf(url.searchParams.get('locale') ?? undefined);
			const file = url.searchParams.get('file');
			let text;
			try {
				text = await readFile(pathOf(col, locale, file), 'utf8');
			} catch (e) {
				if (e instanceof HttpError) throw e;
				throw new HttpError(404, 'Entry not found.');
			}
			const { fm, body } = parseDoc(text);
			return json(res, 200, { file, locale, ...toForm(col, fm), body });
		}

		if (route === 'PUT /api/entry') {
			const { collection, locale: requested, file, data, body, create, from } = await readJson(req);
			const col = collectionById(collection);
			const locale = localeOf(requested);
			if (!data || typeof data !== 'object') throw new HttpError(400, 'Missing data.');
			validate(col, data);

			let target;
			let name = file;
			let originalFm = {};
			if (file && !create) {
				target = pathOf(col, locale, file);
				try {
					originalFm = parseDoc(await readFile(target, 'utf8')).fm;
				} catch {
					throw new HttpError(404, 'Entry not found.');
				}
			} else {
				// A translation keeps the source file name: that is how the site pairs them.
				name = file ?? newFilename(col, data);
				target = pathOf(col, locale, name);
				if (existsSync(target)) throw new HttpError(409, `${dirsOf(col)[locale]}/${name} already exists.`);
				// Keys the form does not edit (for example `cover`) come along from the source file.
				if (create && from) {
					try {
						originalFm = parseDoc(await readFile(pathOf(col, localeOf(from), name), 'utf8')).fm;
					} catch {
						// No source file to copy from; write only what the form has.
					}
				}
			}

			await mkdir(path.dirname(target), { recursive: true });
			await writeFile(target, serialize(col, data, body, originalFm));
			return json(res, 200, { file: name, locale, path: `${dirsOf(col)[locale]}/${name}` });
		}

		// The exact file `PUT /api/entry` would write, for the browser to download. Nothing is written.
		if (route === 'POST /api/export') {
			const { collection, locale: requested, file, data, body } = await readJson(req);
			const col = collectionById(collection);
			const locale = localeOf(requested);
			if (!data || typeof data !== 'object') throw new HttpError(400, 'Missing data.');

			let originalFm = {};
			let filename = file;
			if (file) {
				try {
					originalFm = parseDoc(await readFile(pathOf(col, locale, file), 'utf8')).fm;
				} catch {
					// A file that no longer exists is exported like a new one.
				}
			} else {
				try {
					filename = newFilename(col, data);
				} catch {
					filename = 'untitled.md';
				}
			}
			return json(res, 200, { filename, text: serialize(col, data, body, originalFm) });
		}

		if (route === 'POST /api/preview') {
			const { body } = await readJson(req);
			const { code } = await markdown.render(String(body ?? ''));
			return json(res, 200, { html: code });
		}

		throw new HttpError(404, 'Not found.');
	} catch (e) {
		const status = e instanceof HttpError ? e.status : 500;
		if (status === 500) console.error(e);
		json(res, status, { error: status === 500 ? 'Internal error.' : e.message });
	}
});

server.on('error', (e) => {
	console.error(e.code === 'EADDRINUSE' ? `Port ${PORT} is in use. Set STUDIO_PORT to another port.` : e);
	process.exit(1);
});

server.listen(PORT, HOST, () => {
	console.log(`Cloche Studio: http://localhost:${PORT}`);
	console.log(`Editing ${collections.map((c) => c.dir).join(', ')} in ${ROOT}`);
	console.log('Local only. Press Ctrl+C to stop.');
});
