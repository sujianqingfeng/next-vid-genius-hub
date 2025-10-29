import { defineConfig } from 'tsdown'

export default defineConfig({
  dts: true,
  sourcemap: true,
  clean: true,
  entry: {
    index: 'src/index.ts',
  },
  format: ['esm'],
  platform: 'node',
  external: ['yaml'],
})
