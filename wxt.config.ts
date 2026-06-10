import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: '.',
  manifest: {
    name: 'bryteo — Remember what you watch',
    description: 'Turn YouTube videos into AI flashcards with spaced repetition.',
    version: '0.1.0',
    permissions: ['storage', 'sidePanel', 'activeTab'],
    host_permissions: ['https://*.youtube.com/*'],
    action: {
      default_title: 'bryteo',
      default_popup: 'popup.html'
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
