// Keyboard shortcut (Alt+Shift+B): start picking on the current tab.
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'start-picker' || !tab || !tab.id) return;
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/finder.js'] });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (mode) => window.__BIF && window.__BIF.start(mode),
      args: ['pick']
    });
  } catch (e) {
    // Chrome blocks extensions on chrome:// pages and the Web Store; nothing to do.
  }
});
