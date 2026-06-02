chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.target !== 'offscreen') {
    return;
  }

  if (request.action === 'copyToClipboard') {
    copyToClipboard(request.text);
  }
});

async function copyToClipboard(text) {
  try {
    if (typeof text !== 'string') {
      throw new Error(`Expected string, got ${typeof text}`);
    }
    
    // Try using the Clipboard API first
    try {
      await navigator.clipboard.writeText(text);
      console.debug('Successfully copied to clipboard using Clipboard API');
      return;
    } catch (apiErr) {
      console.warn('Clipboard API failed, falling back to execCommand', apiErr);
    }

    // Fallback to execCommand('copy')
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    const result = document.execCommand('copy');
    document.body.removeChild(textarea);
    
    if (!result) {
      throw new Error('execCommand copy returned false');
    }
    console.debug('Successfully copied to clipboard using execCommand');
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
  }
}
