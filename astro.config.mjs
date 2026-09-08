import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { loadEnv } from 'vite';
import { siteConfig, indexablePaths } from './src/config/site.ts';

const env = { ...loadEnv(process.env.NODE_ENV || 'production', process.cwd(), ''), ...process.env };
const site = siteConfig(env);
export default defineConfig({
  site: site.origin,
  output: 'static',
  trailingSlash: 'always',
  integrations: [react(), ...(site.indexable ? [sitemap({ filter: page => indexablePaths.includes(new URL(page).pathname) })] : [])],
  vite: { plugins: [tailwindcss()] },
  devToolbar: { enabled: false },
});
