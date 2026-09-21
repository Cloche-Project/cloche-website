import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';

const ORG = 'cloche-project';
const OUT = new URL('../src/data/changelog.json', import.meta.url);

const FAMILIES = [
	{ id: 'cloche', title: 'Cloche', repos: ['cloche', 'cloche-standard'] },
	{ id: 'pro', title: 'Cloche PRO', repos: ['cloche-pro', 'cloche-pro-workstation'] },
	{ id: 'xe', title: 'Cloche Xe', repos: ['cloche-xe'] },
];

// Conventional-commit types that do not change what ships in an image.
const HIDDEN_TYPES = new Set(['docs', 'ci', 'chore', 'test', 'style', 'build']);
const COMMITS_PER_REPO = 50;
const ENTRIES_PER_FAMILY = 20;

const headers = { Accept: 'application/vnd.github+json' };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

function parse(message) {
	const first = message.split('\n')[0].trim();
	if (/^Merge /.test(first)) return null;
	const m = first.match(/^(\w+)(?:\(([^)]*)\))?(!)?:\s*(.+)$/);
	if (!m) return { type: 'other', scope: null, breaking: false, text: first };
	const type = m[1].toLowerCase();
	if (HIDDEN_TYPES.has(type)) return null;
	return { type, scope: m[2] ?? null, breaking: Boolean(m[3]), text: m[4] };
}

async function commits(repo) {
	try {
		const res = await fetch(`https://api.github.com/repos/${ORG}/${repo}/commits?sha=main&per_page=${COMMITS_PER_REPO}`, { headers });
		if (!res.ok) return null;
		const list = await res.json();
		return list.flatMap((c) => {
			const parsed = parse(c.commit.message);
			if (!parsed) return [];
			return [{ repo, sha: c.sha.slice(0, 7), url: c.html_url, date: c.commit.author.date.slice(0, 10), ...parsed }];
		});
	} catch {
		return null;
	}
}

const repos = [...new Set(FAMILIES.flatMap((f) => f.repos))];
const results = Object.fromEntries(await Promise.all(repos.map(async (r) => [r, await commits(r)])));
const reachable = repos.filter((r) => results[r]);

if (reachable.length === 0 && existsSync(OUT)) {
	console.log('changelog: GitHub API unreachable or rate limited, keeping the previous src/data/changelog.json');
	process.exit(0);
}

const data = {
	generatedAt: new Date().toISOString(),
	unavailable: reachable.length === 0,
	families: FAMILIES.map((f) => ({
		id: f.id,
		title: f.title,
		entries: f.repos
			.flatMap((r) => results[r] ?? [])
			.sort((a, b) => b.date.localeCompare(a.date))
			.slice(0, ENTRIES_PER_FAMILY),
	})),
};

await mkdir(new URL('../src/data/', import.meta.url), { recursive: true });
await writeFile(OUT, JSON.stringify(data, null, 2) + '\n');
console.log(`changelog.json written (${reachable.length}/${repos.length} repos reachable, ${data.families.map((f) => `${f.id}:${f.entries.length}`).join(' ')})`);
