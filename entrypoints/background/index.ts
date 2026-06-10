import { defineBackground } from 'wxt/sandbox';
import { ensureSignedIn } from '../../src/api/auth';

export default defineBackground(() => {
  // Make clicking the toolbar icon open the side panel directly.
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((e) => console.error('[bryteo] setPanelBehavior failed', e));

  chrome.runtime.onInstalled.addListener(async (details) => {
    try {
      await ensureSignedIn();
    } catch (e) {
      console.error('[bryteo] anon signin failed', e);
    }

    if (details.reason === 'install') {
      chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
    }
  });
});
