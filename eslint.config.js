import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';

export default [
  { ignores: ['dist/**', '.astro/**', '.wrangler/**', 'output/**', 'node_modules/**', 'test-results/**', 'playwright-report/**'] },
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
  { files: ['**/*.astro'], languageOptions: { parserOptions: { parser: tseslint.parser } } },
];
