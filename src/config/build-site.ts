import { siteConfig } from './site';

// Astro replaces private environment variables through explicit property access.
// Passing the whole import.meta.env object omits them in the static build.
export const buildSite = siteConfig({
  DEPLOY_ENV: import.meta.env.DEPLOY_ENV,
  SITE_URL: import.meta.env.SITE_URL,
  PUBLIC_SITE_NAME: import.meta.env.PUBLIC_SITE_NAME,
  MAINTAINER_NAME: import.meta.env.MAINTAINER_NAME,
  CONTACT_EMAIL: import.meta.env.CONTACT_EMAIL,
});
