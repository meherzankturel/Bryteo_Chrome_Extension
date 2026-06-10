import { defineBackground } from 'wxt/sandbox';
import { ensureSignedIn } from '../../src/api/auth';

export default defineBackground(() => {
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

  chrome.action.onClicked.addListener(async (tab) => {
    if (!tab.id) return;
    await chrome.sidePanel.setOptions({
      tabId: tab.id,
      path: 'sidepanel.html',
      enabled: true
    });
    await chrome.sidePanel.open({ tabId: tab.id });
  });
});
