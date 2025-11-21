const CONTEXT_MENU_ID = "FELKER_WEB_CLIPPER";
const NOTIFICATION_ID = "FELKER_WEB_CLIPPER_NOTIFICATION";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: "Clip to Obsidian",
    contexts: ["page", "link", "image"],
    documentUrlPatterns: [
      "https://twitter.com/*",
      "https://x.com/*",
      "https://www.instapaper.com/read/*",
      "https://bsky.app/*"
    ]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === CONTEXT_MENU_ID) {
    // Send a message to the content script to start the clipping process
    chrome.tabs.sendMessage(tab.id, { action: "clipContent" }, (response) => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError.message);
      }
    });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "showNotification") {
    chrome.notifications.create(NOTIFICATION_ID, {
      type: 'basic',
      iconUrl: 'green-clipboard-128.png',
      title: 'Web Clipper',
      message: 'Clipping content and generating summary...',
      priority: 1
    });
  } else if (request.action === "clearNotification") {
    chrome.notifications.clear(NOTIFICATION_ID);
  }
  // Keep the message channel open for the response
  return false;
});
