import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: [
    'react',
    'react-dom',
    'react-i18next',
    '@tanstack/react-table',
    'lucide-react',
    'clsx',
    'date-fns',
    'file-saver',
    'xlsx',
  ],
  treeshake: true,
});
