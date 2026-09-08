export const indexablePaths = ['/', '/guides/convert-webp-to-png/', '/about/', '/privacy/', '/terms/'];

export function siteConfig(env: Record<string, string | undefined>) {
  const environment = env.DEPLOY_ENV || 'local';
  if (!['local', 'preview', 'production'].includes(environment)) throw new Error('DEPLOY_ENV must be local, preview, or production.');
  const production = environment === 'production';
  const origin = env.SITE_URL?.trim() || '';
  if (production) {
    let url: URL;
    try { url = new URL(origin); } catch { throw new Error('Production requires a real HTTPS SITE_URL.'); }
    const host = url.hostname;
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash ||
      !host.includes('.') || /(^|\.)(localhost|example\.(com|org|net))$|\.(test|invalid|local|localhost|example|workers\.dev|pages\.dev)$|(^|[.-])(test|preview|staging)([.-]|$)/i.test(host) ||
      /^[\d.]+$/.test(host) || host.includes(':')) {
      throw new Error('SITE_URL must be your public HTTPS production origin, without a path, port, or placeholder hostname.');
    }
  }
  return {
    environment,
    indexable: production,
    // Non-production never emits a placeholder canonical or sitemap.
    origin: production ? new URL(origin).origin : undefined,
    name: env.PUBLIC_SITE_NAME?.trim() || 'WebP to PNG Converter',
    maintainer: env.MAINTAINER_NAME?.trim() || '',
    contact: env.CONTACT_EMAIL?.trim() || '',
  };
}

export function releaseErrors(env: Record<string, string | undefined>) {
  const errors: string[] = [];
  try { siteConfig({ ...env, DEPLOY_ENV: 'production' }); } catch (error) { errors.push((error as Error).message); }
  if (env.DEPLOY_ENV !== 'production') errors.push('Set DEPLOY_ENV=production for the release build.');
  if (!env.MAINTAINER_NAME?.trim()) errors.push('Set MAINTAINER_NAME before publication.');
  if (!env.CONTACT_EMAIL || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.CONTACT_EMAIL) || /example\.(com|org|net)/i.test(env.CONTACT_EMAIL)) errors.push('Set a real CONTACT_EMAIL before publication.');
  return errors;
}
