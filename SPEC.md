This is a browser (Google Chrome) extension which is designed to work for Twitter (X), Instapaper, and BlueSky but also have an adaptive way for more services over time.

On these websites, a right-click menu click will add a new option to perform a web-clip. This takes the content:

- On Twitter (X) it takes a twitter post, the thread, the quoted tweet, and any images
- On Instapaper it takes the article content
- On BlueSky it takes the post, thread, quoted post, and any images

It uses a content script this extension injects to use Chrome's on-device AI LLM to obtain a short summary of the content that would be used in a bullet list along with markdown for the link.

ie. "[Summary of the post](original URL)"

The on-device AI LLM should also decide based on an included prompt context what the file name should be. The result of the LLM should be the file name based on the content and the list of suggested files. The LLM, if it can't pick the right file name from the list, should create one that makes sense.

This content is copied to the device clipboard. An alert appears on the page showing the content and filename (window.confirm). If the user clicks cancel, nothing happens (but we still have the copied content). If they click ok, then the URI `obsidian://open?vault=<vault name>&file=<file name>` is loaded.

There is a settings page for this extension. This settings page has a vault name input. There's also a section to enter and manage a list of potential file names.


  "icons": {
//     "16": "icons/icon16.png",
//     "48": "icons/icon48.png",
//     "128": "icons/icon128.png"
//   }

