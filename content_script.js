chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "clipContent") {
    main();
    sendResponse({ status: "started" });
  }
  return true; // Indicates that the response is sent asynchronously
});

let languageModelWorking = false

// check web clip status
LanguageModel.availability()
  .then((isAvailable) => {
    if (isAvailable !== 'available') {
      window.alert(`Language model status is ${isAvailable}`)
    }
    languageModelWorking = true;
  })

async function main() {
  if (!languageModelWorking) {
    return window.alert('Language model is not available')
  }
  // unawaited
  chrome.runtime.sendMessage({ action: "showNotification" });

  try {
    // 1. Extract content from the page
    const pageContent = extractContent(window.location.href);
    if (!pageContent) {
      console.debug("No content to clip on this page.");
      await chrome.runtime.sendMessage({ action: "clearNotification" });
      return;
    }

    // 2. Get settings from chrome storage
    const { vaultName, fileNames } = await chrome.storage.sync.get(["vaultName", "fileNames"]);

    // 3. Use on-device AI for summary and filename
    const aiResult = await getAiSummaryAndFileName(pageContent.text, pageContent.images, fileNames || []);
    // unawaited
    chrome.runtime.sendMessage({ action: "clearNotification" });

    if (aiResult === null) {
      return window.alert('Oops the AI result was bad')
    }

    // 4. Format the content for the clipboard
    const markdownContent = `* [${aiResult.summary}](${window.location.href})`;

    // 6. Show confirmation dialog
    const confirmationMessage = `File: ${aiResult.titleName}\n\nContent:\n${markdownContent}\n\nPress OK to Open Obsidian`;
    const shouldOpenObsidian = window.confirm(confirmationMessage)
    await navigator.clipboard.writeText(markdownContent)
    // unawaited
    chrome.runtime.sendMessage({ action: "clearNotification" });

    if (shouldOpenObsidian) {
      // 7. Open Obsidian URI
      const obsidianUri = `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(aiResult.titleName)}.md`;
      window.location.href = obsidianUri;
    }
  } catch (error) {
    console.error("Web Clipper Error:", error);
    alert("An error occurred while clipping the content.");
    // unawaited
    chrome.runtime.sendMessage({ action: "clearNotification" });
  }
}

function extractContent(url) {
  const hostname = new URL(url).hostname;
  // TODO: Implement content extraction logic for each service
  if (hostname.includes("twitter.com") || hostname.includes("x.com")) {
    // Extract tweet, thread, quoted tweet, images
    console.debug("Extracting from Twitter/X");

    return {
      text: document.querySelector('article').innerText,
      images: [...document.querySelector('article').querySelectorAll('img')].map(x => x.alt).filter(x => x)
    }
  } else if (hostname.includes("bsky.app")) {
    // Extract post, thread, quoted post, images
    console.debug("Extracting from BlueSky");
    return {
      text: [...document.querySelectorAll('[data-testid]')].filter(x => x.dataset.testid.startsWith('postThreadItem'))[0].innerText,
      images: [...[...document.querySelectorAll('[data-testid]')].filter(x => x.dataset.testid.startsWith('postThreadItem'))[0].querySelectorAll('img')].map(x => x.alt),
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
      images: [],
    }
  }
  return null;
}

async function getAiSummaryAndFileName(content, imageContext, suggestedFiles) {
  const params = await LanguageModel.params();
  const session = await LanguageModel.create({
    temperature: 0.2,
    topK: params.defaultTopK,
    expectedInputs: [{
      type:'text', languages: ['en']
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
  const aiResponse = await session.prompt([
    { role: "user", content: prompt, responseConstraint: schema},
  ]);
  console.debug('res1', aiResponse)

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
    console.debug('res2',aiProcessedRes)
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