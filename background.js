const CONTEXT_MENU_ID = "FELKER_WEB_CLIPPER";
const CONTEXT_MENU_VERBATIM_ID = "FELKER_WEB_CLIPPER_VERBATIM";
const CONTEXT_MENU_ARTICLE_ID = "FELKER_WEB_CLIPPER_ARTICLE";
const CONTEXT_MENU_CITATION_ID = "FELKER_WEB_CLIPPER_CITATION";
const NOTIFICATION_ID = "FELKER_WEB_CLIPPER_NOTIFICATION";
/** Add a suffix so I know whether this is dev or prod */
// const DEBUG_SUFF = ` (ALPHA)`
const DEBUG_SUFF = ``

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: `Clip to Obsidian${DEBUG_SUFF}`,
    contexts: ["page", "link", "image"],
    documentUrlPatterns: [
      "<all_urls>",
    ]
  });

  chrome.contextMenus.create({
    id: CONTEXT_MENU_VERBATIM_ID,
    title: `Clip text verbatim${DEBUG_SUFF}`,
    contexts: ["page", "link", "image"],
    documentUrlPatterns: [
      "https://twitter.com/*",
      "https://x.com/*",
      "https://bsky.app/*",
    ]
  });

  chrome.contextMenus.create({
    id: CONTEXT_MENU_ARTICLE_ID,
    title: `Clip headline${DEBUG_SUFF}`,
    contexts: ["page"],
    documentUrlPatterns: [
      "<all_urls>",
    ]
  });

  chrome.contextMenus.create({
    id: CONTEXT_MENU_CITATION_ID,
    title: `Copy citation${DEBUG_SUFF}`,
    contexts: ["page"],
    documentUrlPatterns: [
      "<all_urls>",
    ]
  });
  console.log('1')
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === CONTEXT_MENU_ID) {
    // Send a message to the content script to start the clipping process
    chrome.tabs.sendMessage(tab.id, { action: "clipContent" }, (response) => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError.message);
      }
    });
  } else if (info.menuItemId === CONTEXT_MENU_VERBATIM_ID) {
    chrome.tabs.sendMessage(tab.id, { action: "clipVerbatim" }, (response) => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError.message);
      }
    });
  } else if (info.menuItemId === CONTEXT_MENU_ARTICLE_ID) {
    chrome.tabs.sendMessage(tab.id, { action: "clipArticle" }, (response) => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError.message);
      }
    });
  } else if (info.menuItemId === CONTEXT_MENU_CITATION_ID) {
    chrome.tabs.sendMessage(tab.id, { action: "clipCitation" }, (response) => {
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
  } else if (request.action === "clippingComplete") {
    // 1. Copy to clipboard
    writeToClipboard(request.markdownContent);

    // 2. Show final notification with buttons
    chrome.notifications.clear(NOTIFICATION_ID);
    chrome.notifications.create(NOTIFICATION_ID, {
      type: 'basic',
      iconUrl: 'green-clipboard-128.png',
      title: 'Clipped to Clipboard!',
      message: `${request.summary}\n\nFile: ${request.titleName}`,
      buttons: [
        { title: 'Open in Obsidian' }
      ],
      priority: 2
    });

    // Store the URI for the button click handler
    chrome.storage.local.set({ lastObsidianUri: request.obsidianUri });

  } else if (request.action === "copyToClipboard") {
    writeToClipboard(request.text);
  } else if (request.action === "fetchCrossOriginImage") {
    // Check if the message is a request to fetch an image
    if (request.url) {
      console.debug(request.url)
        // Use fetch() to download the image, bypassing CORS restrictions
        fetch(request.url)
            .then(response => {
                if (!response.ok) throw new Error('Failed to fetch image');
                return response.blob();
            })
            .then(blob => {
                // Convert the blob to a base64 Data URL to send back to the content script
                return new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                });
            })
            .then(dataUrl => {
                sendResponse({ dataUrl: dataUrl });
            })
            .catch(error => {
                console.error("Background fetch error:", error);
                sendResponse({ error: error.message });
            });
        
        // Return true to indicate you will send a response asynchronously
        return true; 
    }
  }
  // Keep the message channel open for the response
  return false;
});

chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  if (notificationId === NOTIFICATION_ID && buttonIndex === 0) {
    chrome.storage.local.get(['lastObsidianUri'], (result) => {
      if (result.lastObsidianUri) {
        // Use chrome.tabs.update to open the deep link
        chrome.tabs.create({ url: result.lastObsidianUri, active: false }, (tab) => {
           // Small delay to ensure it triggers, then close the tab if it's just a URI trigger
           setTimeout(() => chrome.tabs.remove(tab.id), 1000);
        });
      }
    });
  }
});

async function writeToClipboard(text) {
  if (!(await chrome.offscreen.hasDocument())) {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: [chrome.offscreen.Reason.CLIPBOARD],
      justification: 'Copying content to clipboard'
    });
  }
  
  chrome.runtime.sendMessage({
    target: 'offscreen',
    action: 'copyToClipboard',
    text: text
  });
}
