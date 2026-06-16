// Runs before React mounts. Reads the user's saved theme from localStorage and
// sets the data-theme attribute on <html> so the first paint shows the correct
// colors (prevents flash-of-wrong-theme). chrome.storage is async; localStorage
// is the synchronous mirror set by src/lib/theme.ts.
(function () {
  try {
    var s = localStorage.getItem('bryteo.theme');
    if (s === 'dark' || s === 'light') {
      document.documentElement.dataset.theme = s;
    }
  } catch (e) {}
})();
