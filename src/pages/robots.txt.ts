import { buildSite as site } from '../config/build-site';
export function GET() {
  // Allow crawlers to read the noindex meta tag in local/preview HTML.
  return new Response(`User-agent: *\nAllow: /\n${site.indexable ? `Sitemap: ${site.origin}/sitemap-index.xml\n` : '# This environment serves noindex pages and has no sitemap.\n'}`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
