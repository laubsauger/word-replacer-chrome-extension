// content.js
(() => {
  let settings = {
    enabled: true,
    replacementGroups: []
  }

  // Build a combined RegExp from the words list
  const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

  const buildRegex = (group) => {
    if (!group.words || group.words.length === 0) return null
    const parts = group.words
      .map(w => w.trim())
      .filter(Boolean)
      .map(escapeRegex)

    if (parts.length === 0) return null

    const pattern = parts.join("|")
    const flags = group.caseInsensitive ? "gi" : "g"

    return group.matchWholeWords
      ? new RegExp(`\\b(?:${pattern})\\b`, flags)
      : new RegExp(`(?:${pattern})`, flags)
  }

  let compiledGroups = []

  // Preserve case helper: adapt replacement to match original token case.
  const preserveCase = (from, to) => {
    if (!from) return to
    // ALL CAPS
    if (from.toUpperCase() === from && /[A-Z]/.test(from)) {
      return to.toUpperCase()
    }
    // Capitalized
    if (from[0] && from[0] === from[0].toUpperCase() && from.slice(1) === from.slice(1).toLowerCase()) {
      return to.charAt(0).toUpperCase() + to.slice(1).toLowerCase()
    }
    // lower or mixed -> return as-is (or fully lower if from is all lower)
    if (from.toLowerCase() === from) {
      return to.toLowerCase()
    }
    return to
  }

  const shouldSkipNode = (node) => {
    if (!node) return true
    // Don't mutate in editable fields or these tags
    if (node.isContentEditable) return true
    const tag = node.nodeName
    return tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "IFRAME"
  }

  const replaceInTextNode = (textNode) => {
    if (!compiledGroups || compiledGroups.length === 0) return
    
    let currentText = textNode.nodeValue
    if (!currentText) return
    
    let hasChanges = false
    
    // Apply each replacement group in order
    for (const group of compiledGroups) {
      if (!group.regex) continue
      
      if (group.regex.test(currentText)) {
        // Reset lastIndex because we used test() above with /g
        group.regex.lastIndex = 0
        
        currentText = currentText.replace(group.regex, (match) => {
          hasChanges = true
          return preserveCase(match, group.replacement)
        })
      }
    }
    
    if (hasChanges) {
      textNode.nodeValue = currentText
    }
  }

  const walkAndReplace = (root) => {
    if (shouldSkipNode(root)) return
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (n) => {
          const p = n.parentNode
          if (!p) return NodeFilter.FILTER_REJECT
          if (shouldSkipNode(p)) return NodeFilter.FILTER_REJECT
          // Skip inputs/textareas
          if (p.nodeName === "INPUT" || p.nodeName === "TEXTAREA") return NodeFilter.FILTER_REJECT
          return NodeFilter.FILTER_ACCEPT
        }
      }
    )

    let node
    while ((node = walker.nextNode())) {
      replaceInTextNode(node)
    }
  }

  // Observe dynamic changes
  let observer = null
  const startObserving = () => {
    if (observer) observer.disconnect()
    observer = new MutationObserver((mutations) => {
      if (!settings.enabled || !compiledGroups || compiledGroups.length === 0) return

      for (const m of mutations) {
        if (m.type === "characterData" && m.target.nodeType === Node.TEXT_NODE) {
          replaceInTextNode(m.target)
        } else if (m.type === "childList") {
          m.addedNodes.forEach((n) => {
            if (n.nodeType === Node.TEXT_NODE) {
              replaceInTextNode(n)
            } else if (n.nodeType === Node.ELEMENT_NODE && !shouldSkipNode(n)) {
              walkAndReplace(n)
            }
          })
        }
      }
    })

    observer.observe(document.documentElement || document.body, {
      subtree: true,
      childList: true,
      characterData: true
    })
  }

  const stopObserving = () => {
    if (observer) observer.disconnect()
  }

  const applyAll = () => {
    if (!settings.enabled || !compiledGroups || compiledGroups.length === 0) return
    walkAndReplace(document.documentElement || document.body)
  }

  const rebuild = () => {
    compiledGroups = []
    
    if (settings.replacementGroups && settings.replacementGroups.length > 0) {
      for (const group of settings.replacementGroups) {
        const regex = buildRegex(group)
        if (regex) {
          compiledGroups.push({
            regex,
            replacement: group.replacement || 'REDACTED'
          })
        }
      }
    }
  }

  const loadSettings = async () => {
    const s = await chrome.storage.sync.get(['enabled', 'replacementGroups'])
    
    // Handle new format
    if (s.replacementGroups !== undefined) {
      settings = {
        enabled: s.enabled ?? true,
        replacementGroups: s.replacementGroups || []
      }
    } else {
      // Handle legacy format
      const legacy = await chrome.storage.sync.get([
        "enabled",
        "replacement",
        "words",
        "matchWholeWords",
        "caseInsensitive"
      ])
      
      settings = {
        enabled: legacy.enabled ?? true,
        replacementGroups: []
      }
      
      // Convert legacy settings to new format
      if (legacy.words && legacy.words.length > 0) {
        settings.replacementGroups = [{
          replacement: legacy.replacement || 'REDACTED',
          words: legacy.words,
          matchWholeWords: legacy.matchWholeWords ?? true,
          caseInsensitive: legacy.caseInsensitive ?? true
        }]
      }
    }
    
    rebuild()
  }

  // Respond to storage changes live
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== "sync") return
    let needRebuild = false
    let needReapply = false

    if ("enabled" in changes) {
      settings.enabled = changes.enabled.newValue
      if (!settings.enabled) stopObserving()
      else startObserving()
      needReapply = true
    }
    
    if ("replacementGroups" in changes) {
      settings.replacementGroups = changes.replacementGroups.newValue || []
      needRebuild = true
      needReapply = true
    }
    
    // Handle legacy format changes (for backward compatibility)
    if ("replacement" in changes || "words" in changes || 
        "matchWholeWords" in changes || "caseInsensitive" in changes) {
      // Reload settings to handle legacy format
      await loadSettings()
      needRebuild = true
      needReapply = true
    }

    if (needRebuild) rebuild()
    if (needReapply && settings.enabled) applyAll()
  });

  // Init
  (async () => {
    await loadSettings()
    if (settings.enabled) {
      startObserving()
      applyAll()
    }
  })()
})()