// Style Extractor: Incremental Update
// Supports incremental extraction, only updating changed parts
//
// This module:
// 1. Computes content hashes for comparison
// 2. Tracks changes between extractions
// 3. Generates diff reports
// 4. Supports partial re-extraction
//
// Usage in evaluate_script:
//   window.__seIncremental.computeHash(data)
//   window.__seIncremental.compare(previous, current)
//   window.__seIncremental.getChanges(previous, current)
//   window.__seIncremental.saveSnapshot()
//   window.__seIncremental.loadSnapshot()

(() => {
  if (window.__seIncremental?.installed) return;

  // Debug mode
  const debug = (...args) => {
    if (window.__seDebug) console.log('[style-extractor:incremental]', ...args);
  };

  // Storage key prefix
  const STORAGE_PREFIX = '__seSnapshot_';

  // ============================================
  // Hashing
  // ============================================

  /**
   * Simple hash function for strings
   */
  function hashString(str) {
    let hash = 0;
    if (!str || str.length === 0) return hash.toString(16);

    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }

    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  /**
   * Compute hash for any data structure
   */
  function computeHash(data) {
    if (data === null || data === undefined) return 'null';
    if (typeof data === 'string') return hashString(data);
    if (typeof data === 'number') return hashString(data.toString());
    if (typeof data === 'boolean') return data ? 'true' : 'false';

    if (Array.isArray(data)) {
      return hashString(data.map(computeHash).join(','));
    }

    if (typeof data === 'object') {
      const keys = Object.keys(data).sort();
      const parts = keys.map(k => `${k}:${computeHash(data[k])}`);
      return hashString(parts.join('|'));
    }

    return hashString(String(data));
  }

  /**
   * Compute hashes for all sections of extraction data
   */
  function computeSectionHashes(data) {
    const hashes = {
      overall: null,
      sections: {}
    };

    const sections = [
      'colors', 'typography', 'spacing', 'borders', 'shadows',
      'motion', 'components', 'structure', 'breakpoints', 'variables'
    ];

    for (const section of sections) {
      if (data[section]) {
        hashes.sections[section] = computeHash(data[section]);
      }
    }

    // Also hash nested data
    if (data.stylekit?.normalized?.tokens) {
      hashes.sections.stylekitTokens = computeHash(data.stylekit.normalized.tokens);
    }
    if (data.css?.variables) {
      hashes.sections.cssVariables = computeHash(data.css.variables);
    }

    // Overall hash
    hashes.overall = computeHash(hashes.sections);

    return hashes;
  }

  // ============================================
  // Comparison
  // ============================================

  /**
   * Deep compare two values
   */
  function deepEqual(a, b) {
    if (a === b) return true;
    if (a === null || b === null) return false;
    if (typeof a !== typeof b) return false;

    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((val, i) => deepEqual(val, b[i]));
    }

    if (typeof a === 'object') {
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      if (keysA.length !== keysB.length) return false;
      return keysA.every(key => deepEqual(a[key], b[key]));
    }

    return false;
  }

  /**
   * Compare two extraction results
   */
  function compare(previous, current) {
    const prevHashes = computeSectionHashes(previous);
    const currHashes = computeSectionHashes(current);

    const result = {
      hasChanges: prevHashes.overall !== currHashes.overall,
      changedSections: [],
      unchangedSections: [],
      addedSections: [],
      removedSections: []
    };

    const allSections = new Set([
      ...Object.keys(prevHashes.sections),
      ...Object.keys(currHashes.sections)
    ]);

    for (const section of allSections) {
      const prevHash = prevHashes.sections[section];
      const currHash = currHashes.sections[section];

      if (!prevHash && currHash) {
        result.addedSections.push(section);
      } else if (prevHash && !currHash) {
        result.removedSections.push(section);
      } else if (prevHash !== currHash) {
        result.changedSections.push(section);
      } else {
        result.unchangedSections.push(section);
      }
    }

    return result;
  }

  // ============================================
  // Change Detection
  // ============================================

  /**
   * Get detailed changes between two extractions
   */
  function getChanges(previous, current) {
    const changes = {
      colors: getObjectChanges(previous.colors, current.colors),
      typography: getObjectChanges(previous.typography, current.typography),
      spacing: getObjectChanges(previous.spacing, current.spacing),
      components: getComponentChanges(previous.components, current.components),
      variables: getVariableChanges(previous, current),
      breakpoints: getArrayChanges(
        previous.structure?.breakpoints?.breakpoints,
        current.structure?.breakpoints?.breakpoints,
        'px'
      )
    };

    // Summary
    changes.summary = {
      totalAdded: 0,
      totalRemoved: 0,
      totalModified: 0
    };

    for (const section of Object.values(changes)) {
      if (section?.added) changes.summary.totalAdded += section.added.length;
      if (section?.removed) changes.summary.totalRemoved += section.removed.length;
      if (section?.modified) changes.summary.totalModified += section.modified.length;
    }

    changes.hasChanges = changes.summary.totalAdded > 0 ||
                         changes.summary.totalRemoved > 0 ||
                         changes.summary.totalModified > 0;

    return changes;
  }

  function getObjectChanges(prev, curr) {
    if (!prev && !curr) return null;

    const changes = {
      added: [],
      removed: [],
      modified: []
    };

    const prevKeys = prev ? Object.keys(prev) : [];
    const currKeys = curr ? Object.keys(curr) : [];
    const allKeys = new Set([...prevKeys, ...currKeys]);

    for (const key of allKeys) {
      const prevVal = prev?.[key];
      const currVal = curr?.[key];

      if (prevVal === undefined && currVal !== undefined) {
        changes.added.push({ key, value: currVal });
      } else if (prevVal !== undefined && currVal === undefined) {
        changes.removed.push({ key, value: prevVal });
      } else if (!deepEqual(prevVal, currVal)) {
        changes.modified.push({ key, from: prevVal, to: currVal });
      }
    }

    return changes;
  }

  function getComponentChanges(prev, curr) {
    const prevComps = prev?.components || {};
    const currComps = curr?.components || {};

    return getObjectChanges(
      Object.fromEntries(Object.entries(prevComps).map(([k, v]) => [k, v.length])),
      Object.fromEntries(Object.entries(currComps).map(([k, v]) => [k, v.length]))
    );
  }

  function getVariableChanges(prev, curr) {
    const prevVars = prev?.css?.variables?.root || {};
    const currVars = curr?.css?.variables?.root || {};
    return getObjectChanges(prevVars, currVars);
  }

  function getArrayChanges(prev, curr, keyProp) {
    if (!prev && !curr) return null;

    const prevMap = new Map((prev || []).map(item => [item[keyProp], item]));
    const currMap = new Map((curr || []).map(item => [item[keyProp], item]));

    const changes = {
      added: [],
      removed: [],
      modified: []
    };

    for (const [key, item] of currMap) {
      if (!prevMap.has(key)) {
        changes.added.push(item);
      } else if (!deepEqual(prevMap.get(key), item)) {
        changes.modified.push({ key, from: prevMap.get(key), to: item });
      }
    }

    for (const [key, item] of prevMap) {
      if (!currMap.has(key)) {
        changes.removed.push(item);
      }
    }

    return changes;
  }

  // ============================================
  // Snapshot Management
  // ============================================

  /**
   * Save extraction snapshot to localStorage
   */
  function saveSnapshot(data, name) {
    const snapshotName = name || new URL(location.href).hostname;
    const key = STORAGE_PREFIX + snapshotName;

    const snapshot = {
      url: location.href,
      savedAt: Date.now(),
      hashes: computeSectionHashes(data),
      data: data
    };

    try {
      // Check size before saving
      const json = JSON.stringify(snapshot);
      if (json.length > 4 * 1024 * 1024) { // 4MB limit
        // Save without full data, just hashes
        const lightSnapshot = {
          url: snapshot.url,
          savedAt: snapshot.savedAt,
          hashes: snapshot.hashes,
          dataOmitted: true
        };
        localStorage.setItem(key, JSON.stringify(lightSnapshot));
        return { success: true, name: snapshotName, size: json.length, dataOmitted: true };
      }

      localStorage.setItem(key, json);
      return { success: true, name: snapshotName, size: json.length };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Load extraction snapshot from localStorage
   */
  function loadSnapshot(name) {
    const snapshotName = name || new URL(location.href).hostname;
    const key = STORAGE_PREFIX + snapshotName;

    try {
      const json = localStorage.getItem(key);
      if (!json) {
        return { success: false, error: 'Snapshot not found' };
      }

      const snapshot = JSON.parse(json);
      return { success: true, snapshot };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * List all saved snapshots
   */
  function listSnapshots() {
    const snapshots = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(STORAGE_PREFIX)) {
        try {
          const json = localStorage.getItem(key);
          const snapshot = JSON.parse(json);
          snapshots.push({
            name: key.replace(STORAGE_PREFIX, ''),
            url: snapshot.url,
            savedAt: snapshot.savedAt,
            hasData: !snapshot.dataOmitted
          });
        } catch (e) {
          // Invalid snapshot
        }
      }
    }

    return snapshots.sort((a, b) => b.savedAt - a.savedAt);
  }

  /**
   * Delete a snapshot
   */
  function deleteSnapshot(name) {
    const key = STORAGE_PREFIX + name;
    localStorage.removeItem(key);
    return { success: true, deleted: name };
  }

  // ============================================
  // Incremental Extraction
  // ============================================

  /**
   * Perform incremental extraction, only re-extracting changed sections
   */
  function extractIncremental(previousSnapshot) {
    const current = {
      url: location.href,
      extractedAt: Date.now()
    };

    // Always extract these (fast)
    if (window.__seCSS?.installed) {
      current.css = window.__seCSS.analyze();
    }

    // Compare with previous
    const comparison = previousSnapshot?.hashes
      ? compare(previousSnapshot.data || {}, current)
      : { hasChanges: true, changedSections: ['all'] };

    // If CSS variables changed, re-extract styles
    if (comparison.changedSections.includes('cssVariables') ||
        comparison.changedSections.includes('all')) {
      if (window.__seStyleKit?.installed) {
        current.stylekit = window.__seStyleKit.extract();
      }
    } else {
      current.stylekit = previousSnapshot?.data?.stylekit;
    }

    // Structure rarely changes, skip if hash matches
    if (comparison.changedSections.includes('structure') ||
        comparison.changedSections.includes('all') ||
        !previousSnapshot?.data?.structure) {
      if (window.__seStructure?.installed) {
        current.structure = window.__seStructure.extract();
      }
    } else {
      current.structure = previousSnapshot.data.structure;
    }

    // Components may change with content
    if (window.__seComponents?.installed) {
      current.components = window.__seComponents.generateReport();
    }

    // Compute new hashes
    current.hashes = computeSectionHashes(current);

    // Generate change report
    const changes = previousSnapshot?.data
      ? getChanges(previousSnapshot.data, current)
      : null;

    return {
      data: current,
      comparison,
      changes,
      isIncremental: !!previousSnapshot,
      sectionsUpdated: comparison.changedSections,
      sectionsReused: comparison.unchangedSections
    };
  }

  // ============================================
  // Diff Report Generation
  // ============================================

  /**
   * Generate human-readable diff report
   */
  function generateDiffReport(changes) {
    const lines = [];

    lines.push('# Style Extraction Diff Report');
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push('');

    if (!changes.hasChanges) {
      lines.push('No changes detected.');
      return lines.join('\n');
    }

    lines.push(`## Summary`);
    lines.push(`- Added: ${changes.summary.totalAdded}`);
    lines.push(`- Removed: ${changes.summary.totalRemoved}`);
    lines.push(`- Modified: ${changes.summary.totalModified}`);
    lines.push('');

    // Colors
    if (changes.colors?.added?.length || changes.colors?.removed?.length || changes.colors?.modified?.length) {
      lines.push('## Colors');
      if (changes.colors.added?.length) {
        lines.push('### Added');
        for (const item of changes.colors.added) {
          lines.push(`- \`${item.key}\`: ${item.value}`);
        }
      }
      if (changes.colors.removed?.length) {
        lines.push('### Removed');
        for (const item of changes.colors.removed) {
          lines.push(`- \`${item.key}\`: ${item.value}`);
        }
      }
      if (changes.colors.modified?.length) {
        lines.push('### Modified');
        for (const item of changes.colors.modified) {
          lines.push(`- \`${item.key}\`: ${item.from} -> ${item.to}`);
        }
      }
      lines.push('');
    }

    // Variables
    if (changes.variables?.added?.length || changes.variables?.removed?.length || changes.variables?.modified?.length) {
      lines.push('## CSS Variables');
      if (changes.variables.added?.length) {
        lines.push('### Added');
        for (const item of changes.variables.added.slice(0, 20)) {
          lines.push(`- \`${item.key}\`: ${item.value}`);
        }
        if (changes.variables.added.length > 20) {
          lines.push(`- ... and ${changes.variables.added.length - 20} more`);
        }
      }
      if (changes.variables.removed?.length) {
        lines.push('### Removed');
        for (const item of changes.variables.removed.slice(0, 20)) {
          lines.push(`- \`${item.key}\``);
        }
      }
      if (changes.variables.modified?.length) {
        lines.push('### Modified');
        for (const item of changes.variables.modified.slice(0, 20)) {
          lines.push(`- \`${item.key}\`: ${item.from} -> ${item.to}`);
        }
      }
      lines.push('');
    }

    // Breakpoints
    if (changes.breakpoints?.added?.length || changes.breakpoints?.removed?.length) {
      lines.push('## Breakpoints');
      if (changes.breakpoints.added?.length) {
        lines.push('### Added');
        for (const bp of changes.breakpoints.added) {
          lines.push(`- ${bp.value} (${bp.px}px)`);
        }
      }
      if (changes.breakpoints.removed?.length) {
        lines.push('### Removed');
        for (const bp of changes.breakpoints.removed) {
          lines.push(`- ${bp.value} (${bp.px}px)`);
        }
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  // ============================================
  // Export
  // ============================================

  window.__seIncremental = {
    installed: true,

    // Hashing
    computeHash,
    computeSectionHashes,

    // Comparison
    compare,
    deepEqual,

    // Change detection
    getChanges,

    // Snapshots
    saveSnapshot,
    loadSnapshot,
    listSnapshots,
    deleteSnapshot,

    // Incremental extraction
    extractIncremental,

    // Reporting
    generateDiffReport
  };
})();
