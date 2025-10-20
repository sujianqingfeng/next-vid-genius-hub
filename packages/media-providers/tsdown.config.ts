import { defineConfig } from 'tsdown'

export default defineConfig({
  dts: true,
  sourcemap: true,
  clean: true,
  entry: {
    index: 'src/index.ts',
    'index.browser': 'src/index.browser.ts',
  },
  format: ['esm'],
  platform: 'neutral',
  external: ['undici', 'youtubei.js'],
})
