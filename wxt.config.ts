import { defineConfig } from 'wxt';
import { fileURLToPath } from 'node:url';

const srcPath = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: '.',
  vite: () => ({
    resolve: {
      alias: { '@': srcPath }
    }
  }),
  manifest: {
    name: 'BRYTEO — Remember what you watch',
    description: 'Turn YouTube videos into AI flashcards with spaced repetition.',
    version: '0.1.0',
    permissions: ['storage', 'sidePanel', 'activeTab', 'scripting'],
    host_permissions: ['https://*.youtube.com/*'],
    icons: {
      16: 'icons/icon-16.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png'
    },
    action: {
      default_title: 'BRYTEO',
      default_icon: {
        16: 'icons/icon-16.png',
        48: 'icons/icon-48.png',
        128: 'icons/icon-128.png'
      }
    },
    side_panel: {
      default_path: 'sidepanel.html'
    },
    content_security_policy: {
      extension_pages:
        "script-src 'self'; object-src 'self'; connect-src 'self' https://*.supabase.co https://app.lemonsqueezy.com"
    }
  }
});
