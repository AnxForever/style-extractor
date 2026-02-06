// Style Extractor: State Capture Module
// MCP-driven pseudo-class state capture for accurate hover/focus/active styles
//
// This module provides:
// 1. MCP command generation for triggering real interaction states
// 2. Style extraction after state triggers
// 3. State diff calculation
// 4. Batch state capture for multiple elements
//
// Usage:
//   window.__seStateCapture.generateMCPCommands(selector)
//   window.__seStateCapture.captureCurrentState(selector)
//   window.__seStateCapture.diffStates(before, after)
//   window.__seStateCapture.batchCapture(selectors)

(() => {
  if (window.__seStateCapture?.installed) return;

  const debug = (...args) => {
    if (window.__seDebug) console.log('[style-extractor:state-capture]', ...args);
  };

  // ============================================
  // Style Properties to Track for State Changes
  // ============================================

  const STATE_PROPERTIES = [
    // Colors (most common state changes)
    'backgroundColor', 'backgroundImage', 'backgroundSize', 'backgroundPosition', 'backgroundRepeat',
    'color', 'borderColor', 'outlineColor',
    'boxShadow', 'textShadow',

    // Transforms & Effects
    'transform', 'opacity', 'filter', 'backdropFilter',

    // Borders
    'borderWidth', 'borderStyle', 'borderRadius',
    'outline', 'outlineWidth', 'outlineStyle', 'outlineOffset',

    // Sizing (for scale effects)
    'width', 'height', 'padding', 'margin',

    // Typography
    'fontWeight', 'textDecoration', 'textDecorationColor',

    // Cursor
    'cursor',

    // Transitions (to understand timing)
      'transition', 'transitionProperty', 'transitionDuration',
      'transitionTimingFunction', 'transitionDelay'
  ];

  // Subtree capture is intentionally narrower than STATE_PROPERTIES to reduce noise.
  // It focuses on the kinds of changes that usually happen on hover/focus (color, shadow, transform, etc.).
  const SUBTREE_PROPERTIES = [
    'content', // pseudo-elements appearing/disappearing
    'backgroundColor', 'backgroundImage', 'backgroundSize', 'backgroundPosition', 'backgroundRepeat',
    'color', 'borderColor', 'outlineColor',
    'boxShadow', 'textShadow',
    'transform', 'opacity', 'filter', 'backdropFilter',
    'outline', 'outlineWidth', 'outlineStyle', 'outlineOffset',
    'fontWeight', 'textDecoration', 'textDecorationColor',
    // SVG/icon affordances
    'fill', 'stroke'
  ];

  // ============================================
  // Helper Functions
  // ============================================

  function cssPath(el) {
    if (!el || el.nodeType !== 1) return null;
    if (el.id) return `#${CSS.escape(el.id)}`;
    const parts = [];
    let cur = el;
    let depth = 0;
    while (cur && cur.nodeType === 1 && depth < 5) {
      let part = cur.tagName.toLowerCase();
      if (cur.classList?.length) {
        part += Array.from(cur.classList).slice(0, 2).map(c => `.${CSS.escape(c)}`).join('');
      }
      const parent = cur.parentElement;
      if (parent) {
        const same = Array.from(parent.children).filter(c => c.tagName === cur.tagName);
        if (same.length > 1) part += `:nth-of-type(${same.indexOf(cur) + 1})`;
      }
      parts.unshift(part);
      if (parent?.id) {
        parts.unshift(`#${CSS.escape(parent.id)}`);
        break;
      }
      cur = parent;
      depth++;
    }
    return parts.join(' > ');
  }

  function getRect(el) {
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.x),
      y: Math.round(r.y),
      width: Math.round(r.width),
      height: Math.round(r.height),
      centerX: Math.round(r.x + r.width / 2),
      centerY: Math.round(r.y + r.height / 2)
    };
  }

  function extractStyles(el, properties = STATE_PROPERTIES) {
    const s = getComputedStyle(el);
    const result = {};
    for (const prop of properties) {
      const value = s[prop];
      if (value && value !== 'none' && value !== 'normal' && value !== 'auto') {
        result[prop] = value;
      }
    }
    return result;
  }

  function extractStylesFromComputedStyle(style, properties) {
    if (!style) return {};
    const result = {};
    for (const prop of properties) {
      const value = style[prop];
      if (value && value !== 'none' && value !== 'normal' && value !== 'auto') {
        result[prop] = value;
      }
    }
    return result;
  }

  function isVisible(el) {
    if (!el || el.nodeType !== 1) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') return false;
    if (parseFloat(s.opacity || '1') <= 0) return false;
    return true;
  }

  function scoreSubtreeCandidate(el) {
    if (!el || el.nodeType !== 1) return 0;
    const tag = el.tagName.toLowerCase();
    let score = 0;

    if (tag === 'svg') score += 30;
    if (['path', 'circle', 'rect', 'line', 'polyline', 'polygon'].includes(tag)) score += 18;
    if (tag === 'img') score += 16;
    if (tag === 'button' || tag === 'a') score += 18;
    if (['input', 'select', 'textarea'].includes(tag)) score += 14;
    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'strong', 'em', 'i'].includes(tag)) score += 8;

    if (el.hasAttribute('role') || el.hasAttribute('aria-label')) score += 12;

    const text = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
    if (text) score += Math.min(16, Math.ceil(text.length / 12));

    const rect = el.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area >= 6000) score += 10;
    else if (area >= 2000) score += 6;
    else if (area >= 500) score += 3;

    return score;
  }

  function captureSubtreeStyleMap(rootEl, options = {}) {
    const includePseudo = options.includePseudo !== false;
    const maxNodes = Number.isFinite(options.maxSubtreeNodes) ? options.maxSubtreeNodes : 6;
    const result = {};

    if (includePseudo) {
      try {
        const before = extractStylesFromComputedStyle(getComputedStyle(rootEl, '::before'), SUBTREE_PROPERTIES);
        for (const [prop, value] of Object.entries(before)) {
          result[`::before.${prop}`] = value;
        }
      } catch {
        // ignore
      }
      try {
        const after = extractStylesFromComputedStyle(getComputedStyle(rootEl, '::after'), SUBTREE_PROPERTIES);
        for (const [prop, value] of Object.entries(after)) {
          result[`::after.${prop}`] = value;
        }
      } catch {
        // ignore
      }
    }

    let candidates = [];
    try {
      candidates = Array.from(rootEl.querySelectorAll('*'));
    } catch {
      candidates = [];
    }

    const ranked = [];
    for (const el of candidates) {
      if (!isVisible(el)) continue;
      const score = scoreSubtreeCandidate(el);
      if (score <= 0) continue;
      ranked.push({ el, score });
    }

    ranked.sort((a, b) => b.score - a.score);
    const picked = ranked.slice(0, Math.max(0, maxNodes)).map((r) => r.el);

    for (const el of picked) {
      const keyBase = cssPath(el);
      if (!keyBase) continue;
      const styles = extractStyles(el, SUBTREE_PROPERTIES);
      for (const [prop, value] of Object.entries(styles)) {
        result[`desc:${keyBase}.${prop}`] = value;
      }
    }

    return result;
  }

  // ============================================
  // Element UID Generation for MCP
  // ============================================

  /**
   * Generate a unique identifier for an element that can be used with MCP tools.
   * MCP tools like chrome-devtools use UIDs from accessibility snapshots.
   * This function provides a fallback selector-based approach.
   */
  function getElementIdentifier(el) {
    const selector = cssPath(el);
    const rect = getRect(el);
    const tag = el.tagName.toLowerCase();
    const text = (el.innerText || el.textContent || '').trim().slice(0, 50);

    return {
      selector,
      rect,
      tag,
      text,
      // Attributes that help identify in snapshot
      id: el.id || null,
      classes: el.classList?.length ? Array.from(el.classList).slice(0, 3) : null,
      role: el.getAttribute('role') || null,
      ariaLabel: el.getAttribute('aria-label') || null,
      // For form elements
      type: el.type || null,
      name: el.name || null,
      placeholder: el.placeholder || null
    };
  }

  // ============================================
  // MCP Command Generation
  // ============================================

  /**
   * Generate MCP commands to capture all states for an element.
   * These commands should be executed by the AI agent using chrome-devtools MCP.
   *
   * @param {string|Element} selector - CSS selector or element
   * @returns {Object} MCP command sequence with instructions
   */
  function generateMCPCommands(selector) {
    const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!el) return { ok: false, error: 'Element not found' };

    const identifier = getElementIdentifier(el);
    const isInteractive = isInteractiveElement(el);
    const isFocusable = isFocusableElement(el);

    const commands = {
      element: identifier,
      isInteractive,
      isFocusable,
      workflow: [],
      mcpTools: []
    };

    // Step 1: Take snapshot to get UID
    commands.workflow.push({
      step: 1,
      action: 'take_snapshot',
      purpose: 'Get element UID from accessibility tree',
      instruction: `Use take_snapshot to get the page snapshot, then find the element matching: ${identifier.selector}`
    });

    // Step 2: Capture default state
    commands.workflow.push({
      step: 2,
      action: 'capture_default',
      purpose: 'Extract default state styles',
      instruction: `Run: window.__seStateCapture.captureCurrentState('${identifier.selector}')`
    });

    // Step 3: Hover state (if interactive)
    if (isInteractive) {
      commands.workflow.push({
        step: 3,
        action: 'hover',
        purpose: 'Trigger hover state',
        instruction: 'Use mcp__chrome_devtools__hover with the element UID',
        mcpTool: {
          name: 'mcp__chrome-devtools__hover',
          params: { uid: '<element_uid>', includeSnapshot: false }
        }
      });

      commands.workflow.push({
        step: 4,
        action: 'capture_hover',
        purpose: 'Extract hover state styles',
        instruction: `Run: window.__seStateCapture.captureCurrentState('${identifier.selector}')`
      });
    }

    // Step 4: Focus state (if focusable)
    if (isFocusable) {
      commands.workflow.push({
        step: 5,
        action: 'click_for_focus',
        purpose: 'Trigger focus state via click',
        instruction: 'Use mcp__chrome_devtools__click with the element UID',
        mcpTool: {
          name: 'mcp__chrome-devtools__click',
          params: { uid: '<element_uid>', includeSnapshot: false }
        }
      });

      commands.workflow.push({
        step: 6,
        action: 'capture_focus',
        purpose: 'Extract focus state styles',
        instruction: `Run: window.__seStateCapture.captureCurrentState('${identifier.selector}')`
      });

      // Reset focus
      commands.workflow.push({
        step: 7,
        action: 'blur',
        purpose: 'Reset focus state',
        instruction: `Run: document.querySelector('${identifier.selector}').blur()`
      });
    }

    // Generate summary MCP tool list
    commands.mcpTools = commands.workflow
      .filter(w => w.mcpTool)
      .map(w => w.mcpTool);

    return {
      ok: true,
      ...commands
    };
  }

  /**
   * Check if element is interactive (responds to hover/click)
   */
  function isInteractiveElement(el) {
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role');
    const cursor = getComputedStyle(el).cursor;

    // Interactive tags
    if (['button', 'a', 'input', 'select', 'textarea'].includes(tag)) return true;

    // Interactive roles
    if (['button', 'link', 'menuitem', 'tab', 'checkbox', 'radio'].includes(role)) return true;

    // Has click handler indicators
    if (el.onclick || el.getAttribute('onclick')) return true;

    // Cursor indicates interactivity
    if (cursor === 'pointer') return true;

    // Has tabindex
    if (el.hasAttribute('tabindex') && el.tabIndex >= 0) return true;

    return false;
  }

  /**
   * Check if element can receive focus
   */
  function isFocusableElement(el) {
    const tag = el.tagName.toLowerCase();

    // Natively focusable
    if (['button', 'input', 'select', 'textarea', 'a'].includes(tag)) {
      return !el.disabled;
    }

    // Has tabindex
    if (el.hasAttribute('tabindex')) {
      return el.tabIndex >= 0;
    }

    // contenteditable
    if (el.isContentEditable) return true;

    return false;
  }

  // ============================================
  // State Capture Functions
  // ============================================

  /**
   * Capture the current computed styles of an element.
   * Call this after triggering a state via MCP tools.
   */
  function captureCurrentState(selector) {
    const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!el) return { ok: false, error: 'Element not found' };

    // By default we include a small subtree snapshot so hover/focus changes on icons/text
    // don't get lost when only the container changes.
    const subtree = captureSubtreeStyleMap(el, {
      maxSubtreeNodes: 6,
      includePseudo: true
    });

    return {
      ok: true,
      selector: cssPath(el),
      timestamp: Date.now(),
      styles: { ...extractStyles(el), ...subtree },
      rect: getRect(el)
    };
  }

  /**
   * Calculate the difference between two state captures.
   * Returns only the properties that changed.
   */
  function diffStates(before, after) {
    if (!before?.styles || !after?.styles) {
      return { ok: false, error: 'Invalid state objects' };
    }

    const changes = {};
    const allProps = new Set([
      ...Object.keys(before.styles),
      ...Object.keys(after.styles)
    ]);

    for (const prop of allProps) {
      const beforeVal = before.styles[prop];
      const afterVal = after.styles[prop];

      if (beforeVal !== afterVal) {
        changes[prop] = {
          from: beforeVal || null,
          to: afterVal || null
        };
      }
    }

    return {
      ok: true,
      hasChanges: Object.keys(changes).length > 0,
      changeCount: Object.keys(changes).length,
      changes
    };
  }

  /**
   * Store captured states for later comparison.
   * Used during MCP workflow execution.
   */
  const stateStore = new Map();

  function storeState(key, state) {
    stateStore.set(key, {
      ...state,
      storedAt: Date.now()
    });
    return { ok: true, key };
  }

  const STATE_SUFFIXES = [
    { key: 'focusvisible', name: 'focusVisible' },
    { key: 'focuswithin', name: 'focusWithin' },
    { key: 'default', name: 'default' },
    { key: 'hover', name: 'hover' },
    { key: 'active', name: 'active' },
    { key: 'focus', name: 'focus' },
    { key: 'disabled', name: 'disabled' },
    { key: 'checked', name: 'checked' },
    { key: 'invalid', name: 'invalid' }
  ];

  function inferStateNameFromKey(key) {
    if (!key) return null;
    const normalized = String(key).toLowerCase();
    for (const entry of STATE_SUFFIXES) {
      if (normalized.endsWith(`-${entry.key}`) || normalized.endsWith(`:${entry.key}`)) {
        return entry.name;
      }
    }
    return null;
  }

  function getStoredStateMatrix() {
    if (!stateStore.size) return null;
    const matrix = {};

    for (const [key, entry] of stateStore.entries()) {
      const selector = entry?.selector;
      if (!selector) continue;
      const stateName = entry?.stateName || inferStateNameFromKey(key) || 'default';
      if (!matrix[selector]) {
        matrix[selector] = { selector, states: {} };
      }
      if (entry?.styles) {
        matrix[selector].states[stateName] = entry.styles;
      }
    }

    return Object.keys(matrix).length ? matrix : null;
  }

  function generateStoredSummaries() {
    const matrix = getStoredStateMatrix();
    if (!matrix) return null;
    const summaries = {};

    for (const [selector, data] of Object.entries(matrix)) {
      const summary = generateStateSummary({ selector, states: data.states });
      if (summary?.ok) summaries[selector] = summary;
    }

    return Object.keys(summaries).length ? summaries : null;
  }

  function getStoredState(key) {
    return stateStore.get(key) || null;
  }

  function clearStoredStates() {
    stateStore.clear();
    return { ok: true };
  }

  // ============================================
  // Batch State Capture
  // ============================================

  /**
   * Generate MCP workflow for capturing states of multiple elements.
   * Optimizes by grouping similar operations.
   */
  function batchCapture(selectors) {
    const elements = [];
    const errors = [];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) {
        elements.push({
          selector,
          element: el,
          identifier: getElementIdentifier(el),
          isInteractive: isInteractiveElement(el),
          isFocusable: isFocusableElement(el)
        });
      } else {
        errors.push({ selector, error: 'Element not found' });
      }
    }

    // Generate optimized workflow
    const workflow = {
      totalElements: elements.length,
      errors,
      steps: []
    };

    // Step 1: Initial snapshot
    workflow.steps.push({
      type: 'snapshot',
      instruction: 'Take initial page snapshot to get all element UIDs'
    });

    // Step 2: Capture all default states
    workflow.steps.push({
      type: 'batch_capture',
      state: 'default',
      instruction: 'Capture default states for all elements',
      script: `
        const results = {};
        ${selectors.map((s, i) => `results['el_${i}'] = window.__seStateCapture.captureCurrentState('${s}');`).join('\n')}
        return results;
      `
    });

    // Step 3: Hover states (for interactive elements)
    const interactiveElements = elements.filter(e => e.isInteractive);
    if (interactiveElements.length > 0) {
      workflow.steps.push({
        type: 'hover_sequence',
        state: 'hover',
        elements: interactiveElements.map(e => ({
          selector: e.selector,
          identifier: e.identifier
        })),
        instruction: 'For each interactive element: hover -> capture -> move away'
      });
    }

    // Step 4: Focus states (for focusable elements)
    const focusableElements = elements.filter(e => e.isFocusable);
    if (focusableElements.length > 0) {
      workflow.steps.push({
        type: 'focus_sequence',
        state: 'focus',
        elements: focusableElements.map(e => ({
          selector: e.selector,
          identifier: e.identifier
        })),
        instruction: 'For each focusable element: click -> capture -> blur'
      });
    }

    return {
      ok: true,
      ...workflow
    };
  }

  // ============================================
  // Complete State Extraction (CSS-based fallback)
  // ============================================

  /**
   * Extract all states using CSS rule matching (fallback when MCP not available).
   * Less accurate than MCP-triggered states but works without interaction.
   */
  function extractAllStatesFallback(selector) {
    const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!el) return { ok: false, error: 'Element not found' };

    const states = {
      default: extractStyles(el),
      hover: null,
      active: null,
      focus: null,
      focusVisible: null,
      focusWithin: null,
      disabled: null,
      checked: null,
      invalid: null
    };

    // Extract pseudo-class styles from stylesheets
    const pseudoClasses = [
      ':hover', ':active', ':focus', ':focus-visible',
      ':focus-within', ':disabled', ':checked', ':invalid'
    ];

    for (const sheet of document.styleSheets) {
      try {
        const rules = sheet.cssRules || sheet.rules;
        for (const rule of rules) {
          if (rule.type !== 1) continue;

          const selectorText = rule.selectorText || '';

          for (const pseudo of pseudoClasses) {
            if (selectorText.includes(pseudo)) {
              const baseSelector = selectorText.replace(
                new RegExp(pseudo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
                ''
              );

              try {
                if (el.matches(baseSelector)) {
                  const stateName = pseudo.replace(':', '').replace('-', '');
                  const stateKey = stateName === 'focusvisible' ? 'focusVisible' :
                                   stateName === 'focuswithin' ? 'focusWithin' : stateName;

                  if (!states[stateKey]) {
                    states[stateKey] = { ...states.default };
                  }

                  // Extract properties from rule
                  for (const prop of STATE_PROPERTIES) {
                    const kebab = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
                    const value = rule.style.getPropertyValue(kebab);
                    if (value) {
                      states[stateKey][prop] = value;
                    }
                  }
                }
              } catch (e) {
                // Invalid selector, skip
              }
            }
          }
        }
      } catch (e) {
        debug('Cannot access stylesheet (cross-origin):', sheet.href);
      }
    }

    // Clean up null states
    for (const key of Object.keys(states)) {
      if (states[key] === null) delete states[key];
    }

    return {
      ok: true,
      selector: cssPath(el),
      method: 'css-fallback',
      states,
      stateCount: Object.keys(states).length
    };
  }

  // ============================================
  // State Summary Generation
  // ============================================

  /**
   * Generate a human-readable summary of state changes.
   * Useful for AI understanding and documentation.
   */
  function generateStateSummary(stateData) {
    if (!stateData?.states) return { ok: false, error: 'Invalid state data' };

    const summary = {
      selector: stateData.selector,
      hasInteractiveStates: false,
      stateDescriptions: {},
      keyChanges: []
    };

    const defaultState = stateData.states.default;

    for (const [stateName, stateStyles] of Object.entries(stateData.states)) {
      if (stateName === 'default') continue;

      const diff = diffStates({ styles: defaultState }, { styles: stateStyles });
      if (diff.hasChanges) {
        summary.hasInteractiveStates = true;
        summary.stateDescriptions[stateName] = describeStateChanges(diff.changes);

        // Track key changes
        for (const [prop, change] of Object.entries(diff.changes)) {
          summary.keyChanges.push({
            state: stateName,
            property: prop,
            from: change.from,
            to: change.to
          });
        }
      }
    }

    return {
      ok: true,
      ...summary
    };
  }

  /**
   * Generate natural language description of state changes.
   */
  function describeStateChanges(changes) {
    const descriptions = [];

    for (const [prop, change] of Object.entries(changes)) {
      switch (prop) {
        case 'backgroundColor':
          descriptions.push(`background changes from ${change.from} to ${change.to}`);
          break;
        case 'color':
          descriptions.push(`text color changes to ${change.to}`);
          break;
        case 'transform':
          if (change.to?.includes('scale')) {
            descriptions.push('element scales');
          } else if (change.to?.includes('translate')) {
            descriptions.push('element moves');
          } else {
            descriptions.push(`transform: ${change.to}`);
          }
          break;
        case 'opacity':
          descriptions.push(`opacity changes to ${change.to}`);
          break;
        case 'boxShadow':
          if (change.to && change.to !== 'none') {
            descriptions.push('shadow appears/changes');
          } else {
            descriptions.push('shadow removed');
          }
          break;
        case 'borderColor':
          descriptions.push(`border color changes to ${change.to}`);
          break;
        case 'outline':
        case 'outlineColor':
          descriptions.push('focus ring appears');
          break;
        default:
          descriptions.push(`${prop}: ${change.to}`);
      }
    }

    return descriptions.join(', ');
  }

  // ============================================
  // Export
  // ============================================

  window.__seStateCapture = {
    installed: true,
    version: '1.0.0',

    // MCP workflow generation
    generateMCPCommands,
    batchCapture,

    // State capture
    captureCurrentState,
    extractAllStatesFallback,

    // State comparison
    diffStates,
    generateStateSummary,

    // State storage (for MCP workflow)
    storeState,
    getStoredState,
    clearStoredStates,
    inferStateNameFromKey,
    getStoredStateMatrix,
    generateStoredSummaries,

    // Utilities
    getElementIdentifier,
    isInteractiveElement,
    isFocusableElement,
    cssPath,
    extractStyles,

    // Constants
    STATE_PROPERTIES
  };
})();
