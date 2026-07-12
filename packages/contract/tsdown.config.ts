import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  platform: 'neutral',
  target: 'node20',
  clean: true,
  dts: true,
  minify: false,
  // "type": "module" makes tsdown default the ESM output to .js/.d.ts;
  // package.json's main/types/exports point to .mjs/.d.mts (needed so
  // rolldown resolves this workspace package when the CLI bundles it).
  outExtensions: () => ({ js: '.mjs', dts: '.d.mts' }),
})
