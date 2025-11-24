function saveOptions() {
  const vaultName = document.getElementById('vault').value;
  const fileNamesText = document.getElementById('filenames').value;
  const fileNames = fileNamesText.split('\n').filter(name => name.trim() !== '');

  chrome.storage.sync.set(
    { vaultName: vaultName, fileNames: fileNames },
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
    { vaultName: '', fileNames: [] },
    (items) => {
      document.getElementById('vault').value = items.vaultName;
      document.getElementById('filenames').value = items.fileNames.join('\n');
    }
  );
}

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save').addEventListener('click', saveOptions);

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
