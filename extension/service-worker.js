// Yotathai Chrome Agent — Background Service Worker
const LEGACY_DUPLICATE_EXT_ID = 'bckipidmifaepcjjfcgonbjnfhngaffb';

async function initSidePanel() {
  if (chrome.runtime?.id === LEGACY_DUPLICATE_EXT_ID && chrome.management?.uninstallSelf) {
    try {
      await chrome.management.uninstallSelf({ showConfirmDialog: false });
      return;
    } catch (e) {}
  }
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (err) {
    console.error('Failed to set sidePanel behavior:', err);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  initSidePanel();
});

chrome.runtime.onStartup.addListener(() => {
  initSidePanel();
});

chrome.action.onClicked.addListener(async (tab) => {
  if (chrome.runtime?.id === LEGACY_DUPLICATE_EXT_ID && chrome.management?.uninstallSelf) {
    await chrome.management.uninstallSelf({ showConfirmDialog: false });
    return;
  }
  try {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  } catch (err) {
    console.error('Error opening side panel:', err);
  }
});

