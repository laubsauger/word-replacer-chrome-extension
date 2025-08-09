document.addEventListener("DOMContentLoaded", async () => {
  const enabledEl = document.getElementById("enabled")
  const openBtn = document.getElementById("openOptions")

  const s = await chrome.storage.sync.get(["enabled"])
  enabledEl.checked = s.enabled ?? true

  enabledEl.addEventListener("change", async () => {
    await chrome.storage.sync.set({ enabled: enabledEl.checked })
  })

  openBtn.addEventListener("click", () => {
    chrome.runtime.openOptionsPage()
  })
})
