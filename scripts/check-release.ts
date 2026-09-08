import { readFileSync } from 'node:fs';
import { parse, printParseErrorCode, type ParseError } from 'jsonc-parser';
import { releaseErrors, siteConfig } from '../src/config/site.ts';
import { auditHtml } from './audit-html.ts';

const errors = releaseErrors(process.env);
try {
  const source = readFileSync('wrangler.jsonc', 'utf8');
  const parseErrors: ParseError[] = [];
  const wrangler = parse(source, parseErrors, { allowTrailingComma: true });
  // The parser can recover partial data; never accept it when syntax errors remain.
  if (parseErrors.length) {
    const first = parseErrors[0];
    const lines = source.slice(0, first.offset).split(/\r\n|\r|\n/);
    throw new Error(`${printParseErrorCode(first.error)} at line ${lines.length}, column ${lines[lines.length - 1].length + 1}.`);
  }
  if (wrangler?.main || wrangler?.assets?.directory !== './dist' || wrangler?.assets?.html_handling !== 'force-trailing-slash' || wrangler?.assets?.not_found_handling !== '404-page') errors.push('Wrangler must serve dist directly, with trailing slashes and a real 404, without a Worker entry point.');
} catch (error) { errors.push(`wrangler.jsonc: ${(error as Error).message}`); }
try {
  if (readFileSync('.node-version', 'utf8').trim() !== process.versions.node) errors.push('Use the pinned Node version for release checks.');
} catch (error) { errors.push(`.node-version: ${(error as Error).message}`); }
if (!errors.length) {
  try {
    const site = siteConfig(process.env);
    auditHtml('dist', site.origin);
    const about = readFileSync('dist/about/index.html', 'utf8');
    if (/not been published yet|example\.(com|org|net)|localhost/.test(about)) errors.push('The built About page still contains release placeholders.');
  } catch (error) { errors.push(`Built release assets failed validation: ${(error as Error).message}`); }
}
if (errors.length) {
  console.error('Release is not ready:\n' + errors.map(error => `- ${error}`).join('\n'));
  process.exitCode = 1;
} else console.log('Release configuration and built HTML passed. Domain ownership, account access, and live routing still require deployment-stage verification. Nothing was deployed.');
