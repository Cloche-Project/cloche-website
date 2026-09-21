import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';

const ORG = 'cloche-project';

const IMAGES = [
	{ image: 'cloche', repo: 'cloche' },
	{ image: 'cloche-standard-gnome', repo: 'cloche-standard' },
	{ image: 'cloche-standard-plasma', repo: 'cloche-standard' },
	{ image: 'cloche-pro', repo: 'cloche-pro' },
	{ image: 'cloche-pro-workstation-gnome', repo: 'cloche-pro-workstation' },
	{ image: 'cloche-pro-workstation-plasma', repo: 'cloche-pro-workstation' },
	{ image: 'cloche-xe', repo: 'cloche-xe' },
	{ image: 'cloche-xe-gnome', repo: 'cloche-xe' },
	{ image: 'cloche-xe-deck', repo: 'cloche-xe' },
	{ image: 'cloche-xe-deck-gnome', repo: 'cloche-xe' },
];

const headers = { Accept: 'application/vnd.github+json' };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

async function latestRun(repo) {
	try {
		const res = await fetch(
			`https://api.github.com/repos/${ORG}/${repo}/actions/runs?branch=main&per_page=1`,
			{ headers },
		);
		if (!res.ok) return null;
		const run = (await res.json()).workflow_runs?.[0];
		if (!run) return null;
		return {
			conclusion: run.conclusion ?? run.status,
			updatedAt: run.updated_at,
			url: run.html_url,
		};
	} catch {
		return null;
	}
}

const repos = [...new Set(IMAGES.map((i) => i.repo))];
const runs = Object.fromEntries(await Promise.all(repos.map(async (r) => [r, await latestRun(r)])));

const OUT = new URL('../src/data/status.json', import.meta.url);
if (!Object.values(runs).some(Boolean) && existsSync(OUT)) {
	console.log('status: GitHub API unreachable or rate limited, keeping the previous src/data/status.json');
	process.exit(0);
}

const data = {
	generatedAt: new Date().toISOString(),
	images: IMAGES.map(({ image, repo }) => ({
		image,
		repo,
		pull: `ghcr.io/${ORG}/${image}:latest`,
		packageUrl: `https://github.com/orgs/${ORG}/packages/container/package/${image}`,
		run: runs[repo],
	})),
};

await mkdir(new URL('../src/data/', import.meta.url), { recursive: true });
await writeFile(new URL('../src/data/status.json', import.meta.url), JSON.stringify(data, null, 2) + '\n');
console.log(`status.json written (${data.images.length} images, ${Object.values(runs).filter(Boolean).length}/${repos.length} repos reachable)`);
