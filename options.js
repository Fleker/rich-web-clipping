function saveOptions() {
  const vaultName = document.getElementById('vault').value;
  const fileNamesText = document.getElementById('filenames').value;
  const fileNames = fileNamesText.split('\n').filter(name => name.trim() !== '');
  const aiSource = document.querySelector('input[name="aiSource"]:checked').value;
  const geminiApiKey = document.getElementById('geminiApiKey').value;

  chrome.storage.sync.set(
    { 
      vaultName: vaultName, 
      fileNames: fileNames,
      aiSource: aiSource,
      geminiApiKey: geminiApiKey
    },
    () => {
      const status = document.getElementById('status');
      status.textContent = 'Options saved.';
      setTimeout(() => {
        status.textContent = '';
      }, 1500);
    }
  );
}

function restoreOptions() {
  chrome.storage.sync.get(
    { 
      vaultName: '', 
      fileNames: [],
      aiSource: 'local',
      geminiApiKey: ''
    },
    (items) => {
      document.getElementById('vault').value = items.vaultName;
      document.getElementById('filenames').value = items.fileNames.join('\n');
      document.getElementById('geminiApiKey').value = items.geminiApiKey;
      
      if (items.aiSource === 'gemini') {
        document.getElementById('source-gemini').checked = true;
        document.getElementById('gemini-api-key-container').style.display = 'block';
      } else {
        document.getElementById('source-local').checked = true;
        document.getElementById('gemini-api-key-container').style.display = 'none';
      }
    }
  );
}

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save').addEventListener('click', saveOptions);

document.querySelectorAll('input[name="aiSource"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    if (e.target.value === 'gemini') {
      document.getElementById('gemini-api-key-container').style.display = 'block';
    } else {
      document.getElementById('gemini-api-key-container').style.display = 'none';
    }
  });
});

LanguageModel.availability()
  .then((isAvailable) => {
    document.getElementById('dl-stat').innerText = isAvailable
    if (isAvailable === 'downloadable') {
      document.getElementById('dl-btn').style.display = 'block'
      document.getElementById('dl-btn').disabled = false
    } else {
      document.getElementById('dl-btn').style.display = 'none'
    }
  })

document.getElementById('dl-btn').onclick = modeldl

function modeldl() {
  document.getElementById('dl-progress').innerText = 'Downloading model...'
  LanguageModel.create({
    monitor(m) {
      m.addEventListener('downloadprogress', (e) => {
        document.getElementById('dl-progress').innerText = `Downloaded ${e.loaded * 100}%`;
      });
    },
  });
}
