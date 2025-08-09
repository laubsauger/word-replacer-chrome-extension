let groupCounter = 0;

const createGroupElement = (groupData = null, groupId = null) => {
  const id = groupId !== null ? groupId : groupCounter++;
  const groupDiv = document.createElement('div');
  groupDiv.className = 'replacement-group';
  groupDiv.dataset.groupId = id;
  
  groupDiv.innerHTML = `
    <div class="group-header">
      <h3>Replacement Group ${id + 1}</h3>
      <button class="remove-group" title="Remove this group">×</button>
    </div>
    
    <section>
      <label>Replacement word/phrase</label>
      <input class="replacement" type="text" placeholder="e.g. banana" />
    </section>

    <section>
      <label>Words/phrases to replace (one per line)</label>
      <textarea class="words" rows="5" placeholder="foo
bar
lorem ipsum"></textarea>
    </section>

    <section class="row">
      <label class="row">
        <input type="checkbox" class="matchWholeWords" />
        <span>Match whole words only</span>
      </label>
      <label class="row">
        <input type="checkbox" class="caseInsensitive" />
        <span>Case insensitive</span>
      </label>
    </section>
  `;
  
  if (groupData) {
    groupDiv.querySelector('.replacement').value = groupData.replacement || '';
    groupDiv.querySelector('.words').value = Array.isArray(groupData.words) ? groupData.words.join('\n') : '';
    groupDiv.querySelector('.matchWholeWords').checked = groupData.matchWholeWords ?? true;
    groupDiv.querySelector('.caseInsensitive').checked = groupData.caseInsensitive ?? true;
  } else {
    groupDiv.querySelector('.matchWholeWords').checked = true;
    groupDiv.querySelector('.caseInsensitive').checked = true;
  }
  
  groupDiv.querySelector('.remove-group').addEventListener('click', () => {
    if (document.querySelectorAll('.replacement-group').length > 1) {
      groupDiv.remove();
      updateGroupNumbers();
    }
  });
  
  return groupDiv;
};

const updateGroupNumbers = () => {
  const groups = document.querySelectorAll('.replacement-group');
  groups.forEach((group, index) => {
    group.dataset.groupId = index;
    group.querySelector('h3').textContent = `Replacement Group ${index + 1}`;
  });
};

const load = async () => {
  const s = await chrome.storage.sync.get(['enabled', 'replacementGroups']);
  
  document.getElementById('enabled').checked = s.enabled ?? true;
  
  const groupsContainer = document.getElementById('replacementGroups');
  groupsContainer.innerHTML = '';
  
  if (s.replacementGroups && s.replacementGroups.length > 0) {
    s.replacementGroups.forEach((group, index) => {
      groupsContainer.appendChild(createGroupElement(group, index));
    });
    groupCounter = s.replacementGroups.length;
  } else {
    // Check for legacy single replacement data
    const legacy = await chrome.storage.sync.get(['replacement', 'words', 'matchWholeWords', 'caseInsensitive']);
    if (legacy.replacement || (legacy.words && legacy.words.length > 0)) {
      groupsContainer.appendChild(createGroupElement({
        replacement: legacy.replacement || 'REDACTED',
        words: legacy.words || [],
        matchWholeWords: legacy.matchWholeWords ?? true,
        caseInsensitive: legacy.caseInsensitive ?? true
      }, 0));
      groupCounter = 1;
    } else {
      // Create default empty group
      groupsContainer.appendChild(createGroupElement(null, 0));
      groupCounter = 1;
    }
  }
};

const save = async () => {
  const enabled = document.getElementById('enabled').checked;
  const groups = document.querySelectorAll('.replacement-group');
  
  const replacementGroups = Array.from(groups).map(group => {
    const words = group.querySelector('.words').value
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);
    
    return {
      replacement: group.querySelector('.replacement').value || '',
      words,
      matchWholeWords: group.querySelector('.matchWholeWords').checked,
      caseInsensitive: group.querySelector('.caseInsensitive').checked
    };
  });
  
  await chrome.storage.sync.set({
    enabled,
    replacementGroups
  });
  
  // Clear legacy storage keys
  await chrome.storage.sync.remove(['replacement', 'words', 'matchWholeWords', 'caseInsensitive']);
  
  const status = document.getElementById('status');
  status.textContent = 'Saved!';
  setTimeout(() => (status.textContent = ''), 1200);
};

document.addEventListener('DOMContentLoaded', () => {
  load();
  
  document.getElementById('save').addEventListener('click', save);
  
  document.getElementById('addGroup').addEventListener('click', () => {
    const groupsContainer = document.getElementById('replacementGroups');
    const newGroup = createGroupElement();
    groupsContainer.appendChild(newGroup);
    updateGroupNumbers();
  });
});