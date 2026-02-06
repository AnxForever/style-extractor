// Style Extractor: Code Generator
// Generates framework code from extracted structure data
//
// Supported output formats:
// - HTML skeleton (semantic HTML5)
// - React components (TypeScript + Tailwind)
// - Vue components (Composition API)
//
// Usage in evaluate_script:
//   window.__seCodeGen.toHTMLSkeleton(structureData)
//   window.__seCodeGen.toReactComponents(structureData)
//   window.__seCodeGen.toVueComponents(structureData)
//   window.__seCodeGen.generate(structureData, format)

(() => {
  if (window.__seCodeGen?.installed) return;

  // Debug mode
  const debug = (...args) => {
    if (window.__seDebug) console.log('[style-extractor:codegen]', ...args);
  };

  // ============================================
  // Component Recognition Patterns
  // ============================================

  const COMPONENT_PATTERNS = {
    Header: {
      selectors: ['header', '[role="banner"]'],
      classPatterns: ['header', 'top-bar', 'site-header']
    },
    Navigation: {
      selectors: ['nav', '[role="navigation"]'],
      classPatterns: ['nav', 'navbar', 'menu', 'navigation']
    },
    Hero: {
      selectors: [],
      classPatterns: ['hero', 'banner', 'jumbotron', 'landing']
    },
    Main: {
      selectors: ['main', '[role="main"]'],
      classPatterns: ['main', 'content', 'main-content']
    },
    Sidebar: {
      selectors: ['aside', '[role="complementary"]'],
      classPatterns: ['sidebar', 'aside', 'side-panel']
    },
    Footer: {
      selectors: ['footer', '[role="contentinfo"]'],
      classPatterns: ['footer', 'site-footer', 'bottom']
    },
    Card: {
      selectors: ['article'],
      classPatterns: ['card', 'tile', 'panel', 'item']
    },
    Section: {
      selectors: ['section'],
      classPatterns: ['section', 'block', 'segment']
    },
    Button: {
      selectors: ['button', '[role="button"]'],
      classPatterns: ['btn', 'button', 'cta']
    },
    Form: {
      selectors: ['form'],
      classPatterns: ['form', 'contact', 'subscribe']
    }
  };

  // ============================================
  // Helper Functions
  // ============================================

  function toPascalCase(str) {
    if (!str) return 'Component';
    return str
      .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
      .replace(/^(.)/, (_, c) => c.toUpperCase());
  }

  function toKebabCase(str) {
    if (!str) return 'component';
    return str
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/[\s_]+/g, '-')
      .toLowerCase();
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function indent(str, spaces = 2) {
    const pad = ' '.repeat(spaces);
    return str.split('\n').map(line => pad + line).join('\n');
  }

  function escapeJsxText(str) {
    // We escape like HTML; JSX text shares the same escaping needs for &, <, >.
    return escapeHtml(str).replace(/'/g, '&#39;');
  }

  function isPlainObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
  }

  function toCssProp(prop) {
    if (!prop) return '';
    // Already kebab-case or custom.
    if (prop.includes('-')) return prop;
    return toKebabCase(prop);
  }

  function pushDecl(decls, prop, value) {
    if (!prop) return;
    if (value === null || value === undefined) return;
    const v = String(value).trim();
    if (!v) return;
    decls.push(`${toCssProp(prop)}: ${v};`);
  }

  function boxToShorthand(box) {
    if (!box) return null;
    const top = box.top || '0';
    const right = box.right || top;
    const bottom = box.bottom || top;
    const left = box.left || right;
    return `${top} ${right} ${bottom} ${left}`;
  }

  // Identify component type from DOM node
  function identifyComponentType(node) {
    if (!node) return null;

    const tag = node.tag?.toLowerCase();
    const classes = node.classes || [];
    const classStr = classes.join(' ').toLowerCase();

    for (const [name, pattern] of Object.entries(COMPONENT_PATTERNS)) {
      // Check tag/selector match
      for (const selector of pattern.selectors) {
        if (selector === tag) return name;
        if (selector.startsWith('[role="') && node.role === selector.slice(7, -2)) {
          return name;
        }
      }

      // Check class patterns
      for (const classPattern of pattern.classPatterns) {
        if (classStr.includes(classPattern)) return name;
      }
    }

    return null;
  }

  // ============================================
  // HTML Skeleton Generator
  // ============================================

  function generateHTMLNode(node, depth = 0) {
    if (!node || !node.tag) return '';

    const tag = node.tag;
    const attrs = [];

    // Add id if present
    if (node.id) {
      attrs.push(`id="${escapeHtml(node.id)}"`);
    }

    // Add classes if present
    if (node.classes?.length) {
      attrs.push(`class="${escapeHtml(node.classes.join(' '))}"`);
    }

    // Add role if present and not implicit
    if (node.role && !['banner', 'navigation', 'main', 'complementary', 'contentinfo'].includes(node.role)) {
      attrs.push(`role="${escapeHtml(node.role)}"`);
    }

    // Add aria-label if present
    if (node.ariaLabel) {
      attrs.push(`aria-label="${escapeHtml(node.ariaLabel)}"`);
    }

    const attrStr = attrs.length ? ' ' + attrs.join(' ') : '';
    const indentation = '  '.repeat(depth);

    // Self-closing tags
    const selfClosing = ['img', 'br', 'hr', 'input', 'meta', 'link'];
    if (selfClosing.includes(tag)) {
      return `${indentation}<${tag}${attrStr} />`;
    }

    // Leaf node with text
    if (!node.children?.length) {
      const text = node.text ? escapeHtml(node.text.slice(0, 50)) : '';
      if (text && text.length < 50) {
        return `${indentation}<${tag}${attrStr}>${text}</${tag}>`;
      }
      return `${indentation}<${tag}${attrStr}></${tag}>`;
    }

    // Node with children
    const childrenHtml = node.children
      .map(child => generateHTMLNode(child, depth + 1))
      .filter(Boolean)
      .join('\n');

    return `${indentation}<${tag}${attrStr}>\n${childrenHtml}\n${indentation}</${tag}>`;
  }

  function toHTMLSkeleton(structureData) {
    if (!structureData?.dom?.tree) {
      return '<!-- No structure data available -->';
    }

    const tree = structureData.dom.tree;
    const title = structureData.meta?.title || 'Page';

    const bodyContent = generateHTMLNode(tree, 2);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
${bodyContent}
</body>
</html>`;
  }

  // ============================================
  // React Component Generator
  // ============================================

  function generateReactComponent(name, node, children = []) {
    const componentName = toPascalCase(name);
    const tag = node?.tag || 'div';
    const classes = node?.classes?.join(' ') || '';

    let childrenJsx = '';
    if (children.length > 0) {
      childrenJsx = children.map(c => `      <${c} />`).join('\n');
    } else if (node?.text) {
      childrenJsx = `      <p>${escapeHtml(node.text.slice(0, 100))}</p>`;
    } else {
      childrenJsx = `      {/* ${componentName} content */}`;
    }

    return `import React from 'react';

interface ${componentName}Props {
  className?: string;
}

export function ${componentName}({ className }: ${componentName}Props) {
  return (
    <${tag} className={\`${classes}\${className ? ' ' + className : ''}\`}>
${childrenJsx}
    </${tag}>
  );
}

export default ${componentName};
`;
  }

  function extractComponentsFromTree(node, components = new Map()) {
    if (!node) return components;

    const componentType = identifyComponentType(node);
    if (componentType && !components.has(componentType)) {
      components.set(componentType, {
        name: componentType,
        node,
        children: []
      });
    }

    // Process children
    if (node.children) {
      for (const child of node.children) {
        extractComponentsFromTree(child, components);

        // Track parent-child relationships
        const childType = identifyComponentType(child);
        if (componentType && childType && componentType !== childType) {
          const parent = components.get(componentType);
          if (parent && !parent.children.includes(childType)) {
            parent.children.push(childType);
          }
        }
      }
    }

    return components;
  }

  function toReactComponents(structureData) {
    if (!structureData?.dom?.tree) {
      return { error: 'No structure data available' };
    }

    const components = extractComponentsFromTree(structureData.dom.tree);
    const files = {};

    // Generate Page component
    const pageChildren = Array.from(components.keys());
    files['Page.tsx'] = `import React from 'react';
${pageChildren.map(c => `import { ${c} } from './${c}';`).join('\n')}

export function Page() {
  return (
    <div className="page">
${pageChildren.map(c => `      <${c} />`).join('\n')}
    </div>
  );
}

export default Page;
`;

    // Generate individual components
    for (const [name, data] of components) {
      files[`${name}.tsx`] = generateReactComponent(name, data.node, data.children);
    }

    // Generate index file
    files['index.ts'] = `// Auto-generated component exports
${Array.from(components.keys()).map(c => `export { ${c} } from './${c}';`).join('\n')}
export { Page } from './Page';
`;

    return {
      files,
      componentCount: components.size + 1,
      components: Array.from(components.keys())
    };
  }

  // ============================================
  // Vue Component Generator
  // ============================================

  function generateVueComponent(name, node, children = []) {
    const componentName = toPascalCase(name);
    const tag = node?.tag || 'div';
    const classes = node?.classes?.join(' ') || '';

    let childrenTemplate = '';
    if (children.length > 0) {
      childrenTemplate = children.map(c => `    <${c} />`).join('\n');
    } else if (node?.text) {
      childrenTemplate = `    <p>${escapeHtml(node.text.slice(0, 100))}</p>`;
    } else {
      childrenTemplate = `    <!-- ${componentName} content -->`;
    }

    const imports = children.length > 0
      ? `import { ${children.join(', ')} } from './';`
      : '';

    return `<script setup lang="ts">
${imports}

interface Props {
  class?: string;
}

defineProps<Props>();
</script>

<template>
  <${tag} :class="['${classes}', $props.class]">
${childrenTemplate}
  </${tag}>
</template>

<style scoped>
/* ${componentName} styles */
</style>
`;
  }

  function toVueComponents(structureData) {
    if (!structureData?.dom?.tree) {
      return { error: 'No structure data available' };
    }

    const components = extractComponentsFromTree(structureData.dom.tree);
    const files = {};

    // Generate Page component
    const pageChildren = Array.from(components.keys());
    files['Page.vue'] = `<script setup lang="ts">
${pageChildren.map(c => `import ${c} from './${c}.vue';`).join('\n')}
</script>

<template>
  <div class="page">
${pageChildren.map(c => `    <${c} />`).join('\n')}
  </div>
</template>

<style scoped>
.page {
  min-height: 100vh;
}
</style>
`;

    // Generate individual components
    for (const [name, data] of components) {
      files[`${name}.vue`] = generateVueComponent(name, data.node, data.children);
    }

    // Generate index file
    files['index.ts'] = `// Auto-generated component exports
${Array.from(components.keys()).map(c => `export { default as ${c} } from './${c}.vue';`).join('\n')}
export { default as Page } from './Page.vue';
`;

    return {
      files,
      componentCount: components.size + 1,
      components: Array.from(components.keys())
    };
  }

  // ============================================
  // Replica Code Generator (Blueprint -> CSS/React/HTML)
  // ============================================

  function shouldSelfClose(tag) {
    return ['img', 'br', 'hr', 'input', 'meta', 'link'].includes(String(tag || '').toLowerCase());
  }

  function pickTag(tag) {
    const t = String(tag || 'div').toLowerCase();
    // Keep to common safe tags.
    if (!/^[a-z][a-z0-9-]*$/.test(t)) return 'div';
    return t;
  }

  function buildReplicaAttrs(node, options) {
    const attrs = [];
    const dataAttr = options?.dataAttrName || 'data-se-id';

    if (node?.uid) attrs.push([dataAttr, node.uid]);

    if (node?.domId) attrs.push(['id', node.domId]);
    if (node?.role) attrs.push(['role', node.role]);
    if (node?.ariaLabel) attrs.push(['aria-label', node.ariaLabel]);

    const tag = pickTag(node?.tag);
    if (tag === 'a') {
      if (node?.href) attrs.push(['href', node.href]);
      if (node?.target) attrs.push(['target', node.target]);
      if (node?.rel) attrs.push(['rel', node.rel]);
    } else if (tag === 'img') {
      if (node?.src) attrs.push(['src', node.src]);
      if (node?.alt) attrs.push(['alt', node.alt]);
      if (node?.loading) attrs.push(['loading', node.loading]);
    } else if (tag === 'input' || tag === 'textarea') {
      if (tag === 'input' && node?.inputType) attrs.push(['type', node.inputType]);
      if (node?.name) attrs.push(['name', node.name]);
      if (node?.placeholder) attrs.push(['placeholder', node.placeholder]);
      if (node?.autoComplete) attrs.push(['autocomplete', node.autoComplete]);
    } else if (tag === 'button') {
      if (node?.buttonType) attrs.push(['type', node.buttonType]);
    }

    return attrs;
  }

  function attrsToHtml(attrs) {
    const out = [];
    for (const [k, v] of attrs) {
      if (!k) continue;
      if (v === null || v === undefined) continue;
      const value = String(v);
      out.push(`${k}="${escapeHtml(value)}"`);
    }
    return out.length ? ' ' + out.join(' ') : '';
  }

  function attrsToJsx(attrs) {
    const out = [];
    for (const [k, v] of attrs) {
      if (!k) continue;
      if (v === null || v === undefined) continue;
      const value = String(v);
      // Use double quotes for JSX string literals.
      out.push(`${k}="${escapeJsxText(value)}"`);
    }
    return out.length ? ' ' + out.join(' ') : '';
  }

  function buildCssDeclsFromBlueprintNode(node) {
    const decls = [];
    if (!node) return decls;

    // Layout
    const layout = node.layout || null;
    if (layout) {
      pushDecl(decls, 'display', layout.display);
      pushDecl(decls, 'position', layout.position);
      pushDecl(decls, 'zIndex', layout.zIndex);
      pushDecl(decls, 'top', layout.top);
      pushDecl(decls, 'right', layout.right);
      pushDecl(decls, 'bottom', layout.bottom);
      pushDecl(decls, 'left', layout.left);

      if (layout.flex) {
        pushDecl(decls, 'flexDirection', layout.flex.direction);
        pushDecl(decls, 'flexWrap', layout.flex.wrap);
        pushDecl(decls, 'justifyContent', layout.flex.justify);
        pushDecl(decls, 'alignItems', layout.flex.align);
        pushDecl(decls, 'gap', layout.flex.gap);
      }

      if (layout.grid) {
        pushDecl(decls, 'gridTemplateColumns', layout.grid.columns);
        pushDecl(decls, 'gridTemplateRows', layout.grid.rows);
        pushDecl(decls, 'gridAutoFlow', layout.grid.autoFlow);
        pushDecl(decls, 'gap', layout.grid.gap);
      }

      pushDecl(decls, 'alignSelf', layout.alignSelf);
      pushDecl(decls, 'order', layout.order);
    }

    // Constraints (spacing + sizing bounds)
    const constraints = node.constraints || null;
    if (constraints?.spacing) {
      const padding = boxToShorthand(constraints.spacing.padding);
      const margin = boxToShorthand(constraints.spacing.margin);
      if (padding && padding !== '0 0 0 0') pushDecl(decls, 'padding', padding);
      if (margin && margin !== '0 0 0 0') pushDecl(decls, 'margin', margin);
      // Prefer container-level gap from layout.flex/grid; keep as fallback.
      if (!decls.some((d) => d.startsWith('gap:')) && constraints.spacing.gap) {
        const g = String(constraints.spacing.gap).trim();
        if (g && g !== '0' && g !== '0px' && g !== 'normal') {
          pushDecl(decls, 'gap', g);
        }
      }
    }
    if (constraints?.size) {
      const minW = constraints.size.minWidth;
      const maxW = constraints.size.maxWidth;
      const minH = constraints.size.minHeight;
      const maxH = constraints.size.maxHeight;
      if (typeof minW === 'number' && minW > 0) pushDecl(decls, 'minWidth', `${minW}px`);
      if (typeof maxW === 'number' && maxW > 0) pushDecl(decls, 'maxWidth', `${maxW}px`);
      if (typeof minH === 'number' && minH > 0) pushDecl(decls, 'minHeight', `${minH}px`);
      if (typeof maxH === 'number' && maxH > 0) pushDecl(decls, 'maxHeight', `${maxH}px`);
    }

    // Typography
    const typography = node.typography || null;
    if (typography) {
      pushDecl(decls, 'fontFamily', typography.fontFamily);
      pushDecl(decls, 'fontSize', typography.fontSize);
      pushDecl(decls, 'fontWeight', typography.fontWeight);
      pushDecl(decls, 'fontStyle', typography.fontStyle);
      pushDecl(decls, 'lineHeight', typography.lineHeight);
      pushDecl(decls, 'letterSpacing', typography.letterSpacing);
      pushDecl(decls, 'textAlign', typography.textAlign);
      pushDecl(decls, 'textTransform', typography.textTransform);
      pushDecl(decls, 'textDecorationLine', typography.textDecorationLine);
      pushDecl(decls, 'textDecorationStyle', typography.textDecorationStyle);
      pushDecl(decls, 'textDecorationColor', typography.textDecorationColor);
      pushDecl(decls, 'whiteSpace', typography.whiteSpace);
      pushDecl(decls, 'textOverflow', typography.textOverflow);
    }

    // Visual
    const visual = node.visual || null;
    if (visual) {
      pushDecl(decls, 'color', visual.color);
      pushDecl(decls, 'backgroundColor', visual.backgroundColor);
      pushDecl(decls, 'backgroundImage', visual.backgroundImage);
      pushDecl(decls, 'backgroundSize', visual.backgroundSize);
      pushDecl(decls, 'backgroundPosition', visual.backgroundPosition);
      pushDecl(decls, 'backgroundRepeat', visual.backgroundRepeat);
      pushDecl(decls, 'borderRadius', visual.borderRadius);

      if (visual.border) {
        const b = visual.border;
        if (isPlainObject(b) && 'width' in b && 'style' in b && 'color' in b) {
          pushDecl(decls, 'border', `${b.width} ${b.style} ${b.color}`);
        } else if (isPlainObject(b)) {
          if (b.top) pushDecl(decls, 'borderTop', `${b.top.width} ${b.top.style} ${b.top.color}`);
          if (b.right) pushDecl(decls, 'borderRight', `${b.right.width} ${b.right.style} ${b.right.color}`);
          if (b.bottom) pushDecl(decls, 'borderBottom', `${b.bottom.width} ${b.bottom.style} ${b.bottom.color}`);
          if (b.left) pushDecl(decls, 'borderLeft', `${b.left.width} ${b.left.style} ${b.left.color}`);
        }
      }

      pushDecl(decls, 'boxShadow', visual.boxShadow);
      pushDecl(decls, 'opacity', visual.opacity);
      pushDecl(decls, 'transform', visual.transform);
      pushDecl(decls, 'filter', visual.filter);
      pushDecl(decls, 'backdropFilter', visual.backdropFilter);
      pushDecl(decls, 'mixBlendMode', visual.mixBlendMode);
    }

    return decls;
  }

  function walkBlueprintTree(root, fn, options = {}) {
    const maxNodes = Number.isFinite(options.maxNodes) ? options.maxNodes : 240;
    const maxDepth = Number.isFinite(options.maxDepth) ? options.maxDepth : 12;
    let count = 0;

    function visit(node, depth) {
      if (!node || count >= maxNodes) return;
      if (depth > maxDepth) return;
      count += 1;
      fn(node, depth);
      const children = Array.isArray(node.children) ? node.children : [];
      for (const child of children) {
        if (count >= maxNodes) break;
        visit(child, depth + 1);
      }
    }

    visit(root, 0);
    return count;
  }

  function toReplicaCSS(blueprint, stateCapture, options = {}) {
    if (!blueprint?.tree) return '';

    const dataAttr = options.dataAttrName || 'data-se-id';
    const selectorFor = (uid) => `[${dataAttr}="${uid}"]`;

    const rules = [];

    // Base reset for predictable rendering.
    rules.push(`/* Generated by style-extractor replica codegen */`);
    rules.push(`* { box-sizing: border-box; }`);
    rules.push(`html, body { margin: 0; padding: 0; }`);
    rules.push(`${selectorFor(blueprint.tree.uid)} { min-height: 100vh; }`);

    walkBlueprintTree(
      blueprint.tree,
      (node) => {
        const decls = buildCssDeclsFromBlueprintNode(node);
        if (!decls.length) return;
        rules.push(`${selectorFor(node.uid)} {`);
        rules.push(`  ${decls.join('\n  ')}`);
        rules.push(`}`);
      },
      options
    );

    // Optional state styles from captured matrix.
    const matrix = stateCapture?.captured?.states || null;
    const selectorToUid = new Map();
    walkBlueprintTree(
      blueprint.tree,
      (node) => {
        if (node?.selector && node?.uid) selectorToUid.set(node.selector, node.uid);
      },
      { maxNodes: options.maxNodes || 240, maxDepth: options.maxDepth || 12 }
    );

    const statePseudo = {
      hover: ':hover',
      active: ':active',
      focus: ':focus',
      focusVisible: ':focus-visible',
      focusWithin: ':focus-within',
      disabled: ':disabled',
      checked: ':checked',
      invalid: ':invalid'
    };

    const allowedProps = new Set([
      'backgroundColor',
      'backgroundImage',
      'backgroundSize',
      'backgroundPosition',
      'backgroundRepeat',
      'color',
      'borderColor',
      'borderWidth',
      'borderStyle',
      'borderRadius',
      'outline',
      'outlineColor',
      'outlineWidth',
      'outlineStyle',
      'outlineOffset',
      'boxShadow',
      'textShadow',
      'opacity',
      'transform',
      'filter',
      'backdropFilter',
      'textDecoration',
      'textDecorationColor',
      'fontWeight',
      'cursor'
    ]);

    const stateLimit = Number.isFinite(options.stateLimit) ? options.stateLimit : 12;
    if (matrix && typeof matrix === 'object') {
      let seen = 0;
      for (const [selector, entry] of Object.entries(matrix)) {
        if (seen >= stateLimit) break;
        const uid = selectorToUid.get(selector);
        if (!uid) continue;

        const states = entry?.states && typeof entry.states === 'object' ? entry.states : null;
        if (!states) continue;
        const base = states.default || null;
        if (!base) continue;

        // Base pseudo-element evidence (default state only).
        const pseudoAllowed = new Set([
          'content',
          ...Array.from(allowedProps),
          'fill',
          'stroke',
          'textDecorationLine',
          'textDecorationStyle',
          'textDecorationColor'
        ]);
        const collectPseudoDecls = (styleMap, pseudoName) => {
          if (!styleMap || typeof styleMap !== 'object') return null;
          const prefix = `${pseudoName}.`;
          const decls = [];
          for (const [k, v] of Object.entries(styleMap)) {
            if (!k || typeof k !== 'string') continue;
            if (!k.startsWith(prefix)) continue;
            const prop = k.slice(prefix.length);
            if (!pseudoAllowed.has(prop)) continue;
            pushDecl(decls, prop, v);
          }
          // Only emit pseudo rules when content is present (otherwise it's usually noise).
          if (!decls.some((d) => d.startsWith('content:'))) return null;
          return decls;
        };

        const beforeDecls = collectPseudoDecls(base, '::before');
        if (beforeDecls) {
          rules.push(`${selectorFor(uid)}::before {`);
          rules.push(`  ${beforeDecls.join('\n  ')}`);
          rules.push(`}`);
        }
        const afterDecls = collectPseudoDecls(base, '::after');
        if (afterDecls) {
          rules.push(`${selectorFor(uid)}::after {`);
          rules.push(`  ${afterDecls.join('\n  ')}`);
          rules.push(`}`);
        }

        for (const [stateName, styles] of Object.entries(states)) {
          if (stateName === 'default') continue;
          const pseudo = statePseudo[stateName];
          if (!pseudo) continue;
          if (!styles || typeof styles !== 'object') continue;

          const decls = [];
          for (const [prop, value] of Object.entries(styles)) {
            if (!allowedProps.has(prop)) continue;
            if (base[prop] === value) continue;
            pushDecl(decls, prop, value);
          }
          if (!decls.length) continue;

          rules.push(`${selectorFor(uid)}${pseudo} {`);
          rules.push(`  ${decls.join('\n  ')}`);
          rules.push(`}`);
        }

        seen += 1;
      }
    }

    return rules.join('\n') + '\n';
  }

  function renderReplicaNodeToHtml(node, depth, options = {}) {
    if (!node) return '';

    const tag = pickTag(node.tag);
    const attrs = buildReplicaAttrs(node, options);
    const attrStr = attrsToHtml(attrs);
    const pad = '  '.repeat(depth);

    const children = Array.isArray(node.children) ? node.children : [];
    const text = node.text ? escapeHtml(String(node.text)) : '';

    // Icon placeholder if this is icon-only.
    let iconHtml = '';
    if (!text && node.icon?.type === 'svg') {
      if (node.icon.markup) {
        iconHtml = String(node.icon.markup);
      } else {
        const viewBox = node.icon.viewBox ? ` viewBox="${escapeHtml(String(node.icon.viewBox))}"` : '';
        iconHtml = `<svg aria-hidden="true"${viewBox}></svg>`;
      }
    }

    if (shouldSelfClose(tag)) {
      return `${pad}<${tag}${attrStr} />`;
    }

    if (!children.length) {
      const content = text || iconHtml;
      return `${pad}<${tag}${attrStr}>${content}</${tag}>`;
    }

    const renderedChildren = children
      .map((child) => renderReplicaNodeToHtml(child, depth + 1, options))
      .filter(Boolean)
      .join('\n');

    const contentLine = text ? `${pad}  ${text}\n` : '';
    const iconLine = iconHtml ? `${pad}  ${iconHtml}\n` : '';

    return `${pad}<${tag}${attrStr}>\n${contentLine}${iconLine}${renderedChildren}\n${pad}</${tag}>`;
  }

  function renderReplicaNodeToJsx(node, depth, options = {}) {
    if (!node) return '';

    const tag = pickTag(node.tag);
    const attrs = buildReplicaAttrs(node, options);
    const attrStr = attrsToJsx(attrs);
    const pad = '  '.repeat(depth);

    const children = Array.isArray(node.children) ? node.children : [];
    const text = node.text ? escapeJsxText(String(node.text)) : '';

    let iconJsx = '';
    if (!text && node.icon?.type === 'svg') {
      if (node.icon.markup) {
        const markupLiteral = JSON.stringify(String(node.icon.markup));
        iconJsx = `<span dangerouslySetInnerHTML={{ __html: ${markupLiteral} }} />`;
      } else {
        const viewBox = node.icon.viewBox ? ` viewBox="${escapeJsxText(String(node.icon.viewBox))}"` : '';
        iconJsx = `<svg aria-hidden="true"${viewBox}></svg>`;
      }
    }

    if (shouldSelfClose(tag)) {
      return `${pad}<${tag}${attrStr} />`;
    }

    if (!children.length) {
      const content = text || iconJsx;
      return `${pad}<${tag}${attrStr}>${content}</${tag}>`;
    }

    const renderedChildren = children
      .map((child) => renderReplicaNodeToJsx(child, depth + 1, options))
      .filter(Boolean)
      .join('\n');

    const contentLine = text ? `${pad}  ${text}\n` : '';
    const iconLine = iconJsx ? `${pad}  ${iconJsx}\n` : '';

    return `${pad}<${tag}${attrStr}>\n${contentLine}${iconLine}${renderedChildren}\n${pad}</${tag}>`;
  }

  function toReplicaHTML(blueprint, options = {}) {
    if (!blueprint?.tree) return '<!-- No blueprint tree available -->';

    const title = blueprint?.meta?.title || 'Replica';
    const rootTag = pickTag(blueprint.tree.tag);

    // If the blueprint root is <body>, apply its attributes to the real <body> and render children only.
    let bodyAttrs = '';
    let bodyInner = '';
    if (rootTag === 'body') {
      bodyAttrs = attrsToHtml(buildReplicaAttrs(blueprint.tree, options));
      const children = Array.isArray(blueprint.tree.children) ? blueprint.tree.children : [];
      bodyInner = children
        .map((child) => renderReplicaNodeToHtml(child, 1, options))
        .filter(Boolean)
        .join('\n');
    } else {
      bodyInner = renderReplicaNodeToHtml(blueprint.tree, 1, options);
    }

    return `<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\" />\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n  <title>${escapeHtml(title)}</title>\n  <link rel=\"stylesheet\" href=\"replica.css\" />\n</head>\n<body${bodyAttrs}>\n${bodyInner}\n</body>\n</html>\n`;
  }

  function toReplicaReact(blueprint, stateCapture, options = {}) {
    if (!blueprint?.tree) return { error: 'No blueprint tree available' };

    const title = blueprint?.meta?.title || 'Replica';
    const dataAttrName = options.dataAttrName || 'data-se-id';

    const css = toReplicaCSS(blueprint, stateCapture, options);

    const rootTag = pickTag(blueprint.tree.tag);
    let jsx = '';
    if (rootTag === 'body') {
      const rootAttrs = attrsToJsx(buildReplicaAttrs(blueprint.tree, { ...options, dataAttrName }));
      const children = Array.isArray(blueprint.tree.children) ? blueprint.tree.children : [];
      const inner = children
        .map((child) => renderReplicaNodeToJsx(child, 5, { ...options, dataAttrName }))
        .filter(Boolean)
        .join('\n');
      jsx = `    <div${rootAttrs}>\n${inner}\n    </div>`;
    } else {
      jsx = renderReplicaNodeToJsx(blueprint.tree, 4, { ...options, dataAttrName });
    }

    const files = {};
    files['replica.css'] = css;
    files['index.html'] = toReplicaHTML(blueprint, { ...options, dataAttrName });
    files['Page.tsx'] = `import React from 'react';\nimport './replica.css';\n\nexport default function Page() {\n  return (\n    <React.Fragment>\n      {/* ${escapeJsxText(title)} */}\n${jsx}\n    </React.Fragment>\n  );\n}\n`;

    return {
      format: 'replica',
      files
    };
  }

  // ============================================
  // Unified Generator
  // ============================================

  function generate(structureData, format = 'react') {
    debug('Generating code in format:', format);

    switch (format.toLowerCase()) {
      case 'html':
        return {
          format: 'html',
          files: {
            'skeleton.html': toHTMLSkeleton(structureData)
          }
        };

      case 'react':
      case 'tsx':
        return {
          format: 'react',
          ...toReactComponents(structureData)
        };

      case 'vue':
        return {
          format: 'vue',
          ...toVueComponents(structureData)
        };

      case 'all':
        return {
          html: {
            format: 'html',
            files: {
              'skeleton.html': toHTMLSkeleton(structureData)
            }
          },
          react: {
            format: 'react',
            ...toReactComponents(structureData)
          },
          vue: {
            format: 'vue',
            ...toVueComponents(structureData)
          }
        };

      default:
        return { error: `Unknown format: ${format}` };
    }
  }

  // ============================================
  // Export
  // ============================================

  window.__seCodeGen = {
    installed: true,

    // Core generators
    toHTMLSkeleton,
    toReactComponents,
    toVueComponents,

    // Replica generators (blueprint-driven)
    toReplicaCSS,
    toReplicaHTML,
    toReplicaReact,

    // Unified generator
    generate,

    // Utilities
    identifyComponentType,
    extractComponentsFromTree,
    toPascalCase,
    toKebabCase,

    // Constants
    COMPONENT_PATTERNS
  };
})();
