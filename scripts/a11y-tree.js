// Style Extractor: Accessibility Tree Module
// Extracts complete accessibility information for AI understanding
//
// This module provides:
// 1. Computed ARIA roles (including implicit roles)
// 2. Accessible names and descriptions
// 3. ARIA states and properties
// 4. Element relationships (labelledby, describedby, controls, owns)
// 5. Landmark hierarchy
//
// Usage:
//   window.__seA11y.extractA11yTree()
//   window.__seA11y.getAccessibleInfo(element)
//   window.__seA11y.analyzeLandmarks()
//   window.__seA11y.getAccessibleName(element)

(() => {
  if (window.__seA11y?.installed) return;

  const debug = (...args) => {
    if (window.__seDebug) console.log('[style-extractor:a11y]', ...args);
  };

  // ============================================
  // Implicit Role Mapping (HTML5 to ARIA)
  // ============================================

  const IMPLICIT_ROLES = {
    // Sectioning
    article: 'article',
    aside: 'complementary',
    footer: 'contentinfo',  // when not inside article/section
    header: 'banner',       // when not inside article/section
    main: 'main',
    nav: 'navigation',
    section: 'region',      // when has accessible name

    // Grouping
    figure: 'figure',
    form: 'form',           // when has accessible name
    fieldset: 'group',

    // Text
    h1: 'heading',
    h2: 'heading',
    h3: 'heading',
    h4: 'heading',
    h5: 'heading',
    h6: 'heading',
    p: 'paragraph',
    blockquote: 'blockquote',
    pre: 'generic',

    // Lists
    ul: 'list',
    ol: 'list',
    li: 'listitem',
    dl: 'list',
    dt: 'term',
    dd: 'definition',
    menu: 'list',

    // Tables
    table: 'table',
    thead: 'rowgroup',
    tbody: 'rowgroup',
    tfoot: 'rowgroup',
    tr: 'row',
    th: 'columnheader',     // or rowheader based on scope
    td: 'cell',
    caption: 'caption',

    // Forms
    button: 'button',
    input: null,            // depends on type
    select: 'combobox',     // or listbox
    textarea: 'textbox',
    option: 'option',
    optgroup: 'group',
    label: null,            // no role
    output: 'status',
    progress: 'progressbar',
    meter: 'meter',

    // Interactive
    a: 'link',              // when has href
    area: 'link',           // when has href
    details: 'group',
    summary: 'button',
    dialog: 'dialog',

    // Media
    img: 'img',
    video: null,
    audio: null,
    canvas: null,
    svg: 'graphics-document',

    // Other
    hr: 'separator',
    address: 'group',
    time: 'time',
    abbr: null,
    code: 'code',
    mark: 'mark',
    math: 'math'
  };

  // Input type to role mapping
  const INPUT_TYPE_ROLES = {
    button: 'button',
    checkbox: 'checkbox',
    color: null,
    date: null,
    datetime: null,
    'datetime-local': null,
    email: 'textbox',
    file: null,
    hidden: null,
    image: 'button',
    month: null,
    number: 'spinbutton',
    password: 'textbox',
    radio: 'radio',
    range: 'slider',
    reset: 'button',
    search: 'searchbox',
    submit: 'button',
    tel: 'textbox',
    text: 'textbox',
    time: null,
    url: 'textbox',
    week: null
  };

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
      height: Math.round(r.height)
    };
  }

  function isVisible(el) {
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

  // ============================================
  // Computed Role
  // ============================================

  /**
   * Get the computed ARIA role for an element
   * Priority: explicit role > implicit role from tag/type
   */
  function getComputedRole(el) {
    if (!el || el.nodeType !== 1) return null;

    // 1. Check explicit role attribute
    const explicitRole = el.getAttribute('role');
    if (explicitRole) {
      return {
        role: explicitRole,
        source: 'explicit'
      };
    }

    const tag = el.tagName.toLowerCase();

    // 2. Handle input elements specially
    if (tag === 'input') {
      const type = el.type || 'text';
      const role = INPUT_TYPE_ROLES[type];
      if (role) {
        return {
          role,
          source: 'implicit',
          inputType: type
        };
      }
      return { role: null, source: 'none', inputType: type };
    }

    // 3. Handle anchor elements
    if (tag === 'a') {
      return {
        role: el.hasAttribute('href') ? 'link' : null,
        source: el.hasAttribute('href') ? 'implicit' : 'none'
      };
    }

    // 4. Handle header/footer context
    if (tag === 'header' || tag === 'footer') {
      const isInsideArticleOrSection = el.closest('article, section, aside, nav');
      if (isInsideArticleOrSection) {
        return { role: 'generic', source: 'implicit', context: 'nested' };
      }
      return {
        role: tag === 'header' ? 'banner' : 'contentinfo',
        source: 'implicit'
      };
    }

    // 5. Handle section with accessible name
    if (tag === 'section') {
      const hasName = el.hasAttribute('aria-label') ||
                      el.hasAttribute('aria-labelledby') ||
                      el.hasAttribute('title');
      return {
        role: hasName ? 'region' : 'generic',
        source: hasName ? 'implicit' : 'none'
      };
    }

    // 6. Handle form with accessible name
    if (tag === 'form') {
      const hasName = el.hasAttribute('aria-label') ||
                      el.hasAttribute('aria-labelledby') ||
                      el.hasAttribute('name');
      return {
        role: hasName ? 'form' : 'generic',
        source: hasName ? 'implicit' : 'none'
      };
    }

    // 7. Handle select element
    if (tag === 'select') {
      return {
        role: el.multiple ? 'listbox' : 'combobox',
        source: 'implicit'
      };
    }

    // 8. Handle th element
    if (tag === 'th') {
      const scope = el.getAttribute('scope');
      return {
        role: scope === 'row' ? 'rowheader' : 'columnheader',
        source: 'implicit'
      };
    }

    // 9. Default implicit role lookup
    const implicitRole = IMPLICIT_ROLES[tag];
    if (implicitRole) {
      return {
        role: implicitRole,
        source: 'implicit'
      };
    }

    return { role: null, source: 'none' };
  }

  // ============================================
  // Accessible Name Computation
  // ============================================

  /**
   * Compute the accessible name for an element
   * Following the accessible name computation algorithm (simplified)
   */
  function getAccessibleName(el) {
    if (!el || el.nodeType !== 1) return null;

    // 1. aria-labelledby (highest priority)
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const ids = labelledBy.split(/\s+/);
      const texts = ids
        .map(id => document.getElementById(id))
        .filter(Boolean)
        .map(ref => (ref.innerText || ref.textContent || '').trim());
      if (texts.length > 0) {
        return {
          name: texts.join(' '),
          source: 'aria-labelledby',
          references: ids
        };
      }
    }

    // 2. aria-label
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) {
      return {
        name: ariaLabel,
        source: 'aria-label'
      };
    }

    // 3. Native labeling mechanisms
    const tag = el.tagName.toLowerCase();

    // For form controls, check associated label
    if (['input', 'select', 'textarea'].includes(tag)) {
      // Check for label with for attribute
      if (el.id) {
        const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (label) {
          return {
            name: (label.innerText || label.textContent || '').trim(),
            source: 'label-for'
          };
        }
      }

      // Check for wrapping label
      const parentLabel = el.closest('label');
      if (parentLabel) {
        // Get text excluding the input itself
        const clone = parentLabel.cloneNode(true);
        const inputs = clone.querySelectorAll('input, select, textarea');
        inputs.forEach(i => i.remove());
        const text = (clone.innerText || clone.textContent || '').trim();
        if (text) {
          return {
            name: text,
            source: 'label-wrap'
          };
        }
      }

      // Check placeholder
      if (el.placeholder) {
        return {
          name: el.placeholder,
          source: 'placeholder'
        };
      }

      // Check title
      if (el.title) {
        return {
          name: el.title,
          source: 'title'
        };
      }
    }

    // For images
    if (tag === 'img') {
      if (el.alt) {
        return {
          name: el.alt,
          source: 'alt'
        };
      }
      if (el.title) {
        return {
          name: el.title,
          source: 'title'
        };
      }
    }

    // For buttons and links, use text content
    if (['button', 'a', 'summary'].includes(tag) ||
        el.getAttribute('role') === 'button' ||
        el.getAttribute('role') === 'link') {
      const text = (el.innerText || el.textContent || '').trim();
      if (text) {
        return {
          name: text.slice(0, 100),
          source: 'content'
        };
      }
    }

    // For fieldset, check legend
    if (tag === 'fieldset') {
      const legend = el.querySelector('legend');
      if (legend) {
        return {
          name: (legend.innerText || legend.textContent || '').trim(),
          source: 'legend'
        };
      }
    }

    // For figure, check figcaption
    if (tag === 'figure') {
      const caption = el.querySelector('figcaption');
      if (caption) {
        return {
          name: (caption.innerText || caption.textContent || '').trim(),
          source: 'figcaption'
        };
      }
    }

    // For table, check caption
    if (tag === 'table') {
      const caption = el.querySelector('caption');
      if (caption) {
        return {
          name: (caption.innerText || caption.textContent || '').trim(),
          source: 'caption'
        };
      }
    }

    // Fallback to title attribute
    if (el.title) {
      return {
        name: el.title,
        source: 'title'
      };
    }

    return { name: null, source: 'none' };
  }

  /**
   * Get the accessible description for an element
   */
  function getAccessibleDescription(el) {
    if (!el || el.nodeType !== 1) return null;

    // aria-describedby
    const describedBy = el.getAttribute('aria-describedby');
    if (describedBy) {
      const ids = describedBy.split(/\s+/);
      const texts = ids
        .map(id => document.getElementById(id))
        .filter(Boolean)
        .map(ref => (ref.innerText || ref.textContent || '').trim());
      if (texts.length > 0) {
        return {
          description: texts.join(' '),
          source: 'aria-describedby',
          references: ids
        };
      }
    }

    // aria-description (newer attribute)
    const ariaDesc = el.getAttribute('aria-description');
    if (ariaDesc) {
      return {
        description: ariaDesc,
        source: 'aria-description'
      };
    }

    return { description: null, source: 'none' };
  }

  // ============================================
  // ARIA States and Properties
  // ============================================

  /**
   * Extract all ARIA states for an element
   */
  function getAriaStates(el) {
    if (!el || el.nodeType !== 1) return {};

    const states = {};

    // Boolean states
    const booleanStates = [
      'aria-expanded',
      'aria-selected',
      'aria-disabled',
      'aria-hidden',
      'aria-pressed',
      'aria-invalid',
      'aria-required',
      'aria-readonly',
      'aria-busy',
      'aria-grabbed',
      'aria-atomic',
      'aria-modal'
    ];

    for (const attr of booleanStates) {
      const value = el.getAttribute(attr);
      if (value !== null) {
        const key = attr.replace('aria-', '');
        if (value === 'true') states[key] = true;
        else if (value === 'false') states[key] = false;
        else if (value === 'mixed') states[key] = 'mixed';
      }
    }

    // Check native states for form elements
    if (el.disabled !== undefined && el.disabled) {
      states.disabled = true;
    }
    if (el.required !== undefined && el.required) {
      states.required = true;
    }
    if (el.readOnly !== undefined && el.readOnly) {
      states.readonly = true;
    }
    if (el.checked !== undefined) {
      states.checked = el.indeterminate ? 'mixed' : el.checked;
    }

    // Tristate: aria-checked
    const ariaChecked = el.getAttribute('aria-checked');
    if (ariaChecked) {
      states.checked = ariaChecked === 'mixed' ? 'mixed' : ariaChecked === 'true';
    }

    return states;
  }

  /**
   * Extract ARIA properties for an element
   */
  function getAriaProperties(el) {
    if (!el || el.nodeType !== 1) return {};

    const props = {};

    // String/token properties
    const stringProps = [
      'aria-autocomplete',
      'aria-current',
      'aria-dropeffect',
      'aria-haspopup',
      'aria-live',
      'aria-orientation',
      'aria-relevant',
      'aria-sort',
      'aria-valuetext'
    ];

    for (const attr of stringProps) {
      const value = el.getAttribute(attr);
      if (value) {
        props[attr.replace('aria-', '')] = value;
      }
    }

    // Numeric properties
    const numericProps = [
      'aria-level',
      'aria-posinset',
      'aria-setsize',
      'aria-colcount',
      'aria-colindex',
      'aria-colspan',
      'aria-rowcount',
      'aria-rowindex',
      'aria-rowspan',
      'aria-valuemax',
      'aria-valuemin',
      'aria-valuenow'
    ];

    for (const attr of numericProps) {
      const value = el.getAttribute(attr);
      if (value !== null) {
        const num = parseFloat(value);
        if (!isNaN(num)) {
          props[attr.replace('aria-', '')] = num;
        }
      }
    }

    // For headings, get level
    const tag = el.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) {
      props.level = parseInt(tag[1]);
    }

    return props;
  }

  // ============================================
  // Element Relationships
  // ============================================

  /**
   * Extract ARIA relationships for an element
   */
  function getAriaRelations(el) {
    if (!el || el.nodeType !== 1) return {};

    const relations = {};

    // ID reference attributes
    const refAttrs = [
      'aria-controls',
      'aria-owns',
      'aria-flowto',
      'aria-activedescendant',
      'aria-errormessage',
      'aria-details'
    ];

    for (const attr of refAttrs) {
      const value = el.getAttribute(attr);
      if (value) {
        const ids = value.split(/\s+/).filter(Boolean);
        if (ids.length > 0) {
          relations[attr.replace('aria-', '')] = ids;
        }
      }
    }

    // Check if this element is a label for another
    if (el.tagName.toLowerCase() === 'label') {
      const forId = el.getAttribute('for');
      if (forId) {
        relations.labelFor = forId;
      }
    }

    // Check form association
    if (el.form) {
      relations.formAssociation = el.form.id || cssPath(el.form);
    }

    // Find parent landmark
    const landmarkRoles = ['banner', 'navigation', 'main', 'complementary', 'contentinfo', 'search', 'form', 'region'];
    let parent = el.parentElement;
    while (parent) {
      const role = parent.getAttribute('role');
      if (role && landmarkRoles.includes(role)) {
        relations.parentLandmark = {
          role,
          selector: cssPath(parent)
        };
        break;
      }
      // Check implicit landmark
      const tag = parent.tagName.toLowerCase();
      if (['header', 'nav', 'main', 'aside', 'footer'].includes(tag)) {
        const computed = getComputedRole(parent);
        if (computed.role && landmarkRoles.includes(computed.role)) {
          relations.parentLandmark = {
            role: computed.role,
            selector: cssPath(parent),
            implicit: true
          };
          break;
        }
      }
      parent = parent.parentElement;
    }

    return relations;
  }

  // ============================================
  // Complete Accessible Info
  // ============================================

  /**
   * Get complete accessibility information for an element
   */
  function getAccessibleInfo(el) {
    if (!el || el.nodeType !== 1) return null;

    const role = getComputedRole(el);
    const name = getAccessibleName(el);
    const description = getAccessibleDescription(el);
    const states = getAriaStates(el);
    const properties = getAriaProperties(el);
    const relations = getAriaRelations(el);

    // Build result, omitting empty objects
    const info = {
      selector: cssPath(el),
      tag: el.tagName.toLowerCase(),
      role: role.role,
      roleSource: role.source
    };

    if (name.name) {
      info.name = name.name;
      info.nameSource = name.source;
    }

    if (description.description) {
      info.description = description.description;
      info.descriptionSource = description.source;
    }

    if (Object.keys(states).length > 0) {
      info.states = states;
    }

    if (Object.keys(properties).length > 0) {
      info.properties = properties;
    }

    if (Object.keys(relations).length > 0) {
      info.relations = relations;
    }

    return info;
  }

  // ============================================
  // A11y Tree Extraction
  // ============================================

  /**
   * Extract the accessibility tree for the page
   */
  function extractA11yTree(options = {}) {
    const {
      maxDepth = 10,
      includeHidden = false,
      skipTags = ['script', 'style', 'noscript', 'link', 'meta'],
      interactiveOnly = false
    } = options;

    const interactiveRoles = [
      'button', 'link', 'checkbox', 'radio', 'textbox', 'searchbox',
      'combobox', 'listbox', 'slider', 'spinbutton', 'switch',
      'menuitem', 'menuitemcheckbox', 'menuitemradio', 'tab',
      'treeitem', 'option', 'gridcell'
    ];

    function extractNode(el, depth) {
      if (!el || el.nodeType !== 1) return null;
      if (depth > maxDepth) return null;

      const tag = el.tagName.toLowerCase();
      if (skipTags.includes(tag)) return null;

      // Check visibility
      if (!includeHidden && !isVisible(el)) return null;

      const role = getComputedRole(el);

      // If interactiveOnly, skip non-interactive elements
      if (interactiveOnly && !interactiveRoles.includes(role.role)) {
        // But still process children
        const children = [];
        for (const child of el.children) {
          const childNode = extractNode(child, depth + 1);
          if (childNode) {
            if (Array.isArray(childNode)) {
              children.push(...childNode);
            } else {
              children.push(childNode);
            }
          }
        }
        return children.length > 0 ? children : null;
      }

      const info = getAccessibleInfo(el);
      if (!info) return null;

      // Add rect for positioning
      info.rect = getRect(el);

      // Process children
      const children = [];
      for (const child of el.children) {
        const childNode = extractNode(child, depth + 1);
        if (childNode) {
          if (Array.isArray(childNode)) {
            children.push(...childNode);
          } else {
            children.push(childNode);
          }
        }
      }

      if (children.length > 0) {
        info.children = children;
      }

      return info;
    }

    const tree = extractNode(document.body, 0);

    return {
      url: location.href,
      title: document.title,
      tree,
      extractedAt: new Date().toISOString()
    };
  }

  // ============================================
  // Landmark Analysis
  // ============================================

  /**
   * Analyze page landmarks and their hierarchy
   */
  function analyzeLandmarks() {
    const landmarks = [];
    const landmarkRoles = [
      'banner', 'navigation', 'main', 'complementary',
      'contentinfo', 'search', 'form', 'region'
    ];

    // Find all landmarks (explicit and implicit)
    const allElements = document.querySelectorAll('*');

    for (const el of allElements) {
      if (!isVisible(el)) continue;

      const computed = getComputedRole(el);
      if (!computed.role || !landmarkRoles.includes(computed.role)) continue;

      const name = getAccessibleName(el);

      landmarks.push({
        role: computed.role,
        roleSource: computed.source,
        name: name.name,
        nameSource: name.source,
        selector: cssPath(el),
        tag: el.tagName.toLowerCase(),
        rect: getRect(el),
        childLandmarks: []
      });
    }

    // Build hierarchy
    for (const landmark of landmarks) {
      const el = document.querySelector(landmark.selector);
      if (!el) continue;

      for (const other of landmarks) {
        if (other === landmark) continue;
        const otherEl = document.querySelector(other.selector);
        if (otherEl && el.contains(otherEl)) {
          landmark.childLandmarks.push(other.selector);
        }
      }
    }

    // Find root landmarks (not contained in others)
    const rootLandmarks = landmarks.filter(l => {
      const el = document.querySelector(l.selector);
      return !landmarks.some(other => {
        if (other === l) return false;
        const otherEl = document.querySelector(other.selector);
        return otherEl && otherEl.contains(el);
      });
    });

    return {
      landmarks,
      rootLandmarks: rootLandmarks.map(l => l.selector),
      summary: {
        total: landmarks.length,
        byRole: landmarkRoles.reduce((acc, role) => {
          acc[role] = landmarks.filter(l => l.role === role).length;
          return acc;
        }, {}),
        hasMain: landmarks.some(l => l.role === 'main'),
        hasNavigation: landmarks.some(l => l.role === 'navigation'),
        hasBanner: landmarks.some(l => l.role === 'banner'),
        hasContentinfo: landmarks.some(l => l.role === 'contentinfo')
      }
    };
  }

  // ============================================
  // Interactive Elements Analysis
  // ============================================

  /**
   * Find all interactive elements with their accessibility info
   */
  function findInteractiveElements() {
    const interactive = [];

    // Selectors for interactive elements
    const selectors = [
      'a[href]',
      'button',
      'input:not([type="hidden"])',
      'select',
      'textarea',
      '[role="button"]',
      '[role="link"]',
      '[role="checkbox"]',
      '[role="radio"]',
      '[role="switch"]',
      '[role="slider"]',
      '[role="spinbutton"]',
      '[role="combobox"]',
      '[role="listbox"]',
      '[role="menuitem"]',
      '[role="tab"]',
      '[tabindex]:not([tabindex="-1"])',
      '[onclick]',
      '[contenteditable="true"]'
    ];

    const seen = new Set();

    for (const selector of selectors) {
      try {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          if (seen.has(el)) continue;
          if (!isVisible(el)) continue;
          seen.add(el);

          const info = getAccessibleInfo(el);
          if (info) {
            info.rect = getRect(el);
            info.focusable = el.tabIndex >= 0;
            interactive.push(info);
          }
        }
      } catch (e) {
        debug('Error finding interactive elements:', selector, e.message);
      }
    }

    // Sort by position (top to bottom, left to right)
    interactive.sort((a, b) => {
      if (Math.abs(a.rect.y - b.rect.y) > 10) {
        return a.rect.y - b.rect.y;
      }
      return a.rect.x - b.rect.x;
    });

    return {
      elements: interactive,
      count: interactive.length,
      byRole: interactive.reduce((acc, el) => {
        const role = el.role || 'unknown';
        acc[role] = (acc[role] || 0) + 1;
        return acc;
      }, {}),
      withoutName: interactive.filter(el => !el.name).length,
      timestamp: Date.now()
    };
  }

  // ============================================
  // Accessibility Issues Detection
  // ============================================

  /**
   * Detect common accessibility issues
   */
  function detectA11yIssues() {
    const issues = [];

    // 1. Images without alt text
    const images = document.querySelectorAll('img:not([alt])');
    for (const img of images) {
      if (!isVisible(img)) continue;
      issues.push({
        type: 'missing-alt',
        severity: 'error',
        element: cssPath(img),
        message: 'Image missing alt attribute'
      });
    }

    // 2. Form inputs without labels
    const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea');
    for (const input of inputs) {
      if (!isVisible(input)) continue;
      const name = getAccessibleName(input);
      if (!name.name) {
        issues.push({
          type: 'missing-label',
          severity: 'error',
          element: cssPath(input),
          message: 'Form control missing accessible name'
        });
      }
    }

    // 3. Buttons without accessible name
    const buttons = document.querySelectorAll('button, [role="button"]');
    for (const btn of buttons) {
      if (!isVisible(btn)) continue;
      const name = getAccessibleName(btn);
      if (!name.name) {
        issues.push({
          type: 'missing-button-name',
          severity: 'error',
          element: cssPath(btn),
          message: 'Button missing accessible name'
        });
      }
    }

    // 4. Links without accessible name
    const links = document.querySelectorAll('a[href]');
    for (const link of links) {
      if (!isVisible(link)) continue;
      const name = getAccessibleName(link);
      if (!name.name) {
        issues.push({
          type: 'missing-link-name',
          severity: 'error',
          element: cssPath(link),
          message: 'Link missing accessible name'
        });
      }
    }

    // 5. Missing main landmark
    const hasMain = document.querySelector('main, [role="main"]');
    if (!hasMain) {
      issues.push({
        type: 'missing-main',
        severity: 'warning',
        element: 'body',
        message: 'Page missing main landmark'
      });
    }

    // 6. Multiple h1 elements
    const h1s = document.querySelectorAll('h1');
    if (h1s.length > 1) {
      issues.push({
        type: 'multiple-h1',
        severity: 'warning',
        element: 'document',
        message: `Page has ${h1s.length} h1 elements (should have only one)`
      });
    }

    // 7. Skipped heading levels
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    let prevLevel = 0;
    for (const h of headings) {
      if (!isVisible(h)) continue;
      const level = parseInt(h.tagName[1]);
      if (prevLevel > 0 && level > prevLevel + 1) {
        issues.push({
          type: 'skipped-heading',
          severity: 'warning',
          element: cssPath(h),
          message: `Heading level skipped from h${prevLevel} to h${level}`
        });
      }
      prevLevel = level;
    }

    return {
      issues,
      summary: {
        total: issues.length,
        errors: issues.filter(i => i.severity === 'error').length,
        warnings: issues.filter(i => i.severity === 'warning').length,
        byType: issues.reduce((acc, i) => {
          acc[i.type] = (acc[i.type] || 0) + 1;
          return acc;
        }, {})
      }
    };
  }

  // ============================================
  // Export
  // ============================================

  window.__seA11y = {
    installed: true,
    version: '1.0.0',

    // Core functions
    getComputedRole,
    getAccessibleName,
    getAccessibleDescription,
    getAriaStates,
    getAriaProperties,
    getAriaRelations,
    getAccessibleInfo,

    // Tree extraction
    extractA11yTree,

    // Analysis
    analyzeLandmarks,
    findInteractiveElements,
    detectA11yIssues,

    // Utilities
    cssPath,
    isVisible,

    // Constants
    IMPLICIT_ROLES,
    INPUT_TYPE_ROLES
  };
})();
