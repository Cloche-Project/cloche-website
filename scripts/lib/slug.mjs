// Shared by the new-post CLI, the studio server, and (served as /slug.js) the studio UI.
export function slugify(text) {
	return String(text)
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60)
		.replace(/-+$/, '');
}
