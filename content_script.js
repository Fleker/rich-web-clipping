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
  // 2. Get settings from chrome storage
  const { vaultName, fileNames, aiSource, geminiApiKey } = await chrome.storage.sync.get([
    "vaultName", "fileNames", "aiSource", "geminiApiKey"
  ]);

  if (aiSource === 'local' && !languageModelWorking) {
    return window.alert('Local language model is not available. Please check settings or download the model.')
  }

  if (aiSource === 'gemini' && !geminiApiKey) {
    return window.alert('Gemini API Key is missing. Please add it in the extension options.')
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

    // 3. Use AI for summary and filename
    const aiResult = await getAiSummaryAndFileName(
      pageContent.text,
      pageContent.imageCaptions,
      pageContent.imageDatas || [],
      fileNames || [],
      aiSource || 'local',
      geminiApiKey
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

async function getCrossOriginImageData(imageUrl) {
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
    
    return { bitmap, dataUrl };
}

async function extractContent(url) {
  const hostname = new URL(url).hostname;
  if (hostname.includes("twitter.com") || hostname.includes("x.com")) {
    // Extract tweet, thread, quoted tweet, images
    console.debug("Extracting from Twitter/X");

    const imageDatas = await Promise.all(
      [...document.querySelectorAll('article div[data-testid="tweetPhoto"] img')]
        .slice(0, 4)
        .map(async (img) => {
          console.debug(img.src)
          return await getCrossOriginImageData(img.src)
        })
    );

    return {
      text: document.querySelector('article').innerText,
      imageCaptions: [...document.querySelector('article').querySelectorAll('img')].map(x => x.alt).filter(x => x),
      imageDatas,
    }
  } else if (hostname.includes("bsky.app")) {
    // Extract post, thread, quoted post, images
    console.debug("Extracting from BlueSky");
    // console.debug([...document.querySelectorAll('[data-testid]')]
    //   .filter(x => x.dataset.testid.startsWith('postThreadItem') && x.clientWidth > 0)[0].innerText)
    const imageDatas = await Promise.all(
      [...[...document.querySelectorAll('[data-testid]')].filter(x => x.dataset.testid.startsWith('postThreadItem'))[0].querySelectorAll('img')]
        .filter(img => {
          return !img.src.includes('avatar')
        })
        .map(async (img) => {
          console.debug(img.src)
          return await getCrossOriginImageData(img.src)
        })
    );

    return {
      text: [...document.querySelectorAll('[data-testid]')].filter(x => x.dataset.testid.startsWith('postThreadItem') && x.clientWidth > 0)[0].innerText,
      imageCaptions: [...[...document.querySelectorAll('[data-testid]')].filter(x => x.dataset.testid.startsWith('postThreadItem') && x.clientWidth > 0)[0].querySelectorAll('img')].map(x => x.alt).filter(x => x),
      imageDatas,
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
    const imageDatas = await Promise.all(
      [...document.querySelectorAll('img')]
        .slice(0, 4)
        .map(async (img) => {
          console.debug(img.src)
          try {
            return await getCrossOriginImageData(img.src)
          } catch (e) {
            console.warn('failed to fetch image', img.src)
            return null
          }
        })
    );

    return {
      text: document.body.innerText,
      imageCaptions: [...document.querySelectorAll('img')].map(x => x.alt).filter(x => x),
      imageDatas: imageDatas.filter(x => x),
    }
  }
}

async function getAiSummaryAndFileName(content, imageContext, imageDatas, suggestedFiles, aiSource, geminiApiKey) {
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

  let aiResponse;

  if (aiSource === 'gemini') {
    const parts = [{ text: prompt }];
    
    for (const imgData of imageDatas) {
      if (imgData.dataUrl) {
        const [header, base64Data] = imgData.dataUrl.split(';base64,');
        const mimeType = header.split(':')[1];
        parts.push({
          inline_data: {
            mime_type: mimeType,
            data: base64Data
          }
        });
      }
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-goog-api-key': geminiApiKey
      },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          response_mime_type: "application/json",
          temperature: 0.2
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.statusText}`);
    }

    const data = await response.json();
    aiResponse = data.candidates[0].content.parts[0].text;
  } else {
    // Local Model
    let params = { defaultTopK: 3 };
    try {
      if (typeof LanguageModel.params === 'function') {
        params = await LanguageModel.params();
      }
    } catch (e) {
      console.warn("LanguageModel.params() failed, using defaults", e);
    }

    const session = await LanguageModel.create({
      temperature: 0.2,
      topK: params?.defaultTopK || 3,
      expectedInputs: [{ type: 'text', languages: ['en'] }, { type: 'image' }],
      expectedOutputs: [{ type: 'text', languages: ['en'] }]
    });

    try {
      const promptContent = [{ type: 'text', value: prompt }];
      if (imageDatas.length) {
        imageDatas.forEach(img => {
          if (img.bitmap) {
            promptContent.push({ type: 'image', value: img.bitmap });
          }
        });
      }
      
      aiResponse = await session.prompt([
        { role: "user", content: promptContent, responseConstraint: schema },
      ]);
    } finally {
      session.destroy();
    }
  }

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
