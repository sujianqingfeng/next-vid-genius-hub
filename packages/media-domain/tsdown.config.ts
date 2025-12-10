import { defineConfig } from 'tsdown'

export default defineConfig({
  dts: true,
  sourcemap: true,
  clean: true,
  entry: {
    index: 'src/index.ts',
    'bucket-paths': 'src/bucket-paths.ts',
    job: 'src/job.ts',
  },
  format: ['esm'],
  platform: 'neutral',
})
