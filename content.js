// content.js
(() => {
  let settings = {
    enabled: true,
    replacement: "",
    words: [],
    matchWholeWords: true,
    caseInsensitive: true
  }

  // Build a combined RegExp from the words list
  const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

  const buildRegex = () => {
    if (!settings.words || settings.words.length === 0) return null
    const parts = settings.words
      .map(w => w.trim())
      .filter(Boolean)
      .map(escapeRegex)

    if (parts.length === 0) return null

    const group = parts.join("|")
    const flags = settings.caseInsensitive ? "gi" : "g"

    // Whole word means wrap with \b where sensible.
    // For phrases with spaces/punctuation, \b might be too strict—so we only add \b
    // when the part looks like a single alphanumeric "word".
    // To keep it simple across the union, we allow either strict or loose:
    return settings.matchWholeWords
      ? new RegExp(`\\b(?:${group})\\b`, flags)
      : new RegExp(`(?:${group})`, flags)
  }

  let compiled = null

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
    // Don’t mutate in editable fields or these tags
    if (node.isContentEditable) return true
    const tag = node.nodeName
    return tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "IFRAME"
  }

  const replaceInTextNode = (textNode) => {
    if (!compiled) return
    const originalText = textNode.nodeValue
    if (!originalText || !compiled.test(originalText)) return

    // Reset lastIndex because we used test() above with /g
    compiled.lastIndex = 0

    const replaced = originalText.replace(compiled, (match) => {
      return preserveCase(match, settings.replacement)
    })

    if (replaced !== originalText) {
      textNode.nodeValue = replaced
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
      if (!settings.enabled || !compiled) return

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
    if (!settings.enabled || !compiled) return
    walkAndReplace(document.documentElement || document.body)
  }

  const rebuild = () => {
    compiled = buildRegex()
  }

  const loadSettings = async () => {
    const s = await chrome.storage.sync.get([
      "enabled",
      "replacement",
      "words",
      "matchWholeWords",
      "caseInsensitive"
    ])
    settings = {
      enabled: s.enabled ?? true,
      replacement: s.replacement ?? "REDACTED",
      words: Array.isArray(s.words) ? s.words : [],
      matchWholeWords: s.matchWholeWords ?? true,
      caseInsensitive: s.caseInsensitive ?? true
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
    if ("replacement" in changes) {
      settings.replacement = changes.replacement.newValue
      needReapply = true
    }
    if ("words" in changes) {
      settings.words = changes.words.newValue || []
      needRebuild = true
      needReapply = true
    }
    if ("matchWholeWords" in changes) {
      settings.matchWholeWords = changes.matchWholeWords.newValue
      needRebuild = true
      needReapply = true
    }
    if ("caseInsensitive" in changes) {
      settings.caseInsensitive = changes.caseInsensitive.newValue
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
