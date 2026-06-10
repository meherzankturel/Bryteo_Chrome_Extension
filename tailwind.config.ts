import type { Config } from 'tailwindcss';

export default {
  content: [
    './entrypoints/**/*.{html,tsx,ts}',
    './src/**/*.{tsx,ts}'
  ],
  theme: {
    extend: {
      colors: {
        ink: '#0F172A',
        slate: { 50: '#F8FAFC', 100: '#F1F5F9', 600: '#475569' }
      }
    }
  }
} satisfies Config;
