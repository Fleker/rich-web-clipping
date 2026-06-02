chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "clipContent") {
    main();
    sendResponse({ status: "started" });
  } else if (request.action === "clipVerbatim") {
    clipVerbatim();
    sendResponse({ status: "started" });
  } else if (request.action === "clipArticle") {
    clipArticle();
    sendResponse({ status: "started" });
  } else if (request.action === "clipCitation") {
    clipCitation();
    sendResponse({ status: "started" });
  }
  return true; // Indicates that the response is sent asynchronously
});

const otMeta = document.createElement('meta');
otMeta.httpEquiv = 'origin-trial';
otMeta.content = 'A2vcIvxIPKOCnSV5np9r2ZHrsGOoNfkb7766Jgc9R73mB6DbxJFb2ddMYgQn/+FFo3DmslwdGb++mHQan1cs+QcAAACPeyJvcmlnaW4iOiJjaHJvbWUtZXh0ZW5zaW9uOi8vZnBobXBpY2djamttZmFvZGFrZmFlbmFjaWRuamRpbHAiLCJmZWF0dXJlIjoiQUlQcm9tcHRBUElNdWx0aW1vZGFsSW5wdXQiLCJleHBpcnkiOjE3NzQzMTA0MDAsImlzVGhpcmRQYXJ0eSI6dHJ1ZX0=';
document.head.append(otMeta);

let languageModelWorking = false

// check web clip status
LanguageModel.availability({
  expectedInputs: [{type: 'text', languages: ['en']}, { type:'image' }],
  expectedOutputs: [{type: 'text', languages: ['en']}],
})
  .then((isAvailable) => {
    if (isAvailable === 'available') {
      languageModelWorking = true;
    }
  })

async function main() {
  if (!languageModelWorking) {
    return window.alert('Language model is not available')
  }
  // unawaited
  chrome.runtime.sendMessage({ action: "showNotification" });

  try {
    // 1. Extract content from the page
    const pageContent = await extractContent(window.location.href);
    if (!pageContent) {
      console.debug("No content to clip on this page.");
      await chrome.runtime.sendMessage({ action: "clearNotification" });
      return;
    }

    // 2. Get settings from chrome storage
    const { vaultName, fileNames } = await chrome.storage.sync.get(["vaultName", "fileNames"]);

    // 3. Use on-device AI for summary and filename
    const aiResult = await getAiSummaryAndFileName(
      pageContent.text,
      pageContent.imageCaptions,
      pageContent.imageBitmaps || [],
      fileNames || []
    );
    // unawaited
    chrome.runtime.sendMessage({ action: "clearNotification" });

    if (aiResult === null) {
      return window.alert('Oops the AI result was bad')
    }

    // 4. Format the content for the clipboard
    const markdownContent = `* [${aiResult.summary}](${window.location.href})`;

    // 5. Send to background to handle clipboard and notification
    await chrome.runtime.sendMessage({
      action: "clippingComplete",
      markdownContent: markdownContent,
      titleName: aiResult.titleName,
      summary: aiResult.summary,
      vaultName: vaultName,
      obsidianUri: `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(aiResult.titleName)}.md`
    });
  } catch (error) {
    console.error("Web Clipper Error:", error);
    alert("An error occurred while clipping the content.");
    // unawaited
    chrome.runtime.sendMessage({ action: "clearNotification" });
  }
}

async function getCrossOriginBitmap(imageUrl) {
    // 1. Send the URL to the background script
    const response = await chrome.runtime.sendMessage({
        action: "fetchCrossOriginImage",
        url: imageUrl
    });

    if (response.error) {
        throw new Error(response.error);
    }
    
    // 2. Receive the image as a Data URL
    const dataUrl = response.dataUrl;

    // 3. Load the Data URL into a temporary, same-origin image element
    const tempImg = new Image();
    tempImg.src = dataUrl;

    // Wait for the image to load
    await new Promise((resolve, reject) => {
        tempImg.onload = resolve;
        tempImg.onerror = reject;
    });

    // 4. Create the ImageBitmap (now safe to draw to canvas/create bitmap)
    const bitmap = await createImageBitmap(tempImg);
    
    return bitmap;
}

async function extractContent(url) {
  const hostname = new URL(url).hostname;
  if (hostname.includes("twitter.com") || hostname.includes("x.com")) {
    // Extract tweet, thread, quoted tweet, images
    console.debug("Extracting from Twitter/X");

    const imageBitmaps = await Promise.all(
      [...document.querySelectorAll('article div[data-testid="tweetPhoto"] img')]
        .slice(0, 4)
        .map(async (img) => {
          console.debug(img.src)
          return await getCrossOriginBitmap(img.src)
        })
    );

    return {
      text: document.querySelector('article').innerText,
      imageCaptions: [...document.querySelector('article').querySelectorAll('img')].map(x => x.alt).filter(x => x),
      imageBitmaps,
    }
  } else if (hostname.includes("bsky.app")) {
    // Extract post, thread, quoted post, images
    console.debug("Extracting from BlueSky");
    // console.debug([...document.querySelectorAll('[data-testid]')]
    //   .filter(x => x.dataset.testid.startsWith('postThreadItem') && x.clientWidth > 0)[0].innerText)
    const imageBitmaps = await Promise.all(
      [...[...document.querySelectorAll('[data-testid]')].filter(x => x.dataset.testid.startsWith('postThreadItem'))[0].querySelectorAll('img')]
        .filter(img => {
          return !img.src.includes('avatar')
        })
        .map(async (img) => {
          console.debug(img.src)
          return await getCrossOriginBitmap(img.src)
        })
    );

    return {
      text: [...document.querySelectorAll('[data-testid]')].filter(x => x.dataset.testid.startsWith('postThreadItem') && x.clientWidth > 0)[0].innerText,
      imageCaptions: [...[...document.querySelectorAll('[data-testid]')].filter(x => x.dataset.testid.startsWith('postThreadItem') && x.clientWidth > 0)[0].querySelectorAll('img')].map(x => x.alt).filter(x => x),
      imageBitmaps,
    }
  } else if (hostname.includes("instapaper.com")) {
    // Extract article content
    console.debug("Extracting from Instapaper");
    return {
      text: `Make sure you take note of the author and title in particular.
      TITLE AND AUTHOR:
      ${document.querySelector('#titlebar').innerText}
      
      STORY:
      ${document.querySelector('#story').innerText}
      `,
      imageCaptions: [],
    }
  } else {
    console.debug("Extracting generic content");
    return {
      text: document.body.innerText,
      imageCaptions: [...document.querySelectorAll('img')].map(x => x.alt).filter(x => x),
      imageBitmaps: [],
    }
  }
}

async function getAiSummaryAndFileName(content, imageContext, imageBitmaps, suggestedFiles) {
  const params = await LanguageModel.params();
  const session = await LanguageModel.create({
    temperature: 0.2,
    topK: params.defaultTopK,
    expectedInputs: [{
      type:'text', languages: ['en'],
    }, {
      type:'image'
    }],
    expectedOutputs: [{
      type:'text', languages: ['en']
    }]
  })

  const prompt = `
    Based on the following content, provide a short, one-sentence summary and a suitable title name.
    The summary should be a short 1-line summary or key learning with key vocabulary. Say the account name if it makes sense.
    The titleName should be chosen from the suggested list if one fits, otherwise create a new one.
    Highly suggested title names: "${suggestedFiles.join("\", \"")}"

    Content:
    ---
    ${content.substring(0, 2000)}
    ---

    Alt-text for included images:
    ---
    - ${imageContext.join("\n- ")}}
    ---

    ${imageBitmaps.length ? `
    Use the images included in this prompt in your summary
    ` : ''}

    Respond in JSON format with "summary" and "titleName" keys. The titleName should not include an extension.
    Example: {"summary": "A summary of the content.", "titleName": "A Good File Name"}
  `;

  const schema = {
    "type": "object",
    "properties": {
      "summary": { "type": "string", description: 'A useful summary of the content or the key learning. The summary should NEVER use double-quotes. It should be a short one-liner. Do not use "this tweet". Say the account name if it makes sense.' },
      "titleName": { "type": "string", description: 'The title of a file. This should be title case with spaces. Spaces or underscores are important.'}
    }
  }

  console.debug(prompt)
  console.debug(imageBitmaps.length, 'bitmaps')
  const promptContent = [{
    type: 'text',
    value: prompt
  }]
  if (imageBitmaps.length) {
    imageBitmaps.forEach(img => {
      promptContent.push({
        type: 'image',
        value: img,
      })
    })
    console.debug(promptContent)
  }
  const aiResponse = await session.prompt([
    { role: "user", content: promptContent, responseConstraint: schema},
  ]);
  // console.debug('res1', aiResponse)

  try {
    let aiProcessedRes = aiResponse
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim()
    // This regex specifically targets the string value of the "summary" key.
    const summaryValueRegex = /("summary":\s*")(.+?)("(?=\s*,|\s*\}))/s;

    aiProcessedRes = aiProcessedRes.replace(summaryValueRegex, (match, opening, content, closing) => {
        // Inside the captured content (Group 2), we replace all double quotes (")
        // with an escaped double quote (\")
        const fixedContent = content.replace(/[^\\]"/g, '\\"');

        // Reconstruct the valid JSON string for this field
        return opening + fixedContent + closing;
    });
    // console.debug('res2',aiProcessedRes)
    // The AI response might have extra text, so we find the JSON part.
    // const jsonMatch = aiProcessedRes;

    // if (!jsonMatch) throw new Error("AI did not return valid JSON.");
    return JSON.parse(aiProcessedRes);
  } catch (e) {
    console.error("Failed to parse AI response:", aiResponse);
    // Fallback if JSON parsing fails
    return null
  } finally {
    session.destroy();
  }
}

async function clipVerbatim() {
  const url = window.location.href

  const hostname = new URL(url).hostname;
  if (hostname.includes("twitter.com") || hostname.includes("x.com")) {
    const bodyText = document.querySelector('article div[data-testid="tweetText"]').innerText
    await chrome.runtime.sendMessage({ action: "copyToClipboard", text: `* ["${bodyText}"](${url})` })
  } else if (hostname.includes("bsky.app")) {
    const bodyText = [...document.querySelectorAll('[data-testid]')].filter(x => x.dataset.testid.startsWith('postThreadItem') && x.clientWidth > 0)[0].innerText
    await chrome.runtime.sendMessage({ action: "copyToClipboard", text: `* ["${bodyText}"](${url})` })
  }
}

async function clipArticle() {
  let headline; let origin; let authors;
  const url = window.location.href
  if (url.includes('instapaper')) {
    headline = document.querySelector('main h1').innerText
    origin = document.querySelector('a.original')?.innerText?.trim()
    authors = document.querySelector('.author')?.innerText?.trim()
  } else {
    headline = document.querySelector('meta[property="og:title"]')?.content
    origin = document.querySelector('meta[property="og:site_name"]')?.content
    authors = (
      document.querySelector('meta[property="cXenseParse:author"]') ??
      document.querySelector('meta[name="dc.creator"]') ??
      document.querySelector('meta[name="byl"]')
    )?.content
  }

  const message = `* ["${headline}" - ${origin} (${authors})](${url})`
  console.debug(message)
  await chrome.runtime.sendMessage({ action: "copyToClipboard", text: message })
}

async function clipCitation() {
  const url = window.location.href
  let title; let publisher;
  
  if (url.includes('instapaper')) {
    title = document.querySelector('main h1').innerText
    publisher = document.querySelector('a.original')?.innerText?.trim()
  } else {
    title = document.querySelector('meta[property="og:title"]')?.content || document.title
    publisher = document.querySelector('meta[property="og:site_name"]')?.content || new URL(url).hostname
  }

  const citation = `${title}. ${publisher}. ${url}`
  console.debug(citation)
  await chrome.runtime.sendMessage({ action: "copyToClipboard", text: citation })
}
