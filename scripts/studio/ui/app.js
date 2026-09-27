import { slugify } from '/slug.js';

const token = document.querySelector('meta[name="studio-token"]').content;
const $ = (selector) => document.querySelector(selector);

function el(tag, props = {}, ...children) {
	const node = Object.assign(document.createElement(tag), props);
	node.append(...children);
	return node;
}

async function api(path, { method = 'GET', body } = {}) {
	const res = await fetch(path, {
		method,
		headers: { 'content-type': 'application/json', 'x-studio-token': token },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const json = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(json.error || res.statusText);
	return json;
}

const state = { config: null, col: null, entries: [], current: null, dirty: false };

// Languages come from studio.config.mjs; the first is the source. With one language the UI has no language controls.
const locales = () => state.config.locales;
const isMulti = () => locales().length > 1;
const defaultLocale = () => locales()[0].id;
const localeInfo = (id) => locales().find((l) => l.id === id);
const localeShort = (id) => localeInfo(id)?.short || id.toUpperCase();
const dirFor = (locale) => state.col.dirs[locale] ?? state.col.dir;
const entryRow = (file) => state.entries.find((e) => e.file === file);
const hashFor = (locale, file) => `#${isMulti() ? `${locale}:` : ''}${encodeURIComponent(file)}`;

const pad = (n) => String(n).padStart(2, '0');
const today = () => {
	const d = new Date();
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

// Grow a textarea to fit its text, so the page (not the field) scrolls.
function fit(textarea) {
	textarea.style.height = 'auto';
	textarea.style.height = `${textarea.scrollHeight}px`;
}

function remember(key, value) {
	try {
		localStorage.setItem(`studio-${key}`, value);
	} catch {
		// Storage can be unavailable; the preference just is not remembered.
	}
}
function recall(key) {
	try {
		return localStorage.getItem(`studio-${key}`);
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------- small helpers

let toastTimer;
function toast(message, kind = 'ok') {
	const node = $('#toast');
	node.textContent = message;
	node.className = `toast ${kind}`;
	node.hidden = false;
	clearTimeout(toastTimer);
	toastTimer = setTimeout(() => (node.hidden = true), kind === 'error' ? 6000 : 2500);
}

function setDirty(value) {
	state.dirty = value;
	$('#dirty').hidden = !value;
}

const confirmDiscard = () => !state.dirty || window.confirm('Discard your unsaved changes?');

window.addEventListener('beforeunload', (e) => {
	if (state.dirty) {
		e.preventDefault();
		e.returnValue = '';
	}
});

// ---------------------------------------------------------------- side panels

// `list` (left) and `inspector` (right) can be collapsed; the choice is remembered.
function setPanel(name, open, { save = true } = {}) {
	document.body.dataset[name] = open ? 'open' : 'closed';
	$(`#toggle-${name}`).setAttribute('aria-expanded', String(open));
	$(`#${name}`).inert = !open;
	if (save) remember(name, open ? 'open' : 'closed');
}
const togglePanel = (name) => {
	if (name === 'inspector' && $('#form').hidden) return;
	setPanel(name, document.body.dataset[name] !== 'open');
};

function initPanels() {
	const listOpen = (recall('list') ?? (window.innerWidth >= 760 ? 'open' : 'closed')) === 'open';
	const inspectorOpen = (recall('inspector') ?? (window.innerWidth >= 1100 ? 'open' : 'closed')) === 'open';
	setPanel('list', listOpen, { save: false });
	setPanel('inspector', inspectorOpen, { save: false });
}

// ---------------------------------------------------------------- collections and list

function renderTabs() {
	const tabs = $('#tabs');
	tabs.replaceChildren();
	if (state.config.collections.length < 2) return;
	for (const c of state.config.collections) {
		const tab = el('button', { className: 'tab', type: 'button', textContent: c.label });
		tab.setAttribute('aria-current', String(c.id === state.col.id));
		tab.addEventListener('click', () => switchCollection(c.id));
		tabs.append(tab);
	}
}

function labelNewButtons() {
	for (const button of [$('#new'), $('#new-empty')]) button.textContent = `New ${state.col.singular}`;
}

async function switchCollection(id) {
	if (id === state.col.id || !confirmDiscard()) return;
	state.col = state.config.collections.find((c) => c.id === id);
	state.current = null;
	history.replaceState(null, '', location.pathname);
	setDirty(false);
	showEditor(false);
	renderTabs();
	labelNewButtons();
	await loadEntries();
}

// A small help card, opened by the button in the bottom-left corner: what this content type is,
// where it shows up on the site, and which folder its files live in.
function renderHelp() {
	$('#help-title').textContent = state.col.label;
	$('#help-text').textContent = state.col.description;
	$('#help-dir').textContent = state.col.dir;
	$('#help').hidden = !state.col.description;
	if (!state.col.description) setHelp(false);
}
function setHelp(open) {
	$('#help-pop').hidden = !open;
	$('#help').setAttribute('aria-expanded', String(open));
}
$('#help').addEventListener('click', () => setHelp($('#help-pop').hidden));
document.addEventListener('click', (e) => {
	if (!$('#help-pop').hidden && !e.target.closest('#help, #help-pop')) setHelp(false);
});
document.addEventListener('keydown', (e) => {
	if (e.key === 'Escape' && !$('#help-pop').hidden) setHelp(false);
});

async function loadEntries() {
	state.entries = (await api(`/api/entries?collection=${encodeURIComponent(state.col.id)}`)).entries;
	renderList();
	renderLanguages();
	renderHelp();
}

function renderList() {
	const list = $('#entries');
	list.replaceChildren();
	if (!state.entries.length) {
		list.append(el('li', { className: 'muted', textContent: 'Nothing here yet.' }));
		return;
	}
	for (const entry of state.entries) {
		const meta = el('span', { className: 'meta' }, el('span', { textContent: entry.date || entry.file }));
		if (entry.draft) meta.append(el('span', { className: 'chip', textContent: 'Draft' }));
		if (isMulti()) {
			const langs = el('span', { className: 'langs-row' });
			for (const l of locales()) {
				const has = entry.locales.includes(l.id);
				const badge = el('span', { className: `lang-badge${has ? '' : ' missing'}`, textContent: localeShort(l.id) });
				badge.title = has ? l.label : `${l.label}: missing`;
				langs.append(badge);
			}
			meta.append(langs);
		}
		const button = el('button', { className: 'entry', type: 'button' }, el('span', { className: 'title', textContent: entry.title }), meta);
		button.setAttribute('aria-current', String(entry.file === state.current?.file));
		button.addEventListener('click', () => openEntry(entry.file, state.current?.locale && entry.locales.includes(state.current.locale) ? state.current.locale : undefined));
		list.append(el('li', {}, button));
	}
}

// ---------------------------------------------------------------- content editors
//
// The content has two editors over the same Markdown: a visual one (Vditor, WYSIWYG) and a plain
// textarea; the third view, Preview, renders it the way the site does. The visual editor rewrites
// some Markdown when it serializes (table layout, `<url>` autolinks, ...), so the original text is
// kept until the content is really edited: opening and saving an entry without touching the content
// never reformats it.

const visual = { editor: null, loading: null, original: '', baseline: null, edited: false };
let mode = recall('mode') === 'source' ? 'source' : 'visual';
// MDX pages hold components and imports that the visual editor and the preview would mangle or not render,
// so they only open as Markdown. The remembered preference (`mode`) is left alone.
let forceSource = false;
const activeMode = () => (forceSource ? 'source' : mode);
let previewing = false;

// The theme follows the system unless the theme button stored an explicit choice on <html>.
const root = document.documentElement;
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
const isDark = () => (root.dataset.theme ? root.dataset.theme === 'dark' : systemDark.matches);
const themeOptions = () => (isDark() ? ['dark', 'dark', 'github-dark'] : ['classic', 'light', 'github']);

function applyTheme() {
	$('#toggle-theme').setAttribute('aria-pressed', String(isDark()));
	if (visual.editor && visual.baseline !== null) visual.editor.setTheme(...themeOptions());
	if (previewing) updatePreview();
}

function toggleTheme() {
	root.dataset.theme = isDark() ? 'light' : 'dark';
	remember('theme', root.dataset.theme);
	applyTheme();
}

systemDark.addEventListener('change', () => {
	if (!root.dataset.theme) applyTheme();
});

function loadVisualEditor() {
	visual.loading ??= new Promise((resolve, reject) => {
		const [theme, contentTheme, codeTheme] = themeOptions();
		const script = el('script', { src: '/vditor/dist/index.min.js' });
		script.onerror = () => reject(new Error('Could not load the visual editor.'));
		script.onload = () => {
			const editor = new window.Vditor('visual', {
				cdn: '/vditor',
				mode: 'wysiwyg',
				lang: 'en_US',
				theme,
				height: 'auto',
				minHeight: 420,
				placeholder: 'Start writing…',
				cache: { enable: false },
				counter: { enable: false },
				outline: { enable: false },
				toolbarConfig: { pin: true },
				preview: { theme: { current: contentTheme }, hljs: { style: codeTheme, lineNumber: false } },
				toolbar: ['headings', 'bold', 'italic', 'strike', '|', 'quote', 'line', '|', 'list', 'ordered-list', 'check', 'outdent', 'indent', '|', 'code', 'inline-code', 'link', 'table', '|', 'undo', 'redo'],
				input: onVisualInput,
				after: () => resolve(editor),
			});
			visual.editor = editor;
		};
		document.head.append(el('link', { rel: 'stylesheet', href: '/vditor/dist/index.css' }), script);
	});
	return visual.loading;
}

function onVisualInput(value) {
	// Ignore input while a value is being loaded programmatically.
	if (visual.baseline === null) return;
	visual.edited = value !== visual.baseline;
	if (visual.edited) setDirty(true);
}

async function fillVisual(markdown) {
	visual.original = markdown;
	visual.edited = false;
	visual.baseline = null;
	try {
		const editor = await loadVisualEditor();
		editor.setValue(markdown, true);
		await nextFrame();
		visual.baseline = editor.getValue();
	} catch (e) {
		toast(e.message, 'error');
		await setView('source');
	}
}

function currentBody() {
	if (activeMode() === 'source') return $('#body').value;
	return visual.edited && visual.editor ? visual.editor.getValue() : visual.original;
}

function paintView() {
	const view = previewing ? 'preview' : activeMode();
	$('#visual').hidden = view !== 'visual';
	$('#body').hidden = view !== 'source';
	$('#preview').hidden = view !== 'preview';
	$('#title-slot').hidden = view === 'preview';
	for (const button of document.querySelectorAll('[data-view]')) {
		button.setAttribute('aria-pressed', String(button.dataset.view === view));
		button.hidden = forceSource && button.dataset.view !== 'source';
	}
	if (view === 'source') requestAnimationFrame(() => fit($('#body')));
}

async function setView(next) {
	if (next === 'preview') {
		if (previewing) return;
		previewing = true;
		paintView();
		await updatePreview();
		return;
	}
	if (forceSource && next !== 'source') return;
	previewing = false;
	if (next === activeMode()) {
		paintView();
		return;
	}
	const body = currentBody();
	mode = next;
	remember('mode', next);
	paintView();
	if (mode === 'source') {
		$('#body').value = body;
		fit($('#body'));
	} else {
		await fillVisual(body);
	}
}

async function loadBody(markdown) {
	previewing = false;
	$('#body').value = markdown;
	paintView();
	if (activeMode() === 'visual') await fillVisual(markdown);
	else visual.original = markdown;
}

function focusContent() {
	if (previewing) return;
	if (activeMode() === 'visual') visual.editor?.focus();
	else $('#body').focus();
}

// ---------------------------------------------------------------- title and properties

function showEditor(visible) {
	$('#form').hidden = !visible;
	$('#empty').hidden = visible;
	// The properties panel belongs to an open entry; without one there is nothing to show.
	$('#toggle-inspector').disabled = !visible;
	if (!visible) $('#preview').srcdoc = '';
}

const valueFor = (value) => (Array.isArray(value) ? value.join(', ') : (value ?? ''));

function buildTitle(field, value) {
	const input = el('textarea', { className: 'doc-title', name: field.name, rows: 1, placeholder: field.label, value: valueFor(value), required: Boolean(field.required) });
	input.setAttribute('aria-label', field.label);
	input.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			focusContent();
		}
	});
	requestAnimationFrame(() => fit(input));
	return input;
}

function buildField(field, value) {
	if (field.type === 'boolean') {
		const input = el('input', { type: 'checkbox', name: field.name, checked: value === true });
		input.setAttribute('role', 'switch');
		const text = el('span', { className: 'switch-text' }, el('span', { className: 'switch-label', textContent: field.label }));
		if (field.hint) text.append(el('small', { className: 'hint', textContent: field.hint }));
		return el('label', { className: 'switch-row' }, text, input);
	}
	const input =
		field.type === 'text'
			? el('textarea', { className: 'control', name: field.name, rows: 3, value: valueFor(value) })
			: el('input', { className: 'control', name: field.name, type: field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text', value: valueFor(value) });
	input.required = Boolean(field.required);
	const label = el('label', { className: 'field' }, el('span', { className: 'label', textContent: field.label + (field.required ? ' *' : '') }), input);
	if (field.hint) label.append(el('small', { className: 'hint', textContent: field.hint }));
	return label;
}

// The language of the open entry, and the others: switch to a translation or create a missing one.
function renderLanguages() {
	const box = $('#langs');
	box.replaceChildren();
	const cur = state.current;
	if (!isMulti() || !cur) return;
	const group = el('fieldset', { className: 'group' }, el('legend', { className: 'group-title', textContent: 'Language' }));
	const row = entryRow(cur.file);
	const list = el('div', { className: 'lang-list' });
	for (const l of locales()) {
		const exists = !!row?.locales.includes(l.id);
		const isCurrent = l.id === cur.locale;
		const button = el('button', { className: 'lang-btn', type: 'button', disabled: !cur.file || !state.col.dirs[l.id] }, el('span', { className: 'lang-name', textContent: l.label }));
		button.append(el('span', { className: `lang-state${exists || (isCurrent && cur.file && !cur.creating) ? '' : ' missing'}`, textContent: isCurrent ? (cur.creating ? 'New' : 'Editing') : exists ? 'Open' : 'Create' }));
		button.setAttribute('aria-current', String(isCurrent));
		button.addEventListener('click', () => switchLocale(l.id));
		list.append(button);
	}
	group.append(list);
	if (cur.creating) {
		group.append(el('p', { className: 'note', textContent: `Translating from ${localeInfo(cur.from)?.label ?? cur.from}. Nothing is written until you save.` }));
	}
	box.append(group);
}

async function switchLocale(id) {
	const cur = state.current;
	if (!cur?.file || id === cur.locale || !confirmDiscard()) return;
	if (entryRow(cur.file)?.locales.includes(id)) return openEntry(cur.file, id, { confirmed: true });
	// A missing language starts as a copy of the source, to translate in place.
	const from = entryRow(cur.file)?.locales.includes(defaultLocale()) ? defaultLocale() : cur.locale;
	try {
		const entry = await api(`/api/entry?collection=${encodeURIComponent(state.col.id)}&locale=${encodeURIComponent(from)}&file=${encodeURIComponent(cur.file)}`);
		state.current = { file: cur.file, locale: id, data: entry.data, extra: entry.extra, creating: true, from };
		await renderEditor(entry.body);
		setDirty(true);
		renderList();
		history.replaceState(null, '', hashFor(id, cur.file));
	} catch (e) {
		toast(e.message, 'error');
	}
}

async function renderEditor(body) {
	// Previewing was on for a page that can no longer be previewed.
	forceSource = /\.mdx$/.test(state.current.file ?? '');
	showEditor(true);
	// The browser's spellchecker follows `lang`, so the text is checked in the language of this entry.
	$('.page').lang = $('#fields').lang = state.current.locale ?? '';
	const slot = $('#title-slot');
	const box = $('#fields');
	slot.replaceChildren();
	box.replaceChildren();

	const groups = new Map();
	for (const field of state.col.fields) {
		const value = state.current.data[field.name];
		if (field.name === state.col.titleField) {
			slot.append(buildTitle(field, value));
			continue;
		}
		const name = field.group ?? 'Properties';
		if (!groups.has(name)) groups.set(name, el('fieldset', { className: 'group' }, el('legend', { className: 'group-title', textContent: name })));
		groups.get(name).append(buildField(field, value));
	}
	box.append(...groups.values());
	if (forceSource) box.append(el('p', { className: 'note', textContent: 'This page is MDX (it uses components), so it opens as Markdown only.' }));
	if (state.current.extra.length) {
		box.append(el('p', { className: 'note', textContent: `Also in this file, kept as is: ${state.current.extra.join(', ')}.` }));
	}

	renderLanguages();
	updatePath();
	await loadBody(body);
}

function collect() {
	const data = {};
	for (const field of state.col.fields) {
		const input = $(`#form [name="${field.name}"]`);
		if (field.type === 'boolean') data[field.name] = input.checked;
		else if (field.type === 'list' || field.type === 'people') data[field.name] = input.value.split(',').map((s) => s.trim()).filter(Boolean);
		else data[field.name] = input.value;
	}
	return data;
}

const titleValue = () => $(`#form [name="${state.col.titleField}"]`)?.value ?? '';

function updatePath() {
	const col = state.col;
	if (state.current.file) {
		$('#path').textContent = `${dirFor(state.current.locale)}/${state.current.file}`;
		return;
	}
	const data = collect();
	const slug = slugify(data[col.slugFrom ?? col.titleField] ?? '');
	$('#path').textContent = slug ? `${dirFor(state.current.locale)}/${col.filename.replace('{date}', data.date).replace('{slug}', slug)}` : `New ${col.singular}`;
}

async function openEntry(file, locale, { confirmed = false } = {}) {
	if (!confirmed && !confirmDiscard()) return;
	try {
		// Without a language: the source one when the entry has it, else the first translation that exists.
		const present = entryRow(file)?.locales ?? [defaultLocale()];
		const use = locale ?? (present.includes(defaultLocale()) ? defaultLocale() : present[0]);
		const entry = await api(`/api/entry?collection=${encodeURIComponent(state.col.id)}&locale=${encodeURIComponent(use)}&file=${encodeURIComponent(file)}`);
		state.current = { file, locale: use, data: entry.data, extra: entry.extra };
		await renderEditor(entry.body);
		setDirty(false);
		renderList();
		history.replaceState(null, '', hashFor(use, file));
	} catch (e) {
		toast(e.message, 'error');
	}
}

async function newEntry() {
	if (!confirmDiscard()) return;
	const data = {};
	for (const field of state.col.fields) {
		if (field.type === 'boolean') data[field.name] = false;
		else if (field.type === 'list' || field.type === 'people') data[field.name] = [];
		else data[field.name] = field.default === 'today' ? today() : '';
	}
	state.current = { file: null, locale: defaultLocale(), data, extra: [] };
	history.replaceState(null, '', location.pathname);
	await renderEditor('');
	setDirty(false);
	renderList();
	$('#title-slot textarea')?.focus();
}

async function save(event) {
	event.preventDefault();
	const button = $('#save');
	button.disabled = true;
	try {
		const result = await api('/api/entry', {
			method: 'PUT',
			body: { collection: state.col.id, locale: state.current.locale, file: state.current.file, create: state.current.creating, from: state.current.from, data: collect(), body: currentBody() },
		});
		state.current.file = result.file;
		state.current.creating = false;
		history.replaceState(null, '', hashFor(state.current.locale, result.file));
		setDirty(false);
		updatePath();
		toast(`Saved ${result.path}`);
		await loadEntries();
	} catch (e) {
		toast(e.message, 'error');
	} finally {
		button.disabled = false;
	}
}

// The file the server would write, downloaded from the browser. Nothing is saved.
async function download() {
	try {
		const { filename, text } = await api('/api/export', {
			method: 'POST',
			body: { collection: state.col.id, locale: state.current.locale, file: state.current.file, data: collect(), body: currentBody() },
		});
		const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
		const link = el('a', { href: url, download: filename });
		document.body.append(link);
		link.click();
		link.remove();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
		toast(`Downloaded ${filename}`);
	} catch (e) {
		toast(e.message, 'error');
	}
}

// ---------------------------------------------------------------- preview

const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function previewDoc(html, title) {
	const font = (name, file, weights) => `@font-face{font-family:'${name}';src:url(${location.origin}/fonts/${file}) format('woff2');font-weight:${weights}}`;
	const dark = isDark();
	const c = dark ? { fg: '#f5f5f7', soft: '#303034', line: '#3a3a3e', accent: '#7a9bff' } : { fg: '#1d1d1f', soft: '#f0f2f6', line: '#dfe2e8', accent: '#004aff' };
	return `<!doctype html><meta charset="utf-8"><style>
${font('Red Hat Text', 'text.woff2', '300 900')}${font('Red Hat Mono', 'mono.woff2', '300 700')}
:root{color-scheme:${dark ? 'dark' : 'light'};--fg:${c.fg};--soft:${c.soft};--line:${c.line};--accent:${c.accent}}
body{margin:0;padding:0 0 3rem;background:transparent;color:var(--fg);font:400 1.0625rem/1.7 'Red Hat Text',system-ui,sans-serif}
h1,h2,h3{line-height:1.2;font-weight:600}h1{font-size:2.25rem;font-weight:700;letter-spacing:-.02em;line-height:1.15;margin:0 0 1rem}h2{margin-top:2.25rem}
a{color:var(--accent)}code{font-family:'Red Hat Mono',monospace;font-size:.875em;background:var(--soft);padding:.1em .35em;border-radius:.3em}
pre{padding:1rem;border-radius:.5rem;overflow-x:auto;line-height:1.5}pre code{background:none;padding:0}
table{border-collapse:collapse;width:100%}th,td{border:1px solid var(--line);padding:.5rem .75rem;text-align:left}
blockquote{margin:1rem 0;padding:0 1rem;border-left:3px solid var(--line);color:inherit;opacity:.85}img{max-width:100%}
</style>${title ? `<h1>${escapeHtml(title)}</h1>` : ''}${html}`;
}

let previewTimer;
let previewSeq = 0;
function schedulePreview() {
	if (!previewing) return;
	clearTimeout(previewTimer);
	previewTimer = setTimeout(updatePreview, 250);
}

async function updatePreview() {
	if ($('#form').hidden || !previewing) return;
	const seq = ++previewSeq;
	try {
		const { html } = await api('/api/preview', { method: 'POST', body: { body: currentBody() } });
		if (seq === previewSeq) $('#preview').srcdoc = previewDoc(html, titleValue());
	} catch (e) {
		toast(e.message, 'error');
	}
}

// The preview grows with its content, so the page scrolls once instead of the frame inside the page.
function fitPreview() {
	const frame = $('#preview');
	const doc = frame.contentDocument;
	if (doc) frame.style.height = `${doc.documentElement.scrollHeight}px`;
}
$('#preview').addEventListener('load', () => {
	fitPreview();
	$('#preview').contentDocument?.fonts?.ready.then(fitPreview);
});

// ---------------------------------------------------------------- wiring

$('#new').addEventListener('click', newEntry);
$('#new-empty').addEventListener('click', newEntry);
$('#toggle-list').addEventListener('click', () => togglePanel('list'));
$('#toggle-theme').addEventListener('click', toggleTheme);
$('#toggle-inspector').addEventListener('click', () => togglePanel('inspector'));
$('#download').addEventListener('click', download);
$('#form').addEventListener('submit', save);
$('#form').addEventListener('input', (e) => {
	// The visual editor reports its own edits through its `input` callback.
	if (e.target.closest('#visual')) return;
	if (e.target.matches('.doc-title, #body')) fit(e.target);
	setDirty(true);
	updatePath();
	schedulePreview();
});
// A required property hidden in the collapsed inspector would block saving with no visible reason.
$('#form').addEventListener('invalid', (e) => {
	if (e.target.closest('#inspector')) setPanel('inspector', true);
}, true);
for (const button of document.querySelectorAll('[data-view]')) button.addEventListener('click', () => setView(button.dataset.view));

document.addEventListener('keydown', (e) => {
	const modifier = e.ctrlKey || e.metaKey;
	if (modifier && !e.altKey && e.key.toLowerCase() === 's' && !$('#form').hidden) {
		e.preventDefault();
		$('#form').requestSubmit();
	} else if (modifier && e.altKey && e.code === 'KeyI') {
		e.preventDefault();
		togglePanel('inspector');
	} else if (modifier && e.altKey && e.code === 'KeyS') {
		e.preventDefault();
		togglePanel('list');
	}
});

try {
	state.config = await api('/api/config');
	state.col = state.config.collections[0];
	if (recall('mode') === null) mode = state.col.editor === 'source' ? 'source' : 'visual';
	applyTheme();
	initPanels();
	renderTabs();
	labelNewButtons();
	paintView();
	await loadEntries();
	// `#locale:file` (or `#file` for the source language).
	const initial = decodeURIComponent(location.hash.slice(1));
	const at = initial.indexOf(':');
	if (initial) await openEntry(at > 0 ? initial.slice(at + 1) : initial, at > 0 ? initial.slice(0, at) : undefined);
} catch (e) {
	toast(e.message, 'error');
}
