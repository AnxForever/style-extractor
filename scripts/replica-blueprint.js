// Style Extractor: Replica Blueprint
// Unified replication blueprint for AI-driven UI reconstruction
//
// Combines:
// 1. DOM hierarchy + layout constraints
// 2. Component semantics + variants
// 3. State summaries (hover/focus/active)
// 4. Responsive breakpoints + viewport workflow
// 5. Design tokens (from StyleKit)
//
// Usage:
//   window.__seBlueprint.build(extractedData, options)
//   window.__seBlueprint.generate(extractedData, options)

(() => {
  if (window.__seBlueprint?.installed) return;

  const utils = window.__seUtils || {};
  const logger = utils.createLogger ? utils.createLogger('blueprint') : {
    log: () => {},
    warn: () => {},
    error: (...args) => console.error('[style-extractor:blueprint]', ...args)
  };

  const DEFAULT_OPTIONS = {
    maxDepth: 10,
    maxNodes: 800,
    minWidth: 8,
    minHeight: 8,
    includeText: true,
    includeStyles: true,
    skipTags: ['script', 'style', 'noscript', 'svg', 'path', 'link', 'meta'],
    interactionTargetLimit: 80,
    interactionGroupSampleLimit: 6,
    interactionRecommendationLimit: 8,
    interactionWorkflowLimit: 5
  };

  // --------------------------------------------
  // Helpers
  // --------------------------------------------

  function fallbackCssPath(el) {
    if (!el || el.nodeType !== 1) return null;
    if (el.id) return `#${CSS.escape(el.id)}`;

    const parts = [];
    let cur = el;
    let depth = 0;

    while (cur && cur.nodeType === 1 && depth < 5) {
      let part = cur.tagName.toLowerCase();
      if (cur.classList?.length) {
        part += Array.from(cur.classList)
          .slice(0, 2)
          .map(c => `.${CSS.escape(c)}`)
          .join('');
      }
      const parent = cur.parentElement;
      if (parent) {
        const same = Array.from(parent.children).filter(c => c.tagName === cur.tagName);
        if (same.length > 1) {
          part += `:nth-of-type(${same.indexOf(cur) + 1})`;
        }
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

  function cssPath(el) {
    if (utils.getCachedSelector) return utils.getCachedSelector(el);
    return fallbackCssPath(el);
  }

  function getRect(el) {
    if (utils.getCachedRect) return utils.getCachedRect(el);
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.x),
      y: Math.round(r.y),
      width: Math.round(r.width),
      height: Math.round(r.height)
    };
  }

  function getStyle(el) {
    if (utils.getCachedStyle) return utils.getCachedStyle(el);
    return getComputedStyle(el);
  }

  function isVisible(el) {
    if (utils.isVisible) return utils.isVisible(el);
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== 'hidden' &&
      style.display !== 'none' &&
      parseFloat(style.opacity) > 0
    );
  }

  function toNumber(value) {
    if (!value || value === 'auto' || value === 'none') return null;
    const num = parseFloat(value);
    return Number.isFinite(num) ? num : null;
  }

  function isNonZero(value) {
    if (!value) return false;
    if (value === 'auto' || value === 'none') return false;
    if (value === '0' || value === '0px' || value === '0%') return false;
    return true;
  }

  function readBox(s, prefix, options = {}) {
    const allowAuto = options && options.allowAuto === true;
    const top = s[`${prefix}Top`];
    const right = s[`${prefix}Right`];
    const bottom = s[`${prefix}Bottom`];
    const left = s[`${prefix}Left`];

    const hasMeaningful = [top, right, bottom, left].some((v) => {
      if (isNonZero(v)) return true;
      if (!allowAuto) return false;
      return String(v || '').trim() === 'auto';
    });

    if (!hasMeaningful) return null;
    return { top, right, bottom, left };
  }

  function cleanObject(obj) {
    if (!obj || typeof obj !== 'object') return obj;

    for (const key of Object.keys(obj)) {
      const value = obj[key];
      if (value === null || value === undefined) {
        delete obj[key];
        continue;
      }
      if (typeof value === 'object' && !Array.isArray(value)) {
        cleanObject(value);
        if (Object.keys(value).length === 0) {
          delete obj[key];
        }
      }
    }

    return obj;
  }

  function clampText(text, max = 80) {
    if (!text) return null;
    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (!cleaned) return null;
    return cleaned.slice(0, max);
  }

  function extractLayout(s) {
    const layout = {
      display: s.display
    };

    if (s.position && s.position !== 'static') layout.position = s.position;
    if (s.zIndex && s.zIndex !== 'auto') layout.zIndex = s.zIndex;
    if (s.isolation && s.isolation !== 'auto') layout.isolation = s.isolation;
    // Important for reconstructing overlays/absolute layouts.
    if (s.top && s.top !== 'auto') layout.top = s.top;
    if (s.right && s.right !== 'auto') layout.right = s.right;
    if (s.bottom && s.bottom !== 'auto') layout.bottom = s.bottom;
    if (s.left && s.left !== 'auto') layout.left = s.left;

    if (s.display && s.display.includes('flex')) {
      layout.flex = {
        direction: s.flexDirection,
        wrap: s.flexWrap,
        justify: s.justifyContent,
        align: s.alignItems,
        gap: isNonZero(s.gap) ? s.gap : null,
        // Useful for multi-row flex layouts.
        alignContent: s.alignContent && s.alignContent !== 'normal' ? s.alignContent : null
      };
    }

    if (s.display && s.display.includes('grid')) {
      layout.grid = {
        columns: s.gridTemplateColumns !== 'none' ? s.gridTemplateColumns : null,
        rows: s.gridTemplateRows !== 'none' ? s.gridTemplateRows : null,
        autoFlow: s.gridAutoFlow,
        gap: isNonZero(s.gap) ? s.gap : null,
        justifyItems: s.justifyItems && s.justifyItems !== 'stretch' ? s.justifyItems : null,
        alignItems: s.alignItems && s.alignItems !== 'stretch' ? s.alignItems : null,
        justifyContent: s.justifyContent && s.justifyContent !== 'normal' ? s.justifyContent : null,
        alignContent: s.alignContent && s.alignContent !== 'normal' ? s.alignContent : null
      };
    }

    // Critical for fidelity: clipping (border-radius + overflow hidden) and scroll containers.
    if (s.overflow && s.overflow !== 'visible') layout.overflow = s.overflow;
    if (s.overflowX && s.overflowX !== 'visible' && s.overflowX !== s.overflow) layout.overflowX = s.overflowX;
    if (s.overflowY && s.overflowY !== 'visible' && s.overflowY !== s.overflow) layout.overflowY = s.overflowY;

    // Flex item evidence (e.g. `flex-1`).
    const flexItem = {};
    if (s.flexGrow && s.flexGrow !== '0') flexItem.grow = s.flexGrow;
    if (s.flexShrink && s.flexShrink !== '1') flexItem.shrink = s.flexShrink;
    if (s.flexBasis && s.flexBasis !== 'auto') flexItem.basis = s.flexBasis;
    if (Object.keys(flexItem).length > 0) layout.flexItem = flexItem;

    // Grid item placement evidence (spans/positioning in CSS grid).
    const gridItem = {};
    if (s.gridColumnStart && s.gridColumnStart !== 'auto') gridItem.columnStart = s.gridColumnStart;
    if (s.gridColumnEnd && s.gridColumnEnd !== 'auto') gridItem.columnEnd = s.gridColumnEnd;
    if (s.gridRowStart && s.gridRowStart !== 'auto') gridItem.rowStart = s.gridRowStart;
    if (s.gridRowEnd && s.gridRowEnd !== 'auto') gridItem.rowEnd = s.gridRowEnd;
    if (Object.keys(gridItem).length > 0) layout.gridItem = gridItem;

    if (s.alignSelf && s.alignSelf !== 'auto') layout.alignSelf = s.alignSelf;
    if (s.justifySelf && s.justifySelf !== 'auto') layout.justifySelf = s.justifySelf;
    if (s.order && s.order !== '0') layout.order = s.order;

    return cleanObject(layout);
  }

  function extractConstraints(rect, s, parentRect) {
    const size = {
      width: rect.width,
      height: rect.height
    };

    const minWidth = toNumber(s.minWidth);
    const maxWidth = toNumber(s.maxWidth);
    const minHeight = toNumber(s.minHeight);
    const maxHeight = toNumber(s.maxHeight);

    if (minWidth !== null) size.minWidth = minWidth;
    if (maxWidth !== null) size.maxWidth = maxWidth;
    if (minHeight !== null) size.minHeight = minHeight;
    if (maxHeight !== null) size.maxHeight = maxHeight;

    if (parentRect && parentRect.width > 0) {
      size.widthRatio = Math.round((rect.width / parentRect.width) * 1000) / 1000;
    }
    if (parentRect && parentRect.height > 0) {
      size.heightRatio = Math.round((rect.height / parentRect.height) * 1000) / 1000;
    }

    const spacing = {};
    const padding = readBox(s, 'padding');
    // Auto margins are meaningful for centering containers.
    const margin = readBox(s, 'margin', { allowAuto: true });
    if (padding) spacing.padding = padding;
    if (margin) spacing.margin = margin;
    if (isNonZero(s.gap)) spacing.gap = s.gap;

    const constraints = { size, spacing };
    return cleanObject(constraints);
  }

  function extractTypography(s) {
    const typography = {
      fontFamily: s.fontFamily,
      fontSize: s.fontSize,
      fontWeight: s.fontWeight,
      fontStyle: s.fontStyle !== 'normal' ? s.fontStyle : null,
      lineHeight: s.lineHeight,
      letterSpacing: s.letterSpacing,
      textAlign: s.textAlign !== 'start' ? s.textAlign : null,
      textTransform: s.textTransform !== 'none' ? s.textTransform : null,
      textDecorationLine: s.textDecorationLine !== 'none' ? s.textDecorationLine : null,
      textDecorationStyle: s.textDecorationStyle && s.textDecorationStyle !== 'solid' ? s.textDecorationStyle : null,
      textDecorationColor: s.textDecorationColor && s.textDecorationColor !== 'currentcolor' ? s.textDecorationColor : null,
      whiteSpace: s.whiteSpace && s.whiteSpace !== 'normal' ? s.whiteSpace : null,
      textOverflow: s.textOverflow && s.textOverflow !== 'clip' ? s.textOverflow : null
    };

    return cleanObject(typography);
  }

  function extractVisual(s) {
    const isZeroTimeList = (value) => {
      if (!value) return true;
      const parts = String(value)
        .split(',')
        .map(v => v.trim())
        .filter(Boolean);
      if (parts.length === 0) return true;
      return parts.every(v => v === '0s' || v === '0ms' || v === '0');
    };

    const borderSide = (width, style, color) => {
      if (!isNonZero(width)) return null;
      if (!style || style === 'none') return null;
      return { width, style, color };
    };

    const borderTop = borderSide(s.borderTopWidth, s.borderTopStyle, s.borderTopColor);
    const borderRight = borderSide(s.borderRightWidth, s.borderRightStyle, s.borderRightColor);
    const borderBottom = borderSide(s.borderBottomWidth, s.borderBottomStyle, s.borderBottomColor);
    const borderLeft = borderSide(s.borderLeftWidth, s.borderLeftStyle, s.borderLeftColor);

    let border = null;
    if (borderTop || borderRight || borderBottom || borderLeft) {
      const same =
        borderTop &&
        borderRight &&
        borderBottom &&
        borderLeft &&
        borderTop.width === borderRight.width &&
        borderTop.width === borderBottom.width &&
        borderTop.width === borderLeft.width &&
        borderTop.style === borderRight.style &&
        borderTop.style === borderBottom.style &&
        borderTop.style === borderLeft.style &&
        borderTop.color === borderRight.color &&
        borderTop.color === borderBottom.color &&
        borderTop.color === borderLeft.color;

      border = same ? borderTop : { top: borderTop, right: borderRight, bottom: borderBottom, left: borderLeft };
    }

    const visual = {
      color: s.color,
      backgroundColor: s.backgroundColor,
      backgroundImage: s.backgroundImage && s.backgroundImage !== 'none' ? s.backgroundImage : null,
      backgroundSize: null,
      backgroundPosition: null,
      backgroundRepeat: null,
      borderRadius: s.borderRadius,
      border,
      boxShadow: s.boxShadow,
      opacity: s.opacity && s.opacity !== '1' ? s.opacity : null,
      transform: s.transform && s.transform !== 'none' ? s.transform : null,
      filter: s.filter && s.filter !== 'none' ? s.filter : null,
      backdropFilter: s.backdropFilter && s.backdropFilter !== 'none' ? s.backdropFilter : null,
      mixBlendMode: s.mixBlendMode && s.mixBlendMode !== 'normal' ? s.mixBlendMode : null,
      cursor: s.cursor && s.cursor !== 'auto' ? s.cursor : null,
      transition: null
    };

    if (visual.backgroundImage) {
      visual.backgroundSize = s.backgroundSize && s.backgroundSize !== 'auto' ? s.backgroundSize : null;
      visual.backgroundPosition = s.backgroundPosition && s.backgroundPosition !== '0% 0%' ? s.backgroundPosition : null;
      visual.backgroundRepeat = s.backgroundRepeat && s.backgroundRepeat !== 'repeat' ? s.backgroundRepeat : null;
    }

    // Replaced element rendering (images/videos): important for cards and hero media.
    if (s.objectFit && s.objectFit !== 'fill') {
      visual.objectFit = s.objectFit;
    }
    if (s.objectPosition) {
      const op = String(s.objectPosition).replace(/\s+/g, ' ').trim().toLowerCase();
      if (op && op !== '50% 50%' && op !== 'center' && op !== 'center center') {
        visual.objectPosition = s.objectPosition;
      }
    }
    if (s.aspectRatio && s.aspectRatio !== 'auto') {
      visual.aspectRatio = s.aspectRatio;
    }

    if (!isZeroTimeList(s.transitionDuration)) {
      visual.transition = {
        property: s.transitionProperty,
        duration: s.transitionDuration,
        timingFunction: s.transitionTimingFunction,
        delay: isZeroTimeList(s.transitionDelay) ? null : s.transitionDelay
      };
    }

    if (visual.backgroundColor === 'transparent' || visual.backgroundColor === 'rgba(0, 0, 0, 0)') {
      visual.backgroundColor = null;
    }
    if (visual.borderRadius === '0px') visual.borderRadius = null;
    if (visual.boxShadow === 'none') visual.boxShadow = null;

    return cleanObject(visual);
  }

  function resolveComponentsMap(data) {
    if (!data) return {};
    if (data.components && typeof data.components === 'object') return data.components;
    return data;
  }

  function buildComponentIndex(componentsData) {
    const componentsMap = resolveComponentsMap(componentsData);
    const list = [];
    const byType = {};
    const selectorIndex = new Map();
    const elementIndex = new WeakMap();

    let counter = 1;

    for (const [type, items] of Object.entries(componentsMap || {})) {
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        if (!item || !item.selector) continue;
        const id = `cmp-${counter++}`;
        const entry = {
          id,
          type,
          selector: item.selector,
          rect: item.rect || null,
          text: item.text || null,
          variant: item.variant || null,
          detectionMethod: item.detectionMethod || null
        };
        list.push(entry);
        if (!byType[type]) byType[type] = [];
        byType[type].push(id);
        selectorIndex.set(item.selector, entry);

        try {
          const el = document.querySelector(item.selector);
          if (el) elementIndex.set(el, entry);
        } catch (e) {
          // ignore invalid selectors
        }
      }
    }

    return { list, byType, selectorIndex, elementIndex };
  }

  function buildStateIndex(stateData) {
    const selectorIndex = new Map();
    const elementIndex = new WeakMap();
    const evidenceSelectorIndex = new Map();
    const evidenceElementIndex = new WeakMap();

    function pickPseudo(styles, pseudo) {
      if (!styles || typeof styles !== 'object') return null;
      const prefix = `${pseudo}.`;
      const props = [
        'content',
        'color',
        'backgroundColor',
        'backgroundImage',
        'backgroundSize',
        'backgroundPosition',
        'backgroundRepeat',
        'borderColor',
        'borderWidth',
        'outlineColor',
        'boxShadow',
        'opacity',
        'transform',
        'textDecorationLine',
        'fill',
        'stroke'
      ];
      const out = {};
      for (const prop of props) {
        const v = styles[`${prefix}${prop}`];
        if (v === undefined || v === null) continue;
        if (v === '' || v === 'none' || v === 'normal' || v === '0px') continue;
        out[prop] = v;
      }
      // Only treat pseudo evidence as "present" if it actually exists (content != none).
      if (!Object.prototype.hasOwnProperty.call(out, 'content')) return null;
      return Object.keys(out).length ? out : null;
    }

    function summarizeCapturedStates(entry) {
      const states = entry?.states && typeof entry.states === 'object' ? entry.states : null;
      if (!states) return null;
      const stateNames = Object.keys(states);
      if (stateNames.length === 0) return null;

      // Prefer default evidence, fall back to hover if needed.
      const baseStyles = states.default || states.hover || null;
      const before = pickPseudo(baseStyles, '::before');
      const after = pickPseudo(baseStyles, '::after');

      let descendantEvidenceCount = 0;
      if (baseStyles && typeof baseStyles === 'object') {
        for (const key of Object.keys(baseStyles)) {
          if (key.startsWith('desc:')) descendantEvidenceCount += 1;
        }
      }

      return {
        stateNames,
        pseudo: before || after ? { before, after } : null,
        descendantEvidenceCount: descendantEvidenceCount || 0
      };
    }

    const summaries = stateData?.summaries || {};
    for (const [selector, summary] of Object.entries(summaries)) {
      if (!summary) continue;
      selectorIndex.set(selector, summary);
      try {
        const el = document.querySelector(selector);
        if (el) elementIndex.set(el, summary);
      } catch (e) {
        // ignore invalid selectors
      }
    }

    const capturedMatrix = stateData?.captured?.states || null;
    if (capturedMatrix && typeof capturedMatrix === 'object') {
      for (const [selector, entry] of Object.entries(capturedMatrix)) {
        const evidence = summarizeCapturedStates(entry);
        if (!evidence) continue;
        evidenceSelectorIndex.set(selector, evidence);
        try {
          const el = document.querySelector(selector);
          if (el) evidenceElementIndex.set(el, evidence);
        } catch {
          // ignore invalid selectors
        }
      }
    }

    return { selectorIndex, elementIndex, evidenceSelectorIndex, evidenceElementIndex };
  }

  function buildA11yIndex(a11yData) {
    const selectorIndex = new Map();
    const elementIndex = new WeakMap();

    function visit(node) {
      if (!node) return;
      if (Array.isArray(node)) {
        node.forEach(visit);
        return;
      }
      if (node.selector) {
        selectorIndex.set(node.selector, node);
        try {
          const el = document.querySelector(node.selector);
          if (el) elementIndex.set(el, node);
        } catch {
          // ignore invalid selectors
        }
      }
      if (node.children) node.children.forEach(visit);
    }

    visit(a11yData?.tree);

    return { selectorIndex, elementIndex };
  }

  function collectStateWorkflows(stateData) {
    if (!stateData) return null;
    const workflows = {};
    if (stateData.batchWorkflow) workflows.batch = stateData.batchWorkflow;
    if (Array.isArray(stateData.mcpCommands) && stateData.mcpCommands.length > 0) {
      workflows.elements = stateData.mcpCommands;
    }
    return Object.keys(workflows).length > 0 ? workflows : null;
  }

  function buildStateMatrix(stateData) {
    const sources = [];
    if (stateData?.fallback && typeof stateData.fallback === 'object') sources.push(stateData.fallback);
    if (stateData?.captured?.states && typeof stateData.captured.states === 'object') sources.unshift(stateData.captured.states);
    if (sources.length === 0) return null;

    const matrix = {};

    for (const source of sources) {
      for (const [selector, data] of Object.entries(source)) {
        if (!data?.states) continue;
        const next = new Set([...(matrix[selector] || []), ...Object.keys(data.states)]);
        matrix[selector] = Array.from(next);
      }
    }

    return Object.keys(matrix).length > 0 ? matrix : null;
  }

  function buildInteractionPlan(tree, stateData, options = {}, context = {}) {
    const limit = Number.isFinite(options.interactionTargetLimit) ? options.interactionTargetLimit : null;
    const sampleLimit = Number.isFinite(options.interactionGroupSampleLimit) ? options.interactionGroupSampleLimit : 6;
    const recommendationLimit = Number.isFinite(options.interactionRecommendationLimit) ? options.interactionRecommendationLimit : 8;
    const workflowLimit = Number.isFinite(options.interactionWorkflowLimit) ? options.interactionWorkflowLimit : 5;
    const plan = {
      summary: {
        selectors: stateData?.selectors?.length || 0,
        hasBatchWorkflow: !!stateData?.batchWorkflow,
        hasElementWorkflows: Array.isArray(stateData?.mcpCommands) && stateData.mcpCommands.length > 0,
        targetCount: 0,
        targetLimitReached: false,
        componentGroups: 0,
        sectionGroups: 0,
        componentTypeGroups: 0,
        roleGroups: 0,
        recommendationCount: 0,
        workflowCount: 0,
        priority: {
          high: 0,
          medium: 0,
          low: 0
        }
      },
      workflows: collectStateWorkflows(stateData),
      stateMatrix: buildStateMatrix(stateData),
      targets: [],
      groups: null,
      recommendations: null,
      workflowsForTopTargets: null
    };

    if (!tree) return plan;

    const nodeIndex = createNodeIndex(tree);
    const componentContext = buildComponentContext(tree);
    const sectionIndex = buildSectionIndex(context.sections);
    const targetIndex = new Map();

    const SOURCE_PRIORITY = {
      'state-summary': 4,
      'mcp-command': 3,
      'state-selector': 3,
      'captured-state': 3,
      heuristic: 1
    };

    function sourcePriority(source) {
      if (!source) return 0;
      return SOURCE_PRIORITY[source] || 0;
    }

    function computePriority(node, source, stateInfo, componentInfo, sectionInfo) {
      let score = 10;
      const name = (node?.semanticName || node?.text || '').toLowerCase();
      const role = node?.semanticRole || node?.role || '';
      const type = componentInfo?.type || node?.component?.type || '';
      const sectionRole = sectionInfo?.role || '';

      if (node?.state?.hasInteractiveStates) score += 30;
      if (stateInfo?.states && Object.keys(stateInfo.states).length > 1) score += 10;
      if (source === 'state-selector' || source === 'mcp-command') score += 20;

      if (['button', 'submitButton'].includes(type)) score += 30;
      if (['navItem', 'tab', 'menu'].includes(type)) score += 12;
      if (['button', 'link', 'menuitem', 'tab', 'combobox', 'textbox'].includes(role)) score += 12;

      if (sectionRole === 'hero') score += 18;
      else if (sectionRole === 'header') score += 8;
      else if (sectionRole === 'navigation') score += 6;

      if (name) {
        const ctaKeywords = [
          'get started', 'start', 'submit', 'login', 'sign up', 'signup', 'buy', 'download', 'add',
          'next', 'prev', 'previous', 'read more', 'learn more', 'explore', 'action', 'try', 'create'
        ];
        const navKeywords = ['home', 'about', 'pricing', 'docs', 'guide', 'blog', 'contact'];
        if (ctaKeywords.some(k => name.includes(k))) score += 20;
        else if (navKeywords.some(k => name.includes(k))) score += 6;
      }

      if (node?.rect) {
        const area = node.rect.width * node.rect.height;
        if (area >= 50000) score += 20;
        else if (area >= 20000) score += 10;
        if (typeof window !== 'undefined' && Number.isFinite(window.innerHeight)) {
          if (node.rect.y <= window.innerHeight * 0.8) score += 10;
        }
      }

      if (score > 100) score = 100;
      let level = 'low';
      if (score >= 70) level = 'high';
      else if (score >= 40) level = 'medium';

      return { score, level };
    }

    function addTarget(node, selector, source, stateInfo) {
      if (limit !== null && plan.targets.length >= limit) {
        plan.summary.targetLimitReached = true;
        return;
      }
      if (!node && !selector) return;
      const key = node?.uid || selector;
      if (!key) return;

      const componentInfo = node?.uid ? componentContext.get(node.uid) : null;
      const sectionInfo = resolveSectionForNode(node, componentInfo, sectionIndex);
      const nextPriority = computePriority(node, source, stateInfo, componentInfo, sectionInfo);
      const nextStates = stateInfo?.states ? Object.keys(stateInfo.states) : null;

      if (targetIndex.has(key)) {
        const entry = targetIndex.get(key);

        if (!Array.isArray(entry.sources)) {
          entry.sources = entry.source ? [entry.source] : [];
        }
        if (source && !entry.sources.includes(source)) entry.sources.push(source);
        if (source && sourcePriority(source) > sourcePriority(entry.source)) entry.source = source;

        if (!entry.selector && (selector || node?.selector)) entry.selector = selector || node?.selector || null;
        if (!entry.nodeId && node?.uid) entry.nodeId = node.uid;
        if (!entry.tag && node?.tag) entry.tag = node.tag;
        if (!entry.semanticRole && node?.semanticRole) entry.semanticRole = node.semanticRole;
        if (!entry.semanticName && node?.semanticName) entry.semanticName = node.semanticName;
        if (!entry.accessibleRole && node?.accessibleRole) entry.accessibleRole = node.accessibleRole;
        if (!entry.accessibleName && node?.accessibleName) entry.accessibleName = node.accessibleName;
        if ((!entry.keyChanges || entry.keyChanges.length === 0) && node?.state?.keyChanges?.length) {
          entry.keyChanges = node.state.keyChanges;
        }

        if (componentInfo?.id && !entry.component) {
          entry.component = {
            id: componentInfo.id,
            type: componentInfo.type || null,
            variant: componentInfo.variant || null
          };
        }

        if (sectionInfo?.id && !entry.section) {
          entry.section = {
            id: sectionInfo.id,
            name: sectionInfo.name || null,
            role: sectionInfo.semanticRole || null
          };
        }

        if (nextStates) {
          const merged = new Set([...(entry.availableStates || []), ...nextStates]);
          entry.availableStates = Array.from(merged);
        }

        if (!entry.priority || (nextPriority?.score || 0) > (entry.priority.score || 0)) {
          entry.priority = nextPriority;
        }

        return;
      }

      const entry = {
        nodeId: node?.uid || null,
        selector: selector || node?.selector || null,
        tag: node?.tag || null,
        semanticRole: node?.semanticRole || null,
        semanticName: node?.semanticName || null,
        accessibleRole: node?.accessibleRole || null,
        accessibleName: node?.accessibleName || null,
        keyChanges: node?.state?.keyChanges || [],
        source: source || null,
        sources: source ? [source] : [],
        priority: nextPriority
      };

      if (componentInfo?.id) {
        entry.component = {
          id: componentInfo.id,
          type: componentInfo.type || null,
          variant: componentInfo.variant || null
        };
      }

      if (sectionInfo?.id) {
        entry.section = {
          id: sectionInfo.id,
          name: sectionInfo.name || null,
          role: sectionInfo.semanticRole || null
        };
      }

      if (nextStates) entry.availableStates = nextStates;

      plan.targets.push(entry);
      targetIndex.set(key, entry);
    }

    function resolveSelector(selector) {
      if (!selector) return null;
      if (nodeIndex.bySelector.has(selector)) return selector;
      try {
        const el = document.querySelector(selector);
        if (el) {
          const resolved = cssPath(el);
          if (resolved) return resolved;
        }
      } catch {
        // ignore invalid selectors
      }
      return selector;
    }

    function pushSample(list, value) {
      if (!value) return;
      if (list.length >= sampleLimit) return;
      if (list.includes(value)) return;
      list.push(value);
    }

    function buildRecommendationActions(target, keyBase, includeClick = true, includeScreenshot = true) {
      const actions = [];
      if (!target?.selector) return actions;

      const role = target.semanticRole || '';
      const a11yRole = target.accessibleRole || role;
      const a11yNameRaw = target.accessibleName || target.semanticName || '';
      const a11yName = a11yNameRaw.length > 80 ? `${a11yNameRaw.slice(0, 77)}...` : a11yNameRaw;
      const selectorLiteral = JSON.stringify(target.selector);
      const tag = target.tag || '';
      const type = target.component?.type || '';
      const availableStates = new Set(target.availableStates || []);

      const hoverRoles = new Set(['button', 'link', 'menuitem', 'tab', 'switch', 'option']);
      const hoverTypes = new Set(['button', 'navItem', 'card', 'badge', 'menu']);
      const focusRoles = new Set(['textbox', 'combobox', 'button', 'link', 'menuitem', 'tab']);
      const focusTags = new Set(['button', 'a', 'input', 'select', 'textarea']);
      const clickRoles = new Set(['button', 'link', 'menuitem', 'tab', 'checkbox', 'radio', 'switch']);

      const canHover = availableStates.has('hover') || hoverRoles.has(role) || hoverTypes.has(type) || tag === 'a' || tag === 'button';
      const canFocus = availableStates.has('focus') || availableStates.has('focusVisible') || focusRoles.has(role) || focusTags.has(tag);
      const canClick = includeClick && (availableStates.has('active') || clickRoles.has(role) || type === 'button' || tag === 'button' || tag === 'a');

      actions.push({
        action: 'snapshot',
        instruction: 'Take snapshot and locate element UID for MCP actions',
        note: a11yRole || a11yName ? `UID hint: role=${a11yRole || '?'} name~=${a11yName || '?'}` : null,
        mcpTool: { name: 'mcp__chrome-devtools__take_snapshot', params: {} }
      });

      actions.push({
        action: 'scroll_into_view',
        instruction: 'Ensure target is visible in the viewport (helps hover + screenshots)',
        script: `() => {\n  const sel = ${selectorLiteral};\n  const el = document.querySelector(sel);\n  if (!el) return { ok: false, error: 'Element not found', selector: sel };\n  el.scrollIntoView({ block: 'center', inline: 'center' });\n  return { ok: true, selector: sel };\n}`
      });

      actions.push({
        action: 'capture_default',
        state: 'default',
        stateKey: `${keyBase}-default`,
        instruction: 'Capture default state styles',
        script: `() => {\n  const sel = ${selectorLiteral};\n  const key = '${keyBase}-default';\n  const state = window.__seStateCapture.captureCurrentState(sel);\n  window.__seStateCapture.storeState(key, state);\n  return { ok: !!state?.ok, key, selector: sel };\n}`
      });

      if (canHover) {
        actions.push({
          action: 'hover',
          instruction: 'Trigger hover state',
          mcpTool: { name: 'mcp__chrome-devtools__hover', params: { uid: '<element_uid>', includeSnapshot: false } }
        });
        actions.push({
          action: 'capture_hover',
          state: 'hover',
          stateKey: `${keyBase}-hover`,
          instruction: 'Capture hover state styles',
          script: `() => {\n  const sel = ${selectorLiteral};\n  const key = '${keyBase}-hover';\n  const state = window.__seStateCapture.captureCurrentState(sel);\n  window.__seStateCapture.storeState(key, state);\n  return { ok: !!state?.ok, key, selector: sel };\n}`
        });
        actions.push({
          action: 'diff_hover',
          instruction: 'Diff default vs hover',
          script: `() => window.__seStateCapture.diffStates(\n  window.__seStateCapture.getStoredState('${keyBase}-default'),\n  window.__seStateCapture.getStoredState('${keyBase}-hover')\n)`
        });
      }

      if (canFocus) {
        actions.push({
          action: 'focus',
          instruction: 'Trigger focus state via script (avoids click side-effects)',
          note: 'If focus fails, the script will temporarily add tabindex=-1.',
          script: `() => {\n  const sel = ${selectorLiteral};\n  const el = document.querySelector(sel);\n  if (!el) return { ok: false, error: 'Element not found', selector: sel };\n  try {\n    if (!el.hasAttribute('tabindex') && el.tabIndex < 0) el.setAttribute('tabindex', '-1');\n    el.focus({ preventScroll: true });\n    return { ok: true, selector: sel };\n  } catch (e) {\n    return { ok: false, error: String(e), selector: sel };\n  }\n}`
        });
        actions.push({
          action: 'capture_focus',
          state: 'focus',
          stateKey: `${keyBase}-focus`,
          instruction: 'Capture focus state styles',
          script: `() => {\n  const sel = ${selectorLiteral};\n  const key = '${keyBase}-focus';\n  const state = window.__seStateCapture.captureCurrentState(sel);\n  window.__seStateCapture.storeState(key, state);\n  return { ok: !!state?.ok, key, selector: sel };\n}`
        });
        actions.push({
          action: 'diff_focus',
          instruction: 'Diff default vs focus',
          script: `() => window.__seStateCapture.diffStates(\n  window.__seStateCapture.getStoredState('${keyBase}-default'),\n  window.__seStateCapture.getStoredState('${keyBase}-focus')\n)`
        });
      }

      if (canClick) {
        actions.push({
          action: 'click',
          instruction: 'Trigger active/click state (may navigate)',
          note: 'Use with caution on links; consider preventDefault or new tab.',
          mcpTool: { name: 'mcp__chrome-devtools__click', params: { uid: '<element_uid>', includeSnapshot: false } }
        });
        actions.push({
          action: 'capture_active',
          state: 'active',
          stateKey: `${keyBase}-active`,
          instruction: 'Capture active/click state styles',
          script: `() => {\n  const sel = ${selectorLiteral};\n  const key = '${keyBase}-active';\n  const state = window.__seStateCapture.captureCurrentState(sel);\n  window.__seStateCapture.storeState(key, state);\n  return { ok: !!state?.ok, key, selector: sel };\n}`
        });
        actions.push({
          action: 'diff_active',
          instruction: 'Diff default vs active',
          script: `() => window.__seStateCapture.diffStates(\n  window.__seStateCapture.getStoredState('${keyBase}-default'),\n  window.__seStateCapture.getStoredState('${keyBase}-active')\n)`
        });
      }

      if (includeScreenshot) {
        actions.push({
          action: 'screenshot',
          instruction: 'Capture a viewport screenshot after state interactions',
          note: 'Optional: take_screenshot can be flaky on some setups. Skip this step if it times out.',
          mcpTool: { name: 'mcp__chrome-devtools__take_screenshot', params: {} }
        });
      }

      return actions;
    }

    const interactiveRoles = new Set([
      'button', 'link', 'menuitem', 'tab', 'checkbox', 'radio', 'switch',
      'combobox', 'textbox', 'option'
    ]);
    const interactiveTags = new Set(['button', 'a', 'input', 'select', 'textarea']);
    const interactiveComponents = new Set([
      'button', 'navItem', 'input', 'submitButton', 'checkbox', 'radio', 'tab', 'menu'
    ]);

    function isInteractiveNode(node) {
      if (!node) return false;
      if (node.role && interactiveRoles.has(node.role)) return true;
      if (node.semanticRole && interactiveRoles.has(node.semanticRole)) return true;
      if (node.tag && interactiveTags.has(node.tag)) return true;
      if (node.component?.type && interactiveComponents.has(node.component.type)) return true;
      return false;
    }

    function visit(node) {
      if (!node) return;
      if (plan.summary.targetLimitReached) return;
      if (node.state?.hasInteractiveStates) {
        addTarget(node, node.selector, 'state-summary', null);
      } else if (isInteractiveNode(node)) {
        addTarget(node, node.selector, 'heuristic', null);
      }
      if (node.children) node.children.forEach(visit);
    }

    visit(tree);
    if (Array.isArray(stateData?.selectors)) {
      for (const selector of stateData.selectors) {
        if (plan.summary.targetLimitReached) break;
        const resolved = resolveSelector(selector);
        const candidates = resolved ? nodeIndex.bySelector.get(resolved) : null;
        const node = candidates?.[0] || null;
        const stateInfo = stateData?.captured?.states?.[selector] || stateData?.fallback?.[selector] || null;
        addTarget(node, resolved || selector, 'state-selector', stateInfo);
      }
    }

    if (Array.isArray(stateData?.mcpCommands)) {
      for (const cmd of stateData.mcpCommands) {
        if (plan.summary.targetLimitReached) break;
        const selector = cmd?.element?.selector || cmd?.selector || null;
        if (!selector) continue;
        const resolved = resolveSelector(selector);
        const candidates = resolved ? nodeIndex.bySelector.get(resolved) : null;
        const node = candidates?.[0] || null;
        const stateInfo = stateData?.captured?.states?.[selector] || stateData?.fallback?.[selector] || null;
        addTarget(node, resolved || selector, 'mcp-command', stateInfo);
      }
    }

    plan.summary.targetCount = plan.targets.length;
    plan.summary.priority = { high: 0, medium: 0, low: 0 };
    for (const target of plan.targets) {
      const level = target?.priority?.level || 'low';
      if (level === 'high') plan.summary.priority.high += 1;
      else if (level === 'medium') plan.summary.priority.medium += 1;
      else plan.summary.priority.low += 1;
    }
    if (plan.targets.length > 0) {
      const componentMap = new Map();
      const sectionMap = new Map();
      const componentTypeMap = new Map();
      const roleMap = new Map();

      for (const target of plan.targets) {
        const component = target.component || null;
        const section = target.section || null;
        const role = target.semanticRole || null;

        if (component?.id) {
          if (!componentMap.has(component.id)) {
            componentMap.set(component.id, {
              componentId: component.id,
              type: component.type || null,
              variant: component.variant || null,
              sectionId: section?.id || null,
              targetCount: 0,
              selectors: []
            });
          }
          const entry = componentMap.get(component.id);
          entry.targetCount += 1;
          pushSample(entry.selectors, target.selector);
        }

        if (section?.id) {
          if (!sectionMap.has(section.id)) {
            sectionMap.set(section.id, {
              sectionId: section.id,
              name: section.name || null,
              role: section.role || null,
              targetCount: 0,
              componentIds: [],
              selectors: []
            });
          }
          const entry = sectionMap.get(section.id);
          entry.targetCount += 1;
          if (component?.id) pushSample(entry.componentIds, component.id);
          pushSample(entry.selectors, target.selector);
        }

        if (component?.type) {
          if (!componentTypeMap.has(component.type)) {
            componentTypeMap.set(component.type, {
              type: component.type,
              targetCount: 0,
              componentIds: [],
              sectionIds: [],
              selectors: []
            });
          }
          const entry = componentTypeMap.get(component.type);
          entry.targetCount += 1;
          if (component.id) pushSample(entry.componentIds, component.id);
          if (section?.id) pushSample(entry.sectionIds, section.id);
          pushSample(entry.selectors, target.selector);
        }

        if (role) {
          if (!roleMap.has(role)) {
            roleMap.set(role, {
              role,
              targetCount: 0,
              componentIds: [],
              sectionIds: [],
              selectors: []
            });
          }
          const entry = roleMap.get(role);
          entry.targetCount += 1;
          if (component?.id) pushSample(entry.componentIds, component.id);
          if (section?.id) pushSample(entry.sectionIds, section.id);
          pushSample(entry.selectors, target.selector);
        }
      }

      plan.groups = {
        byComponent: Array.from(componentMap.values()).sort((a, b) => b.targetCount - a.targetCount),
        bySection: Array.from(sectionMap.values()).sort((a, b) => b.targetCount - a.targetCount),
        byComponentType: Array.from(componentTypeMap.values()).sort((a, b) => b.targetCount - a.targetCount),
        byRole: Array.from(roleMap.values()).sort((a, b) => b.targetCount - a.targetCount)
      };
      plan.summary.componentGroups = plan.groups.byComponent.length;
      plan.summary.sectionGroups = plan.groups.bySection.length;
      plan.summary.componentTypeGroups = plan.groups.byComponentType.length;
      plan.summary.roleGroups = plan.groups.byRole.length;

      const sortedTargets = plan.targets
        .slice()
        .sort((a, b) => (b.priority?.score || 0) - (a.priority?.score || 0));

      const recommendations = [];
      for (const target of sortedTargets) {
        if (recommendations.length >= recommendationLimit) break;
        if (!target.selector) continue;

        const reasons = [];
        if (target.priority?.level === 'high') reasons.push('high priority');
        if (target.source === 'state-selector' || target.source === 'mcp-command') reasons.push('state evidence available');
        if (target.availableStates && target.availableStates.length > 1) reasons.push('multiple states');
        if (target.section?.role === 'hero') reasons.push('hero section');
        if (target.component?.type === 'button') reasons.push('cta/button');

        const keyBase = `rec-${recommendations.length + 1}`;
        recommendations.push({
          selector: target.selector,
          priority: target.priority || null,
          component: target.component || null,
          section: target.section || null,
          tag: target.tag || null,
          semanticRole: target.semanticRole || null,
          semanticName: target.semanticName || null,
          accessibleRole: target.accessibleRole || null,
          accessibleName: target.accessibleName || null,
          availableStates: Array.isArray(target.availableStates) ? target.availableStates : null,
          reasons,
          actions: buildRecommendationActions(target, keyBase)
        });
      }

      if (recommendations.length > 0) {
        plan.recommendations = {
          total: recommendations.length,
          items: recommendations
        };
        plan.summary.recommendationCount = recommendations.length;
      }

      const workflows = [];
      const workflowTargets = recommendations.slice(0, workflowLimit);
      let step = 1;

      for (let i = 0; i < workflowTargets.length; i += 1) {
        const target = workflowTargets[i];
        const keyBase = `wf-${i + 1}`;
        const actions = buildRecommendationActions(target, keyBase, false, false);
        if (!actions.length) continue;

        const steps = actions.map(action => ({
          step: step++,
          selector: target.selector,
          ...action
        }));

        workflows.push({
          id: keyBase,
          selector: target.selector,
          priority: target.priority || null,
          component: target.component || null,
          section: target.section || null,
          steps
        });
      }

      if (workflows.length > 0) {
        const batchSteps = [];
        const serialized = [];
        let serializedCount = 0;
        let serializedMcp = 0;
        let serializedEval = 0;
        for (const wf of workflows) {
          for (const stepItem of wf.steps) {
            if (stepItem.mcpTool) {
              batchSteps.push({
                step: stepItem.step,
                type: 'mcp',
                tool: stepItem.mcpTool.name,
                params: stepItem.mcpTool.params || {},
                selector: stepItem.selector || null,
                action: stepItem.action || null,
                instruction: stepItem.instruction || null,
                note: stepItem.note || null
              });
              serialized.push({
                step: stepItem.step,
                tool: stepItem.mcpTool.name,
                params: stepItem.mcpTool.params || {},
                selector: stepItem.selector || null,
                action: stepItem.action || null
              });
              serializedCount += 1;
              serializedMcp += 1;
            }
            if (stepItem.script) {
              batchSteps.push({
                step: stepItem.step,
                type: 'script',
                code: stepItem.script,
                selector: stepItem.selector || null,
                action: stepItem.action || null,
                instruction: stepItem.instruction || null
              });
              serialized.push({
                step: stepItem.step,
                tool: 'mcp__chrome-devtools__evaluate_script',
                params: { function: stepItem.script },
                selector: stepItem.selector || null,
                action: stepItem.action || null
              });
              serializedCount += 1;
              serializedEval += 1;
            }
          }
        }

        plan.workflowsForTopTargets = {
          total: workflows.length,
          steps: workflows.flatMap(w => w.steps),
          workflows,
          batch: {
            total: batchSteps.length,
            steps: batchSteps,
            note: 'Execute sequentially in ascending step order. Each step is either an MCP tool call (type=mcp) or a page script (type=script).',
            runner: {
              language: 'javascript',
              description: 'Pseudo-runner that executes MCP tools and JS scripts sequentially.',
              script: `async function runBatch(batch, mcp, evaluateScript) {\n  for (const step of batch.steps) {\n    if (step.type === 'mcp') {\n      await mcp(step.tool, step.params || {});\n    } else if (step.type === 'script') {\n      await evaluateScript(step.code);\n    }\n  }\n}`
            },
            serialized: {
              total: serializedCount,
              mcp: serializedMcp,
              eval: serializedEval,
              steps: serialized,
              note: 'Tool call list ready for sequential execution by an agent (already in step order).'
            }
          }
        };
        plan.summary.workflowCount = workflows.length;
      }
    }
    return plan;
  }

  function getA11yInfo(el, selector, a11yIndex) {
    if (a11yIndex?.elementIndex?.has(el)) {
      return a11yIndex.elementIndex.get(el);
    }
    if (selector && a11yIndex?.selectorIndex?.has(selector)) {
      return a11yIndex.selectorIndex.get(selector);
    }
    if (window.__seA11y?.getAccessibleInfo) {
      return window.__seA11y.getAccessibleInfo(el);
    }
    return null;
  }

  const COMPONENT_ROLE_MAP = {
    header: 'header',
    navigation: 'navigation',
    navItem: 'nav-item',
    hero: 'hero',
    main: 'main',
    sidebar: 'sidebar',
    footer: 'footer',
    card: 'card',
    button: 'button',
    input: 'form-field',
    submitButton: 'form-submit',
    modal: 'dialog',
    badge: 'badge',
    list: 'list',
    heading: 'heading',
    icon: 'icon',
    checkbox: 'checkbox',
    radio: 'radio',
    tab: 'tab',
    menu: 'menu'
  };

  const TAG_ROLE_MAP = {
    a: 'link',
    header: 'header',
    nav: 'navigation',
    main: 'main',
    aside: 'sidebar',
    footer: 'footer',
    section: 'section',
    article: 'article',
    form: 'form',
    button: 'button',
    input: 'form-field',
    textarea: 'form-field',
    select: 'form-field',
    ul: 'list',
    ol: 'list',
    li: 'list-item',
    h1: 'heading',
    h2: 'heading',
    h3: 'heading',
    h4: 'heading',
    h5: 'heading',
    h6: 'heading'
  };

  function deriveSemanticRole(tag, roleAttr, componentType) {
    if (componentType && COMPONENT_ROLE_MAP[componentType]) {
      return { role: COMPONENT_ROLE_MAP[componentType], source: 'component' };
    }
    if (roleAttr) {
      return { role: roleAttr, source: 'attribute' };
    }
    if (tag && TAG_ROLE_MAP[tag]) {
      return { role: TAG_ROLE_MAP[tag], source: 'tag' };
    }
    return { role: tag || 'node', source: 'tag' };
  }

  function deriveSemanticName(node, a11yInfo) {
    if (a11yInfo?.name) return a11yInfo.name;
    if (node.ariaLabel) return node.ariaLabel;
    if (node.text) return node.text;
    return null;
  }

  function extractPseudoElements(el) {
    const result = {};

    for (const pseudo of ['::before', '::after']) {
      const ps = getComputedStyle(el, pseudo);
      // Only capture if the pseudo-element actually renders (has content)
      const content = ps.content;
      if (!content || content === 'none' || content === 'normal') continue;

      const data = {
        content: content
      };

      // Visual properties
      const color = ps.color;
      const bgColor = ps.backgroundColor;
      const bgImage = ps.backgroundImage;
      if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
        data.backgroundColor = bgColor;
      }
      if (bgImage && bgImage !== 'none') {
        data.backgroundImage = bgImage;
      }
      if (color) data.color = color;

      // Size and position
      const width = ps.width;
      const height = ps.height;
      if (width && width !== 'auto' && width !== '0px') data.width = width;
      if (height && height !== 'auto' && height !== '0px') data.height = height;

      const position = ps.position;
      if (position && position !== 'static') {
        data.position = position;
        const top = ps.top;
        const left = ps.left;
        const right = ps.right;
        const bottom = ps.bottom;
        if (top && top !== 'auto') data.top = top;
        if (left && left !== 'auto') data.left = left;
        if (right && right !== 'auto') data.right = right;
        if (bottom && bottom !== 'auto') data.bottom = bottom;
      }

      // Border & shape
      const borderRadius = ps.borderRadius;
      if (borderRadius && borderRadius !== '0px') data.borderRadius = borderRadius;

      const borderWidth = ps.borderTopWidth;
      const borderStyle = ps.borderTopStyle;
      const borderColor = ps.borderTopColor;
      if (borderWidth && borderWidth !== '0px' && borderStyle && borderStyle !== 'none') {
        data.border = { width: borderWidth, style: borderStyle, color: borderColor };
      }

      // Transform & opacity
      const transform = ps.transform;
      if (transform && transform !== 'none') data.transform = transform;
      const opacity = ps.opacity;
      if (opacity && opacity !== '1') data.opacity = opacity;

      // Box shadow
      const boxShadow = ps.boxShadow;
      if (boxShadow && boxShadow !== 'none') data.boxShadow = boxShadow;

      // Display
      const display = ps.display;
      if (display && display !== 'inline') data.display = display;

      // Typography (for text pseudo-elements like counters)
      if (content !== '""' && content !== "''") {
        const fontSize = ps.fontSize;
        const fontWeight = ps.fontWeight;
        const fontFamily = ps.fontFamily;
        if (fontSize) data.fontSize = fontSize;
        if (fontWeight && fontWeight !== '400' && fontWeight !== 'normal') data.fontWeight = fontWeight;
        if (fontFamily) data.fontFamily = fontFamily;
      }

      // Transition
      const transitionDuration = ps.transitionDuration;
      if (transitionDuration && transitionDuration !== '0s') {
        data.transition = {
          property: ps.transitionProperty,
          duration: transitionDuration,
          timingFunction: ps.transitionTimingFunction
        };
      }

      const key = pseudo === '::before' ? 'before' : 'after';
      result[key] = cleanObject(data);
    }

    return Object.keys(result).length > 0 ? result : null;
  }

  function buildVarRefs(node, cssVarMap) {
    if (!cssVarMap || !node) return null;
    const refs = {};

    function lookup(value) {
      if (!value || typeof value !== 'string') return null;
      const entry = cssVarMap[value];
      if (entry) return entry.varName;
      // Try color normalization if __seCSS is available
      const normalized = window.__seCSS?.normalizeColorValue?.(value);
      if (normalized && cssVarMap[normalized]) return cssVarMap[normalized].varName;
      return null;
    }

    // Visual properties
    if (node.visual) {
      const v = node.visual;
      const colorRef = lookup(v.color);
      if (colorRef) refs.color = colorRef;
      const bgRef = lookup(v.backgroundColor);
      if (bgRef) refs.backgroundColor = bgRef;
      const radiusRef = lookup(v.borderRadius);
      if (radiusRef) refs.borderRadius = radiusRef;
      // Border color
      if (v.border) {
        const borderColorRef = v.border.color ? lookup(v.border.color) : null;
        if (borderColorRef) refs.borderColor = borderColorRef;
      }
      const shadowRef = lookup(v.boxShadow);
      if (shadowRef) refs.boxShadow = shadowRef;
    }

    // Typography properties
    if (node.typography) {
      const t = node.typography;
      const fontSizeRef = lookup(t.fontSize);
      if (fontSizeRef) refs.fontSize = fontSizeRef;
      const fontFamilyRef = lookup(t.fontFamily);
      if (fontFamilyRef) refs.fontFamily = fontFamilyRef;
      const lineHeightRef = lookup(t.lineHeight);
      if (lineHeightRef) refs.lineHeight = lineHeightRef;
      const letterSpacingRef = lookup(t.letterSpacing);
      if (letterSpacingRef) refs.letterSpacing = letterSpacingRef;
    }

    // Spacing (padding, margin, gap)
    if (node.constraints?.spacing) {
      const sp = node.constraints.spacing;
      if (sp.gap) {
        const gapRef = lookup(sp.gap);
        if (gapRef) refs.gap = gapRef;
      }
    }

    return Object.keys(refs).length > 0 ? refs : null;
  }

  function buildNode(el, depth, parentRect, indexes, options, stats) {
    if (!el || el.nodeType !== 1) return null;
    if (depth > options.maxDepth) return null;
    if (stats.count >= options.maxNodes) {
      stats.truncated = true;
      return null;
    }

    const tag = el.tagName.toLowerCase();
    if (options.skipTags.includes(tag)) return null;

    const rect = getRect(el);
    const hasChildren = el.children && el.children.length > 0;
    const visible = isVisible(el);
    const tooSmall = rect.width < options.minWidth || rect.height < options.minHeight;

    if (!visible && !hasChildren) return null;
    if (tooSmall && !hasChildren) return null;

    const s = options.includeStyles ? getStyle(el) : null;
    const selector = cssPath(el);
    const a11yInfo = getA11yInfo(el, selector, indexes.a11y);

    stats.count += 1;
    const node = {
      uid: `n${stats.count}`,
      tag,
      selector
    };

    if (el.id) node.domId = el.id;
    const role = el.getAttribute('role');
    if (role) node.role = role;
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) node.ariaLabel = ariaLabel;

    // Key attributes that materially affect replica fidelity.
    if (tag === 'a') {
      const href = el.getAttribute('href');
      if (href) node.href = href;
      const target = el.getAttribute('target');
      if (target) node.target = target;
      const rel = el.getAttribute('rel');
      if (rel) node.rel = rel;
    } else if (tag === 'img') {
      const src = el.currentSrc || el.src || el.getAttribute('src');
      if (src) node.src = src;
      const alt = el.getAttribute('alt');
      if (alt) node.alt = alt;
      const loading = el.getAttribute('loading');
      if (loading) node.loading = loading;
    } else if (tag === 'input' || tag === 'textarea') {
      const type = tag === 'input' ? el.getAttribute('type') : null;
      if (type) node.inputType = type;
      const name = el.getAttribute('name');
      if (name) node.name = name;
      const placeholder = el.getAttribute('placeholder');
      if (placeholder) node.placeholder = placeholder;
      const autoComplete = el.getAttribute('autocomplete');
      if (autoComplete) node.autoComplete = autoComplete;
    } else if (tag === 'button') {
      const type = el.getAttribute('type');
      if (type) node.buttonType = type;
    }
    if (a11yInfo?.role) node.accessibleRole = a11yInfo.role;
    if (a11yInfo?.name) node.accessibleName = a11yInfo.name;
    if (a11yInfo?.states && Object.keys(a11yInfo.states).length > 0) {
      node.accessibleStates = a11yInfo.states;
    }

    if (options.includeText) {
      const text = clampText(el.innerText || el.textContent);
      if (text && (!hasChildren || tag === 'button' || tag === 'a')) {
        node.text = text;
      }
    }

    // Provide a lightweight hint for icon-only UI (SVG-heavy sites).
    if (!node.text) {
      try {
        // Avoid attaching a random descendant SVG to large container nodes (body/sections, etc.).
        const isIconSized = rect && rect.width <= 120 && rect.height <= 120 && rect.width >= 8 && rect.height >= 8;
        const isInteractiveIcon = (tag === 'button' || tag === 'a') && (ariaLabel || a11yInfo?.name);
        if (!isIconSized && !isInteractiveIcon) {
          // Skip icon hinting for non-icon-like containers.
        } else {
          const svg = el.querySelector?.(':scope > svg') || el.querySelector?.('svg');
          if (!svg) {
            // no icon found
          } else {

            const sanitizeSvgMarkup = (markup) => {
              if (!markup) return null;
              return String(markup)
                .replace(/<script[\s\S]*?<\/script>/gi, '')
                .replace(/\son\w+\s*=\s*(\"[^\"]*\"|'[^']*')/gi, '')
                .trim();
            };

            const viewBox = svg.getAttribute('viewBox');
            let markup = null;
            try {
              const svgRect = svg.getBoundingClientRect();
              const area = svgRect.width * svgRect.height;
              const pathCount = svg.querySelectorAll('path, circle, rect, line, polyline, polygon, use').length;
              const outer = sanitizeSvgMarkup(svg.outerHTML);
              // Only embed the full markup for small, icon-like SVGs to avoid bloating the blueprint.
              if (outer && outer.length <= 2400 && pathCount <= 14 && area > 0 && area <= 6400) {
                markup = outer.replace(/\s+/g, ' ');
              }
            } catch {
              // ignore
            }

            node.icon = cleanObject({
              type: 'svg',
              viewBox: viewBox || null,
              markup
            });
          }
        }
      } catch {
        // ignore
      }
    }

    if (tag.match(/^h[1-6]$/)) {
      node.headingLevel = parseInt(tag.replace('h', ''), 10);
    }

    node.rect = rect;

    if (s) {
      node.layout = extractLayout(s);
      node.constraints = extractConstraints(rect, s, parentRect);
      const typography = extractTypography(s);
      if (Object.keys(typography).length > 0) node.typography = typography;
      const visual = extractVisual(s);
      if (Object.keys(visual).length > 0) node.visual = visual;
    }

    // Capture ::before and ::after pseudo-element styles in default state.
    // Many sites use pseudo-elements for decorative indicators that are always present.
    if (s) {
      const pseudos = extractPseudoElements(el);
      if (pseudos) {
        node.pseudoElements = pseudos;
      }
    }

    // Annotate computed values with CSS variable references
    if (indexes.cssVarMap) {
      const varRefs = buildVarRefs(node, indexes.cssVarMap);
      if (varRefs && Object.keys(varRefs).length > 0) {
        node.varRefs = varRefs;
      }
    }

    const component = indexes.components.elementIndex.get(el) ||
      (selector ? indexes.components.selectorIndex.get(selector) : null);

    if (component) {
      node.component = {
        id: component.id,
        type: component.type,
        variant: component.variant || null,
        text: component.text || null,
        detectionMethod: component.detectionMethod || null
      };
    }

    const stateSummary = indexes.states.elementIndex.get(el) ||
      (selector ? indexes.states.selectorIndex.get(selector) : null);

    if (stateSummary) {
      node.state = {
        hasInteractiveStates: !!stateSummary.hasInteractiveStates,
        stateDescriptions: stateSummary.stateDescriptions || null,
        keyChanges: (stateSummary.keyChanges || []).slice(0, 6)
      };
    }

    const stateEvidence = indexes.states.evidenceElementIndex?.get?.(el) ||
      (selector ? indexes.states.evidenceSelectorIndex?.get?.(selector) : null);

    if (stateEvidence) {
      if (!node.state) node.state = {};
      node.state.capturedStates = stateEvidence.stateNames || null;
      if (stateEvidence.pseudo) node.state.pseudo = stateEvidence.pseudo;
      if (stateEvidence.descendantEvidenceCount) {
        node.state.descendantEvidenceCount = stateEvidence.descendantEvidenceCount;
      }
    }

    const semantic = deriveSemanticRole(tag, role, component?.type);
    if (semantic?.role) {
      node.semanticRole = semantic.role;
      node.semanticSource = semantic.source;
    }
    const semanticName = deriveSemanticName(node, a11yInfo);
    if (semanticName) {
      node.semanticName = semanticName;
    }

    if (hasChildren && depth < options.maxDepth) {
      const children = [];
      for (const child of el.children) {
        const childNode = buildNode(child, depth + 1, rect, indexes, options, stats);
        if (childNode) children.push(childNode);
        if (stats.count >= options.maxNodes) break;
      }
      if (children.length > 0) node.children = children;
    }

    return node;
  }

  function collectComponentBindings(tree) {
    const map = new Map();

    function visit(node) {
      if (!node) return;
      if (node.component?.id) {
        if (!map.has(node.component.id)) map.set(node.component.id, []);
        map.get(node.component.id).push(node.uid);
      }
      if (node.children) node.children.forEach(visit);
    }

    visit(tree);
    return map;
  }

  function buildComponentContext(tree) {
    const context = new Map();

    function visit(node, activeComponent) {
      if (!node) return;
      const nextComponent = node.component || activeComponent || null;
      if (node.uid) context.set(node.uid, nextComponent);
      if (node.children) node.children.forEach(child => visit(child, nextComponent));
    }

    visit(tree, null);
    return context;
  }

  function buildSectionIndex(sections) {
    const componentToSections = new Map();
    const list = Array.isArray(sections) ? sections : [];

    for (const section of list) {
      if (!section?.components) continue;
      for (const componentId of section.components) {
        if (!componentId) continue;
        if (!componentToSections.has(componentId)) componentToSections.set(componentId, []);
        componentToSections.get(componentId).push(section);
      }
    }

    return { sections: list, componentToSections };
  }

  function resolveSectionForNode(node, componentInfo, sectionIndex) {
    if (!sectionIndex) return null;

    if (componentInfo?.id && sectionIndex.componentToSections?.has(componentInfo.id)) {
      const sections = sectionIndex.componentToSections.get(componentInfo.id);
      if (sections?.length) return sections[0];
    }

    if (!node?.rect || !sectionIndex.sections?.length) return null;
    return sectionIndex.sections.find(section => rectContains(section.rect, node.rect)) || null;
  }

  function createNodeIndex(tree) {
    const index = {
      list: [],
      bySelector: new Map()
    };

    function visit(node) {
      if (!node) return;
      index.list.push(node);
      if (node.selector) {
        if (!index.bySelector.has(node.selector)) {
          index.bySelector.set(node.selector, []);
        }
        index.bySelector.get(node.selector).push(node);
      }
      if (node.children) node.children.forEach(visit);
    }

    visit(tree);
    return index;
  }

  function rectDistance(a, b) {
    if (!a || !b) return Infinity;
    return (
      Math.abs(a.x - b.x) +
      Math.abs(a.y - b.y) +
      Math.abs(a.width - b.width) +
      Math.abs(a.height - b.height)
    );
  }

  function findNodeByRect(candidates, rect, tolerance = 6) {
    if (!rect || !candidates || candidates.length === 0) return null;
    let best = null;
    let bestScore = Infinity;

    for (const node of candidates) {
      if (!node?.rect) continue;
      const dx = Math.abs(node.rect.x - rect.x);
      const dy = Math.abs(node.rect.y - rect.y);
      const dw = Math.abs(node.rect.width - rect.width);
      const dh = Math.abs(node.rect.height - rect.height);
      if (dx > tolerance || dy > tolerance || dw > tolerance * 2 || dh > tolerance * 2) continue;
      const score = dx + dy + dw + dh;
      if (score < bestScore) {
        best = node;
        bestScore = score;
      }
    }

    return best;
  }

  function findNodeByText(candidates, text) {
    if (!text || !candidates || candidates.length === 0) return null;
    const normalized = text.trim().toLowerCase();
    if (!normalized || normalized.length < 4) return null;

    for (const node of candidates) {
      if (!node?.text) continue;
      const nodeText = node.text.trim().toLowerCase();
      if (!nodeText) continue;
      if (nodeText === normalized || nodeText.includes(normalized) || normalized.includes(nodeText)) {
        return node;
      }
    }

    return null;
  }

  function applyComponentBindingsFallback(components, bindings, nodeIndex) {
    if (!components || components.length === 0 || !nodeIndex) return bindings;

    for (const component of components) {
      if (!component || bindings.has(component.id)) continue;

      let candidateNodes = [];
      if (component.selector && nodeIndex.bySelector.has(component.selector)) {
        candidateNodes = nodeIndex.bySelector.get(component.selector) || [];
      }

      const unboundCandidates = candidateNodes.filter(node => !node.component);
      let node = null;

      if (unboundCandidates.length > 0) {
        node = findNodeByRect(unboundCandidates, component.rect) ||
          findNodeByText(unboundCandidates, component.text) ||
          unboundCandidates[0];
      } else if (candidateNodes.length > 0) {
        node = findNodeByRect(candidateNodes, component.rect) ||
          findNodeByText(candidateNodes, component.text) ||
          candidateNodes[0];
      }

      if (!node && component.rect) {
        const freeNodes = nodeIndex.list.filter(item => !item.component);
        node = findNodeByRect(freeNodes, component.rect) ||
          findNodeByRect(nodeIndex.list, component.rect);
      }

      if (!node && component.text) {
        const freeNodes = nodeIndex.list.filter(item => !item.component);
        node = findNodeByText(freeNodes, component.text) ||
          findNodeByText(nodeIndex.list, component.text);
      }

      if (node) {
        bindings.set(component.id, [node.uid]);
        if (!node.component) {
          node.component = {
            id: component.id,
            type: component.type,
            variant: component.variant || null,
            text: component.text || null,
            detectionMethod: component.detectionMethod || null
          };
        }
      }
    }

    return bindings;
  }

  function clusterPositions(items, tolerance = 6) {
    if (!items || items.length === 0) return [];
    const sorted = items.slice().sort((a, b) => a.value - b.value);
    const groups = [];

    for (const item of sorted) {
      const last = groups[groups.length - 1];
      if (!last) {
        groups.push({ mean: item.value, items: [item] });
        continue;
      }
      if (Math.abs(item.value - last.mean) <= tolerance) {
        last.items.push(item);
        last.mean = last.items.reduce((sum, i) => sum + i.value, 0) / last.items.length;
      } else {
        groups.push({ mean: item.value, items: [item] });
      }
    }

    return groups;
  }

  function labelAxisGroup(mean, parentStart, parentSize, axis) {
    if (!parentSize || parentSize <= 0) return axis === 'x' ? 'center' : 'middle';
    const ratio = (mean - parentStart) / parentSize;
    if (axis === 'x') {
      if (ratio < 0.33) return 'left';
      if (ratio > 0.66) return 'right';
      return 'center';
    }
    if (ratio < 0.33) return 'top';
    if (ratio > 0.66) return 'bottom';
    return 'middle';
  }

  function inferFlowDirection(parentNode, children) {
    if (parentNode?.layout?.flex?.direction) {
      return parentNode.layout.flex.direction.includes('column') ? 'y' : 'x';
    }
    if (parentNode?.layout?.grid) return 'grid';

    if (!children || children.length < 2) return 'y';
    let totalDx = 0;
    let totalDy = 0;
    for (let i = 1; i < children.length; i++) {
      totalDx += Math.abs(children[i].rect.x - children[i - 1].rect.x);
      totalDy += Math.abs(children[i].rect.y - children[i - 1].rect.y);
    }
    return totalDx > totalDy ? 'x' : 'y';
  }

  function parseGridCount(template) {
    if (!template || template === 'none') return null;
    const repeatMatch = template.match(/repeat\((\d+),/);
    if (repeatMatch) return parseInt(repeatMatch[1], 10);
    const parts = template.split(/\s+/).filter(Boolean);
    return parts.length || null;
  }

  function buildRelationships(tree) {
    const relationships = {
      order: [],
      alignments: [],
      flex: [],
      grid: [],
      overlays: []
    };

    function visit(node) {
      if (!node?.children || node.children.length === 0) return;
      const children = node.children.filter(child => child?.rect);
      if (children.length === 0) return;

      const flow = inferFlowDirection(node, children);
      const ordered = children
        .slice()
        .sort((a, b) => {
          if (flow === 'x') return a.rect.x - b.rect.x;
          return a.rect.y - b.rect.y;
        })
        .map(child => child.uid);

      relationships.order.push({
        parentId: node.uid,
        flow,
        method: 'visual',
        ordered
      });

      const parentRect = node.rect;
      const centerXs = children.map(child => ({
        id: child.uid,
        value: child.rect.x + child.rect.width / 2
      }));
      const centerYs = children.map(child => ({
        id: child.uid,
        value: child.rect.y + child.rect.height / 2
      }));

      const groupsX = clusterPositions(centerXs);
      const groupsY = clusterPositions(centerYs);

      if (groupsX.length > 0 || groupsY.length > 0) {
        relationships.alignments.push({
          parentId: node.uid,
          x: groupsX.map(group => ({
            position: labelAxisGroup(group.mean, parentRect.x, parentRect.width, 'x'),
            mean: Math.round(group.mean),
            nodeIds: group.items.map(item => item.id)
          })),
          y: groupsY.map(group => ({
            position: labelAxisGroup(group.mean, parentRect.y, parentRect.height, 'y'),
            mean: Math.round(group.mean),
            nodeIds: group.items.map(item => item.id)
          }))
        });
      }

      if (node.layout?.flex) {
        relationships.flex.push({
          containerId: node.uid,
          direction: node.layout.flex.direction,
          wrap: node.layout.flex.wrap,
          justify: node.layout.flex.justify,
          align: node.layout.flex.align,
          gap: node.layout.flex.gap || null,
          childIds: children.map(child => child.uid)
        });
      }

      if (node.layout?.grid) {
        relationships.grid.push({
          containerId: node.uid,
          columns: parseGridCount(node.layout.grid.columns),
          rows: parseGridCount(node.layout.grid.rows),
          gap: node.layout.grid.gap || null,
          childIds: children.map(child => child.uid)
        });
      }

      const overlays = children
        .filter(child => child.layout?.position === 'absolute' || child.layout?.position === 'fixed')
        .map(child => child.uid);
      if (overlays.length > 0) {
        relationships.overlays.push({
          parentId: node.uid,
          overlayIds: overlays
        });
      }

      children.forEach(visit);
    }

    visit(tree);
    return relationships;
  }

  function rectContains(outer, inner) {
    if (!outer || !inner) return false;
    const cx = inner.x + inner.width / 2;
    const cy = inner.y + inner.height / 2;
    return (
      cx >= outer.x - 2 &&
      cx <= outer.x + outer.width + 2 &&
      cy >= outer.y - 2 &&
      cy <= outer.y + outer.height + 2
    );
  }

  function buildSections(boundaries, components) {
    if (!Array.isArray(boundaries)) return [];
    const sections = [];

    boundaries.forEach((boundary, index) => {
      const sectionId = `section-${index + 1}`;
      const componentIds = [];
      for (const component of components) {
        if (rectContains(boundary.rect, component.rect)) {
          componentIds.push(component.id);
        }
      }

      sections.push({
        id: sectionId,
        name: boundary.name || 'Section',
        semanticRole: boundary.name ? boundary.name.toLowerCase() : 'section',
        selector: boundary.selector || null,
        rect: boundary.rect || null,
        components: componentIds
      });
    });

    return sections;
  }

  function extractTokens(stylekit) {
    const tokens = stylekit?.normalized?.tokens || stylekit?.tokens || null;
    if (!tokens || typeof tokens !== 'object') return null;

    return {
      colors: tokens.colors?.semantic || tokens.colors?.palette || null,
      typography: tokens.typography || null,
      spacing: tokens.spacing || null,
      radii: tokens.borders?.radius || null,
      shadows: tokens.shadows || null,
      motion: tokens.motion || null
    };
  }

  function summarizeResponsive(responsive) {
    if (!responsive) return null;

    const breakpoints = responsive.breakpoints || null;
    let variants = null;
    let viewportWorkflow = responsive.viewportWorkflow || null;

    // Provide agent-friendly tool-call serialization for the viewport workflow.
    // This mirrors the interaction workflow "serialized.steps" format so runners can execute it sequentially.
    function serializeViewportWorkflow(workflow) {
      if (!workflow || typeof workflow !== 'object') return null;
      const steps = Array.isArray(workflow.steps) ? workflow.steps : [];
      if (!steps.length) return null;

      const serialized = [];
      let serializedCount = 0;
      let serializedMcp = 0;
      let serializedEval = 0;

      for (const step of steps) {
        if (step?.mcpTool?.name) {
          serialized.push({
            step: step.step ?? null,
            tool: step.mcpTool.name,
            params: step.mcpTool.params || {},
            action: step.action || null,
            viewport: step.viewport || null
          });
          serializedCount += 1;
          serializedMcp += 1;
        }
        if (step?.script) {
          serialized.push({
            step: step.step ?? null,
            tool: 'mcp__chrome-devtools__evaluate_script',
            params: { function: step.script },
            action: step.action || null,
            viewport: step.viewport || null
          });
          serializedCount += 1;
          serializedEval += 1;
        }
      }

      return {
        total: serializedCount,
        mcp: serializedMcp,
        eval: serializedEval,
        steps: serialized,
        note: 'Tool call list ready for sequential execution (viewport workflow).'
      };
    }

    if (viewportWorkflow && typeof viewportWorkflow === 'object' && Array.isArray(viewportWorkflow.steps)) {
      const existing = viewportWorkflow.serialized || null;
      const serialized = existing || serializeViewportWorkflow(viewportWorkflow);
      viewportWorkflow = {
        ...viewportWorkflow,
        serialized: serialized || existing || null
      };
    }

    if (window.__seResponsive?.getAllStoredLayouts) {
      try {
        const stored = window.__seResponsive.getAllStoredLayouts();
        const entries = stored ? Object.entries(stored) : [];
        if (entries.length > 0) {
          variants = {
            layouts: {},
            comparisons: []
          };
          entries.forEach(([name, layout]) => {
            variants.layouts[name] = {
              viewport: layout.viewport,
              breakpoint: layout.breakpoint,
              gridCount: layout.gridLayouts?.length || 0,
              flexCount: layout.flexLayouts?.length || 0,
              visibilityChanges: layout.visibilityStates?.length || 0,
              sizingChanges: layout.sizingInfo?.length || 0
            };
          });

          if (entries.length >= 2 && window.__seResponsive.compareLayouts) {
            for (let i = 0; i < entries.length; i += 1) {
              for (let j = i + 1; j < entries.length; j += 1) {
                const [nameA, layoutA] = entries[i];
                const [nameB, layoutB] = entries[j];
                const diff = window.__seResponsive.compareLayouts(layoutA, layoutB);
                if (diff) {
                  variants.comparisons.push({
                    from: nameA,
                    to: nameB,
                    summary: diff.summary,
                    layoutChanges: diff.layoutChanges?.slice(0, 10) || [],
                    visibilityChanges: diff.visibilityChanges?.slice(0, 10) || [],
                    sizingChanges: diff.sizingChanges?.slice(0, 10) || []
                  });
                }
              }
            }
          }
        }
      } catch (e) {
        logger.warn('Failed to summarize responsive variants:', e.message);
      }
    }

    return {
      breakpoints: breakpoints?.breakpoints || breakpoints || null,
      named: breakpoints?.named || null,
      viewportWorkflow,
      responsiveDoc: responsive.responsiveDoc || null,
      variants
    };
  }

  function summarizeLayout(structure) {
    if (!structure?.layout) return null;

    const layout = structure.layout;
    const summary = layout.summary || {};

    const topFlex = (layout.patterns?.flex || [])
      .slice(0, 8)
      .map(item => ({
        selector: item.selector,
        rect: item.rect,
        direction: item.direction,
        justify: item.justify,
        align: item.align,
        gap: item.gap
      }));

    const topGrid = (layout.patterns?.grid || [])
      .slice(0, 8)
      .map(item => ({
        selector: item.selector,
        rect: item.rect,
        columns: item.columns,
        rows: item.rows,
        gap: item.gap
      }));

    return {
      summary,
      flexContainers: topFlex,
      gridContainers: topGrid
    };
  }

  function rectArea(rect) {
    if (!rect) return 0;
    const w = Number(rect.width);
    const h = Number(rect.height);
    if (!Number.isFinite(w) || !Number.isFinite(h)) return 0;
    return Math.max(0, w) * Math.max(0, h);
  }

  function parseZIndex(value) {
    if (value === null || value === undefined) return null;
    const s = String(value).trim();
    if (!s || s === 'auto') return null;
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : null;
  }

  function walkNodeTree(tree, fn) {
    function visit(node, depth) {
      if (!node) return;
      fn(node, depth);
      const children = Array.isArray(node.children) ? node.children : [];
      for (const child of children) {
        visit(child, depth + 1);
      }
    }

    visit(tree, 0);
  }

  function detectStackingContexts(tree) {
    if (!tree) return null;

    const rootArea = tree?.rect ? rectArea(tree.rect) : null;
    const contexts = [];

    walkNodeTree(tree, (node, depth) => {
      const layout = node?.layout || null;
      const visual = node?.visual || null;
      const reasons = [];

      if (layout?.isolation === 'isolate') reasons.push('isolation:isolate');
      if (layout?.position && layout.position !== 'static' && layout?.zIndex) reasons.push('position+z-index');

      const opacity = visual?.opacity ? String(visual.opacity).trim() : '';
      if (opacity && opacity !== '1') reasons.push('opacity');

      const transform = visual?.transform ? String(visual.transform).trim() : '';
      if (transform && transform !== 'none') reasons.push('transform');

      const filter = visual?.filter ? String(visual.filter).trim() : '';
      if (filter && filter !== 'none') reasons.push('filter');

      const backdrop = visual?.backdropFilter ? String(visual.backdropFilter).trim() : '';
      if (backdrop && backdrop !== 'none') reasons.push('backdrop-filter');

      const blend = visual?.mixBlendMode ? String(visual.mixBlendMode).trim() : '';
      if (blend && blend !== 'normal') reasons.push('mix-blend-mode');

      if (reasons.length === 0) return;

      const rect = node?.rect || null;
      const area = rect ? rectArea(rect) : 0;
      const zIndexNum = parseZIndex(layout?.zIndex);
      contexts.push({
        uid: node?.uid || null,
        selector: node?.selector || null,
        rect,
        depth,
        area,
        areaRatio: rootArea ? Math.round((area / rootArea) * 10000) / 10000 : null,
        position: layout?.position || 'static',
        zIndex: layout?.zIndex || null,
        zIndexNum,
        isolation: layout?.isolation || null,
        reasons
      });
    });

    if (contexts.length === 0) return null;

    contexts.sort((a, b) => {
      const az = Number.isFinite(a.zIndexNum) ? a.zIndexNum : -Infinity;
      const bz = Number.isFinite(b.zIndexNum) ? b.zIndexNum : -Infinity;
      if (bz !== az) return bz - az;
      if ((b.area || 0) !== (a.area || 0)) return (b.area || 0) - (a.area || 0);
      return (a.depth || 0) - (b.depth || 0);
    });

    const top = contexts.slice(0, 32).map((c) => ({
      uid: c.uid,
      selector: c.selector,
      rect: c.rect || null,
      position: c.position || null,
      zIndex: c.zIndex || null,
      zIndexNum: c.zIndexNum,
      isolation: c.isolation || null,
      reasons: c.reasons,
      areaRatio: c.areaRatio
    }));

    const overlayCandidates = top
      .filter((c) => {
        const pos = String(c.position || '').toLowerCase();
        const z = Number.isFinite(c.zIndexNum) ? c.zIndexNum : null;
        if (pos === 'fixed' || pos === 'sticky') return true;
        if (pos === 'absolute' && z !== null && z >= 10) return true;
        if (z !== null && z >= 50) return true;
        return false;
      })
      .slice(0, 12);

    return {
      count: contexts.length,
      top,
      overlayCandidates,
      note: 'Stacking contexts are approximate. Within the same context, paint order follows DOM order; higher z-index generally renders above lower.'
    };
  }

  function extractUrlsFromCssImage(value) {
    const v = value === null || value === undefined ? '' : String(value);
    if (!v || v === 'none') return [];
    const urls = [];
    const re = /url\\(([^)]+)\\)/g;
    let m = null;
    while ((m = re.exec(v))) {
      const raw = (m[1] || '').trim().replace(/^['"]|['"]$/g, '');
      if (raw) urls.push(raw);
      if (urls.length >= 16) break;
    }
    return urls;
  }

  function parseSrcsetUrls(srcset) {
    const v = srcset === null || srcset === undefined ? '' : String(srcset).trim();
    if (!v) return [];
    const out = [];
    for (const part of v.split(',')) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const first = trimmed.split(/\s+/)[0];
      if (first) out.push(first);
      if (out.length >= 12) break;
    }
    return out;
  }

  function normalizeAssetUrl(rawUrl) {
    const v = rawUrl === null || rawUrl === undefined ? '' : String(rawUrl).trim();
    if (!v) return null;
    const cleaned = v.replace(/^['"]|['"]$/g, '');
    if (!cleaned) return null;
    if (cleaned.startsWith('data:')) return cleaned;
    if (cleaned.startsWith('blob:')) return cleaned;
    try {
      return new URL(cleaned, location.href).href;
    } catch {
      return cleaned;
    }
  }

  function extractAssetManifest(tree, options = {}) {
    const maxAssets = Number.isFinite(options.maxAssets) ? options.maxAssets : 220;
    const items = [];
    const seen = new Set();
    const byType = { image: 0, video: 0, svg: 0, background: 0, other: 0 };

    const add = (rawUrl, type, source, selector) => {
      if (items.length >= maxAssets) return;
      const url = normalizeAssetUrl(rawUrl);
      if (!url) return;
      if (seen.has(url)) return;
      seen.add(url);

      const t = type || 'other';
      if (!(t in byType)) byType.other += 1;
      else byType[t] += 1;

      items.push({
        url,
        type: t,
        source: source || null,
        selector: selector || null
      });
    };

    // Tag-based assets (high signal).
    try {
      document.querySelectorAll('img').forEach((img) => {
        if (items.length >= maxAssets) return;
        const sel = cssPath(img);
        add(img.currentSrc || img.src || img.getAttribute('src'), 'image', 'img.src', sel);
        const srcset = img.getAttribute('srcset');
        for (const u of parseSrcsetUrls(srcset)) add(u, 'image', 'img.srcset', sel);
      });

      document.querySelectorAll('video').forEach((vid) => {
        if (items.length >= maxAssets) return;
        const sel = cssPath(vid);
        add(vid.currentSrc || vid.src || vid.getAttribute('src'), 'video', 'video.src', sel);
        add(vid.getAttribute('poster'), 'image', 'video.poster', sel);
        vid.querySelectorAll('source').forEach((src) => {
          add(src.getAttribute('src'), 'video', 'video.source', sel);
          for (const u of parseSrcsetUrls(src.getAttribute('srcset'))) add(u, 'video', 'video.source.srcset', sel);
        });
      });

      document.querySelectorAll('picture source').forEach((src) => {
        if (items.length >= maxAssets) return;
        const sel = cssPath(src);
        add(src.getAttribute('src'), 'image', 'picture.source', sel);
        for (const u of parseSrcsetUrls(src.getAttribute('srcset'))) add(u, 'image', 'picture.source.srcset', sel);
      });

      document.querySelectorAll('svg use').forEach((use) => {
        if (items.length >= maxAssets) return;
        const sel = cssPath(use);
        add(use.getAttribute('href') || use.getAttribute('xlink:href'), 'svg', 'svg.use', sel);
      });

      document.querySelectorAll('svg image').forEach((img) => {
        if (items.length >= maxAssets) return;
        const sel = cssPath(img);
        add(img.getAttribute('href') || img.getAttribute('xlink:href'), 'image', 'svg.image', sel);
      });

      document
        .querySelectorAll('link[rel~=\"icon\"], link[rel=\"apple-touch-icon\"], link[rel=\"mask-icon\"]')
        .forEach((link) => {
          if (items.length >= maxAssets) return;
          const rel = String(link.getAttribute('rel') || '').toLowerCase();
          const href = link.getAttribute('href');
          const sel = cssPath(link);
          const type = rel.includes('mask-icon') || String(href || '').toLowerCase().endsWith('.svg') ? 'svg' : 'image';
          add(href, type, `link[rel=${rel}]`, sel);
        });

      document.querySelectorAll('meta[property=\"og:image\"], meta[name=\"twitter:image\"]').forEach((meta) => {
        if (items.length >= maxAssets) return;
        add(meta.getAttribute('content'), 'image', 'meta:image', cssPath(meta));
      });
    } catch (e) {
      logger.warn('Asset tag scan failed:', e.message);
    }

    // Background images from captured nodes (including pseudo-elements).
    try {
      if (tree) {
        walkNodeTree(tree, (node) => {
          if (items.length >= maxAssets) return;
          const bg = node?.visual?.backgroundImage || null;
          if (bg) {
            for (const u of extractUrlsFromCssImage(bg)) add(u, 'background', 'visual.backgroundImage', node.selector || null);
          }

          const pseudos = node?.pseudoElements || null;
          if (pseudos && typeof pseudos === 'object') {
            const beforeBg = pseudos?.before?.backgroundImage;
            const afterBg = pseudos?.after?.backgroundImage;
            if (beforeBg) for (const u of extractUrlsFromCssImage(beforeBg)) add(u, 'background', 'pseudo.before.backgroundImage', node.selector || null);
            if (afterBg) for (const u of extractUrlsFromCssImage(afterBg)) add(u, 'background', 'pseudo.after.backgroundImage', node.selector || null);
          }
        });
      }
    } catch (e) {
      logger.warn('Asset background scan failed:', e.message);
    }

    return {
      total: items.length,
      byType,
      items,
      note: 'Manifest includes URLs found in media tags and captured background-image values. Data/blob URLs may not be downloadable.'
    };
  }

  // --------------------------------------------
  // Main builder
  // --------------------------------------------

  function buildResponsiveHints(responsive, sections) {
    if (!responsive?.variants?.comparisons) return null;

    const hints = [];

    for (const comparison of responsive.variants.comparisons) {
      const hint = {
        from: comparison.from,
        to: comparison.to,
        layoutChanges: [],
        visibilityChanges: []
      };

      // Summarize layout changes (flex direction flips, grid column changes)
      if (comparison.layoutChanges) {
        for (const change of comparison.layoutChanges.slice(0, 8)) {
          hint.layoutChanges.push({
            selector: change.selector || change.element || null,
            property: change.property || null,
            from: change.from || change.valueA || null,
            to: change.to || change.valueB || null
          });
        }
      }

      // Summarize visibility changes (elements hidden/shown at different breakpoints)
      if (comparison.visibilityChanges) {
        for (const change of comparison.visibilityChanges.slice(0, 6)) {
          hint.visibilityChanges.push({
            selector: change.selector || change.element || null,
            change: change.change || change.type || null
          });
        }
      }

      if (hint.layoutChanges.length > 0 || hint.visibilityChanges.length > 0) {
        hints.push(hint);
      }
    }

    return hints.length > 0 ? hints : null;
  }

  function build(extractedData = {}, options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    const structure = extractedData.structure || null;
    const componentsData = extractedData.components || null;
    const stateData = extractedData['state-capture'] || {};
    let responsive = extractedData.responsive || null;
    if (!responsive && window.__seResponsive?.extractCurrentLayout) {
      responsive = {
        currentLayout: window.__seResponsive.extractCurrentLayout(),
        breakpoints: window.__seResponsive.analyzeBreakpoints?.() || null,
        responsiveDoc: window.__seResponsive.generateResponsiveDoc?.() || null,
        viewportWorkflow: window.__seResponsive.generateViewportWorkflow?.(['mobile', 'tablet', 'desktop']) || null
      };
    }
    const stylekit = extractedData.stylekit || null;
    const aiSemantic = extractedData.aiSemantic || extractedData['ai-semantic'] || null;
    const a11y = extractedData.a11y || null;

    const components = buildComponentIndex(componentsData);
    const states = buildStateIndex(stateData);
    const a11yIndex = buildA11yIndex(a11y);

    // Get CSS variable reverse map for annotating computed values with var() references
    const cssReverseMap = window.__seCSS?.buildReverseMap?.()?.map || null;

    const stats = { count: 0, truncated: false };
    let tree = null;

    try {
      tree = buildNode(document.body, 0, null, { components, states, a11y: a11yIndex, cssVarMap: cssReverseMap }, opts, stats);
    } catch (e) {
      logger.warn('Failed to build tree:', e.message);
    }

    const boundaries = structure?.componentBoundaries?.components || [];
    const sections = buildSections(boundaries, components.list);

    const outline = structure?.semantic?.structure?.headings || [];
    const tokens = extractTokens(stylekit);
    const bindings = collectComponentBindings(tree);
    if (tree && components.list.length > 0) {
      const nodeIndex = createNodeIndex(tree);
      applyComponentBindingsFallback(components.list, bindings, nodeIndex);
    }
    const relationships = buildRelationships(tree);
    const interaction = buildInteractionPlan(tree, stateData, opts, { sections });
    const componentsList = components.list.map(entry => ({
      ...entry,
      nodeIds: bindings.get(entry.id) || [],
      primaryNodeId: (bindings.get(entry.id) || [])[0] || null
    }));

    // Detect repeating sibling patterns
    let patterns = null;
    if (window.__sePatternDetect?.installed) {
      try {
        patterns = window.__sePatternDetect.detectPatterns();
      } catch (e) {
        logger.warn('Failed to detect patterns:', e.message);
      }
    }

    // Pre-compute responsive summary for reuse
    const responsiveSummary = summarizeResponsive(responsive);

    // Extra fidelity helpers for LLM-guided reconstruction.
    const stacking = detectStackingContexts(tree);
    const assets = extractAssetManifest(tree, opts);

    const blueprint = {
      meta: {
        url: location.href,
        title: document.title,
        generatedAt: new Date().toISOString(),
        version: '1.0.0'
      },
      summary: {
        nodeCount: stats.count,
        componentCount: componentsList.length,
        boundComponentCount: componentsList.filter(c => c.nodeIds.length > 0).length,
        sectionCount: sections.length,
        hasStateSummaries: states.selectorIndex.size > 0,
        hasTokens: !!tokens,
        relationshipGroups: relationships.order.length +
          relationships.alignments.length +
          relationships.flex.length +
          relationships.grid.length,
        patternCount: patterns?.count || 0,
        stackingContextCount: stacking?.count || 0,
        assetCount: assets?.total || 0,
        truncated: stats.truncated
      },
      tree,
      sections,
      components: {
        list: componentsList,
        byType: components.byType
      },
      outline,
      layout: summarizeLayout(structure),
      relationships,
      interaction,
      responsive: responsiveSummary,
      responsiveHints: buildResponsiveHints(responsiveSummary, sections),
      tokens,
      page: aiSemantic?.page || null,
      intent: aiSemantic?.summary || null,
      stacking,
      assets,
      patterns: patterns?.count > 0 ? {
        count: patterns.count,
        totalRepeatingElements: patterns.totalRepeatingElements,
        items: patterns.patterns,
        guide: window.__sePatternDetect?.generatePatternGuide?.(patterns) || null
      } : null
    };

    return blueprint;
  }

  function toLLMPrompt(blueprint, options = {}) {
    if (!blueprint || typeof blueprint !== 'object') return null;

    const maxChars = Number.isFinite(options.maxChars) ? options.maxChars : 12000;

    const tokens = blueprint.tokens || null;
    const sections = Array.isArray(blueprint.sections) ? blueprint.sections : [];
    const components = blueprint.components?.list || [];
    const targets = blueprint.interaction?.targets || [];
    const responsive = blueprint.responsive || null;
    const responsiveHints = Array.isArray(blueprint.responsiveHints) ? blueprint.responsiveHints : null;
    const patterns = blueprint.patterns && typeof blueprint.patterns === 'object' ? blueprint.patterns : null;
    const stacking = blueprint.stacking && typeof blueprint.stacking === 'object' ? blueprint.stacking : null;
    const assets = blueprint.assets && typeof blueprint.assets === 'object' ? blueprint.assets : null;

    const defaultCfg = {
      maxComponents: Number.isFinite(options.maxComponents) ? options.maxComponents : 20,
      maxTargets: Number.isFinite(options.maxTargets) ? options.maxTargets : 12,
      maxSections: Number.isFinite(options.maxSections) ? options.maxSections : 12,
      maxResponsiveHints: Number.isFinite(options.maxResponsiveHints) ? options.maxResponsiveHints : 6,
      maxPatternItems: Number.isFinite(options.maxPatternItems) ? options.maxPatternItems : 8,
      maxPatternGuides: Number.isFinite(options.maxPatternGuides) ? options.maxPatternGuides : 6,
      maxStackingItems: Number.isFinite(options.maxStackingItems) ? options.maxStackingItems : 18,
      maxStackingOverlays: Number.isFinite(options.maxStackingOverlays) ? options.maxStackingOverlays : 10,
      maxAssetItems: Number.isFinite(options.maxAssetItems) ? options.maxAssetItems : 80,
      maxSelectorChars: Number.isFinite(options.maxSelectorChars) ? options.maxSelectorChars : 180,
      includeTokens: options.includeTokens !== false,
      includeAssets: options.includeAssets !== false,
      includeSections: options.includeSections !== false,
      includeComponents: options.includeComponents !== false,
      includeInteractions: options.includeInteractions !== false,
      pretty: options.pretty !== false
    };

    const truncateText = (value, maxLen, keep = 'end') => {
      const s = value === null || value === undefined ? '' : String(value);
      const max = Number(maxLen);
      if (!Number.isFinite(max) || max <= 0) return s;
      if (s.length <= max) return s;
      if (max <= 8) return s.slice(0, max);
      if (keep === 'start') return s.slice(0, max - 3) + '...';
      return '...' + s.slice(-(max - 3));
    };

    const compactSelector = (selector, cfg) => {
      const s = selector === null || selector === undefined ? '' : String(selector);
      if (!s) return null;
      return truncateText(s, cfg.maxSelectorChars, 'end');
    };

    const pickObject = (obj, maxEntries) => {
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
      const n = Number(maxEntries);
      if (!Number.isFinite(n) || n <= 0) return null;
      const out = {};
      let seen = 0;
      for (const [k, v] of Object.entries(obj)) {
        out[k] = v;
        seen += 1;
        if (seen >= n) break;
      }
      return out;
    };

    const condenseTokens = (cfg) => {
      if (!cfg.includeTokens) return null;
      if (!tokens || typeof tokens !== 'object') return tokens;
      // Keep token maps bounded; full palettes can exceed prompt budgets.
      return {
        colors: pickObject(tokens.colors, 28),
        typography: tokens.typography || null,
        spacing: pickObject(tokens.spacing, 24),
        radii: pickObject(tokens.radii, 16),
        shadows: pickObject(tokens.shadows, 16),
        motion: tokens.motion || null
      };
    };

    const condensePatterns = (cfg) => {
      if (!patterns) return null;
      const items = Array.isArray(patterns.items) ? patterns.items : [];
      const guide = patterns.guide && typeof patterns.guide === 'object' ? patterns.guide : null;

      const out = {
        count: patterns.count || 0,
        totalRepeatingElements: patterns.totalRepeatingElements || 0,
        items: items.slice(0, cfg.maxPatternItems).map((p) => ({
          id: p.id || null,
          containerSelector: compactSelector(p.containerSelector, cfg),
          sampleSelector: compactSelector(p.sampleSelector, cfg),
          count: p.count || null,
          layoutType: p.layoutType || null,
          gap: p.gap || null,
          itemSize: p.itemSize || null,
          template: p.template || null,
          sampleSelectors: Array.isArray(p.sampleSelectors)
            ? p.sampleSelectors.slice(0, 2).map((s) => compactSelector(s, cfg)).filter(Boolean)
            : null
        }))
      };

      if (guide) {
        out.guide = {
          total: guide.total || null,
          guides: Array.isArray(guide.guides)
            ? guide.guides.slice(0, cfg.maxPatternGuides).map((g) => ({
                hint: g.hint || null,
                container: compactSelector(g.container, cfg),
                itemCount: g.itemCount || null,
                layoutType: g.layoutType || null,
                gap: g.gap || null,
                itemSize: g.itemSize || null,
                template: g.template || null
              }))
            : null,
          note: guide.note || null
        };
      } else {
        out.guide = null;
      }

      return out;
    };

    const condenseResponsive = (cfg) => {
      if (!responsive || typeof responsive !== 'object') return null;

      const out = {
        breakpoints: responsive.breakpoints || null,
        named: responsive.named || null,
        // Keep this small and high-signal; full comparisons can easily exceed prompt budgets.
        hints: responsiveHints
          ? responsiveHints.slice(0, cfg.maxResponsiveHints).map((h) => ({
              from: h.from || null,
              to: h.to || null,
              layoutChanges: Array.isArray(h.layoutChanges)
                ? h.layoutChanges.slice(0, 6).map((c) => ({
                    selector: compactSelector(c.selector, cfg),
                    property: c.property || null,
                    from: c.from || null,
                    to: c.to || null
                  }))
                : [],
              visibilityChanges: Array.isArray(h.visibilityChanges)
                ? h.visibilityChanges.slice(0, 6).map((c) => ({
                    selector: compactSelector(c.selector, cfg),
                    change: c.change || null
                  }))
                : []
            }))
          : null
      };

      if (responsive.variants && typeof responsive.variants === 'object') {
        out.variants = {
          layouts: responsive.variants.layouts || null
        };
      } else {
        out.variants = null;
      }

      return out;
    };

    const condenseStacking = (cfg) => {
      if (!stacking) return null;
      const top = Array.isArray(stacking.top) ? stacking.top : [];
      const overlays = Array.isArray(stacking.overlayCandidates) ? stacking.overlayCandidates : [];

      const compact = (c) => ({
        uid: c.uid || null,
        selector: compactSelector(c.selector, cfg),
        rect: c.rect || null,
        position: c.position || null,
        zIndex: c.zIndex || null,
        reasons: Array.isArray(c.reasons) ? c.reasons.slice(0, 6) : null,
      });

      return {
        count: stacking.count || top.length || 0,
        overlayCandidates: overlays.slice(0, cfg.maxStackingOverlays).map(compact),
        top: top.slice(0, cfg.maxStackingItems).map(compact),
        note: stacking.note || null
      };
    };

    const condenseAssets = (cfg) => {
      if (!cfg.includeAssets) return null;
      if (!assets) return null;
      const items = Array.isArray(assets.items) ? assets.items : [];
      return {
        total: assets.total || items.length || 0,
        byType: assets.byType || null,
        items: items.slice(0, cfg.maxAssetItems).map((a) => ({
          url: a.url || null,
          type: a.type || null,
          source: a.source || null,
          selector: compactSelector(a.selector, cfg)
        })),
        note: assets.note || null
      };
    };

    const wrapPrompt = (condensed, indent) => {
      const lines = [];
      lines.push('# UI Replica Blueprint (Condensed)');
      lines.push('');
      lines.push('Use the JSON below to recreate the page layout and component styles with high visual fidelity.');
      lines.push('Focus on: layout constraints, typography, backgrounds/borders/shadows, interactive states, and responsive differences.');
      lines.push('Nodes may include `varRefs` (CSS variable mappings) and `pseudoElements` (::before/::after defaults) for higher fidelity.');
      lines.push('');
      lines.push('```json');
      lines.push(JSON.stringify(condensed, null, indent));
      lines.push('```');
      return lines.join('\n');
    };

    const cfg = { ...defaultCfg };

    for (let pass = 0; pass < 40; pass += 1) {
      const condensed = {
        meta: blueprint.meta || null,
        summary: blueprint.summary || null,
        tokens: condenseTokens(cfg),
        patterns: condensePatterns(cfg),
        // Put responsive early so it remains visible under maxChars.
        responsive: condenseResponsive(cfg),
        stacking: condenseStacking(cfg),
        assets: condenseAssets(cfg),
        sections: cfg.includeSections
          ? sections.slice(0, cfg.maxSections).map((s) => ({
              id: s.id,
              name: s.name,
              role: s.semanticRole || null,
              rect: s.rect || null,
              components: Array.isArray(s.components) ? s.components.slice(0, 16) : []
            }))
          : null,
        components: cfg.includeComponents
          ? components.slice(0, cfg.maxComponents).map((c) => ({
              id: c.id,
              type: c.type,
              variant: c.variant || null,
              selector: compactSelector(c.selector, cfg),
              primaryNodeId: c.primaryNodeId || null,
              text: c.text || null
            }))
          : null,
        interactions: cfg.includeInteractions
          ? targets.slice(0, cfg.maxTargets).map((t) => ({
              selector: compactSelector(t.selector, cfg),
              tag: t.tag || null,
              semanticRole: t.semanticRole || null,
              semanticName: t.semanticName || null,
              accessibleRole: t.accessibleRole || null,
              accessibleName: t.accessibleName || null,
              availableStates: t.availableStates || null,
              keyChanges: Array.isArray(t.keyChanges) ? t.keyChanges.slice(0, 8) : (t.keyChanges || null),
              priority: t.priority || null
            }))
          : null
      };

      const out = wrapPrompt(condensed, cfg.pretty ? 2 : 0);
      if (out.length <= maxChars) return out;

      // Tighten until it fits.
      if (cfg.pretty) {
        // Whitespace is pure overhead for LLMs; compact first to preserve content.
        cfg.pretty = false;
        continue;
      }
      if (cfg.maxSelectorChars > 120) {
        cfg.maxSelectorChars = Math.max(80, Math.floor(cfg.maxSelectorChars * 0.75));
        continue;
      }
      if (cfg.maxTargets > 8) {
        cfg.maxTargets = Math.max(6, cfg.maxTargets - 2);
        continue;
      }
      if (cfg.maxComponents > 12) {
        cfg.maxComponents = Math.max(8, cfg.maxComponents - 4);
        continue;
      }
      if (cfg.maxSections > 8) {
        cfg.maxSections = Math.max(6, cfg.maxSections - 2);
        continue;
      }
      if (cfg.maxResponsiveHints > 4) {
        cfg.maxResponsiveHints = Math.max(3, cfg.maxResponsiveHints - 1);
        continue;
      }
      if (cfg.maxAssetItems > 40) {
        cfg.maxAssetItems = Math.max(20, Math.floor(cfg.maxAssetItems * 0.7));
        continue;
      }
      if (cfg.maxPatternItems > 4) {
        cfg.maxPatternItems = Math.max(4, cfg.maxPatternItems - 2);
        continue;
      }
      if (cfg.maxPatternGuides > 4) {
        cfg.maxPatternGuides = Math.max(3, cfg.maxPatternGuides - 1);
        continue;
      }
      if (cfg.maxStackingItems > 12) {
        cfg.maxStackingItems = Math.max(10, cfg.maxStackingItems - 4);
        continue;
      }
      if (cfg.maxStackingOverlays > 8) {
        cfg.maxStackingOverlays = Math.max(6, cfg.maxStackingOverlays - 2);
        continue;
      }
      if (cfg.includeInteractions) {
        cfg.includeInteractions = false;
        continue;
      }
      if (cfg.includeComponents) {
        cfg.includeComponents = false;
        continue;
      }
      if (cfg.includeSections) {
        cfg.includeSections = false;
        continue;
      }
      if (cfg.includeAssets) {
        cfg.includeAssets = false;
        continue;
      }
      if (cfg.includeTokens) {
        cfg.includeTokens = false;
        continue;
      }

      // As a last resort, return a minimal prompt and hard-cap the size.
      const minimal = {
        meta: blueprint.meta || null,
        summary: blueprint.summary || null,
        patterns: condensePatterns({ ...cfg, maxPatternItems: 4, maxPatternGuides: 3, maxSelectorChars: 80 }),
        responsive: condenseResponsive({ ...cfg, maxSelectorChars: 80, maxResponsiveHints: 3 }),
        stacking: condenseStacking({ ...cfg, maxSelectorChars: 80, maxStackingItems: 10, maxStackingOverlays: 6 }),
        assets: condenseAssets({ ...cfg, maxSelectorChars: 80, maxAssetItems: 24 })
      };
      const minimalOut = wrapPrompt(minimal, cfg.pretty ? 2 : 0);
      return minimalOut.length <= maxChars ? minimalOut : minimalOut.slice(0, maxChars);
    }

    return wrapPrompt({ meta: blueprint.meta || null, summary: blueprint.summary || null }, 0).slice(0, maxChars);
  }

  // --------------------------------------------
  // Export
  // --------------------------------------------

  window.__seBlueprint = {
    installed: true,
    version: '1.0.0',
    build,
    generate: build,
    toLLMPrompt,
    DEFAULT_OPTIONS
  };
})();
