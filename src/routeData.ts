import { defineRouteMiddleware } from '@astrojs/starlight/route-data';

// The page theme decides whether to render the sidebar from `sidebar.length`, ignoring `hasSidebar`
// (false for the splash template), so empty it here.
export const onRequest = defineRouteMiddleware((context) => {
	const route = context.locals.starlightRoute;
	if (!route.hasSidebar) route.sidebar = [];
});
