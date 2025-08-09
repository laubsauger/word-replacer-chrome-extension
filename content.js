// content.js
(() => {
  'use strict';
  
  // Wrap everything in try-catch for safety
  try {
  let settings = {
    enabled: true,
    replacementGroups: []
  }

  // Build a combined RegExp from the words list
  const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

  // Cache for text nodes we've already processed
  let processedNodes = new WeakSet()
  
  // Combine all groups into a single regex for better performance
  const buildCombinedRegex = () => {
    try {
      if (!settings.replacementGroups || settings.replacementGroups.length === 0) return null
      
      const groupMappings = []
      const allPatterns = []
      
      for (const group of settings.replacementGroups) {
        if (!group || !group.words || group.words.length === 0) continue
        
        const escapedWords = group.words
          .map(w => w ? w.trim() : '')
          .filter(Boolean)
          .map(escapeRegex)
        
        if (escapedWords.length === 0) continue
        
        // Create a unique pattern for this group
        for (const word of escapedWords) {
          const pattern = group.matchWholeWords ? `\\b${word}\\b` : word
          allPatterns.push(`(${pattern})`)
          groupMappings.push({
            replacement: group.replacement || 'Cocaine',
            caseInsensitive: group.caseInsensitive
          })
        }
      }
      
      if (allPatterns.length === 0) return null
      
      // Limit pattern size to avoid regex complexity issues
      if (allPatterns.length > 500) {
        console.warn('Word Replacer: Too many patterns, limiting to first 500')
        allPatterns.length = 500
        groupMappings.length = 500
      }
      
      // Create a single regex with all patterns
      // Use 'gi' flags for the combined regex, we'll handle case sensitivity per group
      const combinedPattern = allPatterns.join('|')
      return {
        regex: new RegExp(combinedPattern, 'gi'),
        mappings: groupMappings
      }
    } catch (error) {
      console.error('Word Replacer: Failed to build regex', error)
      return null
    }
  }

  let compiledRegex = null

  // Preserve case helper: adapt replacement to match original token case.
  const preserveCase = (from, to) => {
    if (!from) return to
    
    // For short acronyms (2 chars or less like AI, ML), always use configured replacement as-is
    if (from.length <= 2) {
      return to
    }
    
    // ALL CAPS (only for longer words)
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
    
    // Don't mutate in editable fields
    if (node.isContentEditable) return true
    
    // Check if node is inside an input or textarea
    let parent = node.parentNode
    while (parent) {
      if (parent.isContentEditable) return true
      const parentTag = parent.nodeName
      if (parentTag === "INPUT" || parentTag === "TEXTAREA" || parentTag === "SELECT") return true
      parent = parent.parentNode
    }
    
    const tag = node.nodeName
    return tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || 
           tag === "IFRAME" || tag === "INPUT" || tag === "TEXTAREA" || 
           tag === "SELECT" || tag === "OPTION"
  }

  const replaceInTextNode = (textNode) => {
    try {
      if (!compiledRegex || !compiledRegex.regex) return
      
      // Double-check we're not in an editable context
      if (shouldSkipNode(textNode.parentNode)) return
      
      // Skip if already processed and content hasn't changed
      if (processedNodes.has(textNode)) return
      
      const originalText = textNode.nodeValue
      if (!originalText || originalText.length < 2) return // Skip very short text
      
      // Quick check if text might contain any of our patterns
      if (!compiledRegex.regex.test(originalText)) return
      
      // Reset lastIndex for reuse
      compiledRegex.regex.lastIndex = 0
      
      const replaced = originalText.replace(compiledRegex.regex, (match, ...groups) => {
        // Find which group matched
        const groupIndex = groups.findIndex((g, i) => i < compiledRegex.mappings.length && g !== undefined)
        if (groupIndex === -1) return match
        
        const mapping = compiledRegex.mappings[groupIndex]
        if (!mapping) return match
        
        // Check case sensitivity for this specific mapping
        if (!mapping.caseInsensitive) {
          // For case-sensitive matches, verify the exact match
          const pattern = groups[groupIndex]
          if (pattern !== match) return match
        }
        
        return preserveCase(match, mapping.replacement)
      })
      
      if (replaced !== originalText) {
        textNode.nodeValue = replaced
        processedNodes.add(textNode)
      }
    } catch (error) {
      // Silently fail for individual nodes to avoid breaking the entire page
      console.debug('Word Replacer: Node processing error', error)
    }
  }

  // Batch process mutations for better performance
  let pendingMutations = []
  let processingTimeout = null
  
  const processPendingMutations = () => {
    if (pendingMutations.length === 0) return
    
    const nodesToProcess = new Set()
    
    for (const nodes of pendingMutations) {
      for (const node of nodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          nodesToProcess.add(node)
        } else if (node.nodeType === Node.ELEMENT_NODE && !shouldSkipNode(node)) {
          // Use a more efficient tree walker
          const walker = document.createTreeWalker(
            node,
            NodeFilter.SHOW_TEXT,
            {
              acceptNode: (n) => {
                const p = n.parentNode
                if (!p) return NodeFilter.FILTER_REJECT
                if (shouldSkipNode(p)) return NodeFilter.FILTER_REJECT
                return NodeFilter.FILTER_ACCEPT
              }
            }
          )
          
          let textNode
          while ((textNode = walker.nextNode())) {
            nodesToProcess.add(textNode)
          }
        }
      }
    }
    
    // Process all collected text nodes
    for (const node of nodesToProcess) {
      replaceInTextNode(node)
    }
    
    pendingMutations = []
    processingTimeout = null
  }
  
  const walkAndReplace = (root) => {
    if (shouldSkipNode(root)) return
    
    // Collect all text nodes first, then process in batch
    const textNodes = []
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (n) => {
          const p = n.parentNode
          if (!p) return NodeFilter.FILTER_REJECT
          if (shouldSkipNode(p)) return NodeFilter.FILTER_REJECT
          return NodeFilter.FILTER_ACCEPT
        }
      }
    )

    let node
    while ((node = walker.nextNode())) {
      textNodes.push(node)
    }
    
    // Process in batches for better performance
    for (let i = 0; i < textNodes.length; i += 100) {
      const batch = textNodes.slice(i, i + 100)
      batch.forEach(replaceInTextNode)
    }
  }

  // Observe dynamic changes
  let observer = null
  const startObserving = () => {
    if (observer) observer.disconnect()
    
    observer = new MutationObserver((mutations) => {
      if (!settings.enabled || !compiledRegex) return
      
      const nodesToQueue = []
      
      for (const m of mutations) {
        if (m.type === "characterData" && m.target.nodeType === Node.TEXT_NODE) {
          // Remove from processed cache since content changed
          processedNodes.delete(m.target)
          nodesToQueue.push(m.target)
        } else if (m.type === "childList" && m.addedNodes.length > 0) {
          nodesToQueue.push(...m.addedNodes)
        }
      }
      
      if (nodesToQueue.length > 0) {
        pendingMutations.push(nodesToQueue)
        
        // Debounce processing for better performance
        if (processingTimeout) clearTimeout(processingTimeout)
        processingTimeout = setTimeout(processPendingMutations, 10)
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
    if (processingTimeout) {
      clearTimeout(processingTimeout)
      processingTimeout = null
    }
  }

  const applyAll = () => {
    if (!settings.enabled || !compiledRegex) return
    
    // Clear processed cache when doing full apply (recreate WeakSet)
    processedNodes = new WeakSet()
    walkAndReplace(document.documentElement || document.body)
  }

  const rebuild = () => {
    // Clear cache when rebuilding (recreate WeakSet)
    processedNodes = new WeakSet()
    compiledRegex = buildCombinedRegex()
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
          replacement: legacy.replacement || 'Cocaine',
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
    try {
      await loadSettings()
      if (settings.enabled) {
        startObserving()
        // Delay initial application slightly to avoid blocking page load
        if (typeof requestIdleCallback !== 'undefined') {
          requestIdleCallback(() => applyAll(), { timeout: 1000 })
        } else {
          setTimeout(applyAll, 100)
        }
      }
    } catch (error) {
      console.error('Word Replacer Extension: Initialization error:', error)
    }
  })()
  
  } catch (error) {
    console.error('Word Replacer Extension: Critical error:', error)
  }
})()