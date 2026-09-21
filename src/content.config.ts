import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { docsLoader, i18nLoader } from '@astrojs/starlight/loaders';
import { docsSchema, i18nSchema } from '@astrojs/starlight/schema';
import { blogSchema } from 'starlight-blog/schema';

export const collections = {
	docs: defineCollection({
		loader: docsLoader(),
		schema: docsSchema({ extend: (context) => blogSchema(context) }),
	}),
	// UI strings: our own `cloche.*` keys plus the `starlightBlog.*` ones the blog plugin lacks for pt/es.
	i18n: defineCollection({
		loader: i18nLoader(),
		schema: i18nSchema({ extend: z.object({}).catchall(z.string()) }),
	}),
};
