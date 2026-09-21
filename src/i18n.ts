// Helpers for components rendered inside Starlight pages. Strings come from `Astro.locals.t`
// (src/content/i18n/<lang>.json); links get the current locale's URL prefix.
export function localePath(astro: { locals: { starlightRoute?: { locale?: string } } }, path: string): string {
	const locale = astro.locals.starlightRoute?.locale;
	return locale ? `/${locale}${path}` : path;
}
