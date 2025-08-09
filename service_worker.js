// service_worker.js
// Keeps a simple "enabled" flag in sync and provides defaults on install.
const DEFAULT_SETTINGS = {
  enabled: true,
  replacement: "REDACTED",
  words: ["foo", "bar"],
  matchWholeWords: true,
  caseInsensitive: true
}

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.sync.get(null)
  if (!("enabled" in stored)) {
    await chrome.storage.sync.set(DEFAULT_SETTINGS)
  }
})

// Nothing else required here for now; content script reads from storage
