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