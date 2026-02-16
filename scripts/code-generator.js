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

  function normalizeVarName(varName) {
    if (!varName) return '';
    const v = String(varName).trim();
    if (!v) return '';
    if (v.startsWith('var(')) return v;
    // Expected input is "--token-name" from css reverse-map lookups.
    if (v.startsWith('--')) return v;
    return v;
  }

  function formatCssVarRef(varName, fallbackValue, options = {}) {
    const v = normalizeVarName(varName);
    if (!v) return null;
    const includeFallback = options.varRefFallback !== false;
    const fb = fallbackValue === null || fallbackValue === undefined ? '' : String(fallbackValue).trim();

    // If caller already provided var(...), keep it and don't attempt to inject fallback.
    if (v.startsWith('var(')) return v;
    if (!includeFallback || !fb) return `var(${v})`;
    return `var(${v}, ${fb})`;
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

  function buildCssDeclsFromBlueprintNode(node, options = {}) {
    const decls = [];
    if (!node) return decls;

    const varRefs = options.useVarRefs === false ? null : (node.varRefs || null);
    const withVar = (key, literalValue) => {
      if (!varRefs || !key) return literalValue;
      const ref = varRefs[key];
      if (!ref) return literalValue;
      const out = formatCssVarRef(ref, literalValue, options);
      return out || literalValue;
    };

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
      pushDecl(decls, 'overflow', layout.overflow);
      pushDecl(decls, 'overflowX', layout.overflowX);
      pushDecl(decls, 'overflowY', layout.overflowY);

      if (layout.flex) {
        pushDecl(decls, 'flexDirection', layout.flex.direction);
        pushDecl(decls, 'flexWrap', layout.flex.wrap);
        pushDecl(decls, 'justifyContent', layout.flex.justify);
        pushDecl(decls, 'alignItems', layout.flex.align);
        pushDecl(decls, 'gap', layout.flex.gap);
        pushDecl(decls, 'alignContent', layout.flex.alignContent);
      }

      if (layout.grid) {
        const cols = options.normalizeGridTemplateColumns === false
          ? layout.grid.columns
          : normalizeGridTemplateColumns(layout.grid.columns, node?.rect, layout.grid.gap, options);
        pushDecl(decls, 'gridTemplateColumns', cols);
        let rows = layout.grid.rows;
        if (options.omitPixelGridTemplateRows !== false && isPurePxTrackList(rows)) rows = null;
        pushDecl(decls, 'gridTemplateRows', rows);
        pushDecl(decls, 'gridAutoFlow', layout.grid.autoFlow);
        pushDecl(decls, 'gap', layout.grid.gap);
        pushDecl(decls, 'justifyItems', layout.grid.justifyItems);
        pushDecl(decls, 'alignItems', layout.grid.alignItems);
        pushDecl(decls, 'justifyContent', layout.grid.justifyContent);
        pushDecl(decls, 'alignContent', layout.grid.alignContent);
      }

      if (layout.flexItem) {
        pushDecl(decls, 'flexGrow', layout.flexItem.grow);
        pushDecl(decls, 'flexShrink', layout.flexItem.shrink);
        pushDecl(decls, 'flexBasis', layout.flexItem.basis);
      }

      if (layout.gridItem) {
        pushDecl(decls, 'gridColumnStart', layout.gridItem.columnStart);
        pushDecl(decls, 'gridColumnEnd', layout.gridItem.columnEnd);
        pushDecl(decls, 'gridRowStart', layout.gridItem.rowStart);
        pushDecl(decls, 'gridRowEnd', layout.gridItem.rowEnd);
      }

      pushDecl(decls, 'alignSelf', layout.alignSelf);
      pushDecl(decls, 'justifySelf', layout.justifySelf);
      pushDecl(decls, 'order', layout.order);
    }

    // Constraints (spacing + sizing bounds)
    const constraints = node.constraints || null;
    if (constraints?.spacing) {
      const padding = boxToShorthand(constraints.spacing.padding);
      const normalizedMarginBox = maybeNormalizeCenteringMargin(constraints.spacing.margin, constraints.size);
      const margin = boxToShorthand(normalizedMarginBox || constraints.spacing.margin);
      if (padding && padding !== '0 0 0 0') pushDecl(decls, 'padding', padding);
      if (margin && margin !== '0 0 0 0') pushDecl(decls, 'margin', margin);
      // Prefer container-level gap from layout.flex/grid; keep as fallback.
      if (!decls.some((d) => d.startsWith('gap:')) && constraints.spacing.gap) {
        const g = String(constraints.spacing.gap).trim();
        if (g && g !== '0' && g !== '0px' && g !== 'normal') {
          pushDecl(decls, 'gap', withVar('gap', g));
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
      pushDecl(decls, 'fontFamily', withVar('fontFamily', typography.fontFamily));
      pushDecl(decls, 'fontSize', withVar('fontSize', typography.fontSize));
      pushDecl(decls, 'fontWeight', typography.fontWeight);
      pushDecl(decls, 'fontStyle', typography.fontStyle);
      pushDecl(decls, 'lineHeight', withVar('lineHeight', typography.lineHeight));
      pushDecl(decls, 'letterSpacing', withVar('letterSpacing', typography.letterSpacing));
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
      pushDecl(decls, 'color', withVar('color', visual.color));
      pushDecl(decls, 'backgroundColor', withVar('backgroundColor', visual.backgroundColor));
      pushDecl(decls, 'backgroundImage', visual.backgroundImage);
      pushDecl(decls, 'backgroundSize', visual.backgroundSize);
      pushDecl(decls, 'backgroundPosition', visual.backgroundPosition);
      pushDecl(decls, 'backgroundRepeat', visual.backgroundRepeat);
      pushDecl(decls, 'borderRadius', withVar('borderRadius', visual.borderRadius));
      pushDecl(decls, 'cursor', visual.cursor);
      pushDecl(decls, 'aspectRatio', visual.aspectRatio);
      pushDecl(decls, 'objectFit', visual.objectFit);
      pushDecl(decls, 'objectPosition', visual.objectPosition);

      if (visual.border) {
        const b = visual.border;
        if (isPlainObject(b) && 'width' in b && 'style' in b && 'color' in b) {
          const borderColor = withVar('borderColor', b.color);
          pushDecl(decls, 'border', `${b.width} ${b.style} ${borderColor}`);
        } else if (isPlainObject(b)) {
          if (b.top) pushDecl(decls, 'borderTop', `${b.top.width} ${b.top.style} ${b.top.color}`);
          if (b.right) pushDecl(decls, 'borderRight', `${b.right.width} ${b.right.style} ${b.right.color}`);
          if (b.bottom) pushDecl(decls, 'borderBottom', `${b.bottom.width} ${b.bottom.style} ${b.bottom.color}`);
          if (b.left) pushDecl(decls, 'borderLeft', `${b.left.width} ${b.left.style} ${b.left.color}`);
        }
      }

      pushDecl(decls, 'boxShadow', withVar('boxShadow', visual.boxShadow));
      pushDecl(decls, 'opacity', visual.opacity);
      pushDecl(decls, 'transform', visual.transform);
      pushDecl(decls, 'filter', visual.filter);
      pushDecl(decls, 'backdropFilter', visual.backdropFilter);
      pushDecl(decls, 'mixBlendMode', visual.mixBlendMode);

      if (visual.transition) {
        pushDecl(decls, 'transitionProperty', visual.transition.property);
        pushDecl(decls, 'transitionDuration', visual.transition.duration);
        pushDecl(decls, 'transitionTimingFunction', visual.transition.timingFunction);
        pushDecl(decls, 'transitionDelay', visual.transition.delay);
      }
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

  function normalizeCssValue(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/\s+/g, ' ').trim();
  }

  function normalizeBoxShorthand(value) {
    const v = normalizeCssValue(value);
    if (!v) return '';
    const parts = v.split(' ').filter(Boolean);
    if (parts.length === 0) return '';
    if (parts.length === 1) return `${parts[0]} ${parts[0]} ${parts[0]} ${parts[0]}`;
    if (parts.length === 2) return `${parts[0]} ${parts[1]} ${parts[0]} ${parts[1]}`;
    if (parts.length === 3) return `${parts[0]} ${parts[1]} ${parts[2]} ${parts[1]}`;
    return parts.slice(0, 4).join(' ');
  }

  function parsePx(value) {
    if (value === null || value === undefined) return null;
    const m = String(value).trim().match(/^(-?\d+(?:\.\d+)?)px$/);
    if (!m) return null;
    const n = parseFloat(m[1]);
    return Number.isFinite(n) ? n : null;
  }

  function maybeNormalizeCenteringMargin(marginBox, sizeBox) {
    // Many centered containers resolve `margin-left/right: auto` into symmetric pixel values.
    // When we also have an explicit max-width, prefer `auto` so the replica stays centered.
    if (!marginBox || typeof marginBox !== 'object') return null;
    if (!sizeBox || typeof sizeBox !== 'object') return null;
    if (!(typeof sizeBox.maxWidth === 'number' && sizeBox.maxWidth > 0)) return null;

    const top = marginBox.top || '0';
    const bottom = marginBox.bottom || top;
    const left = marginBox.left || '0';
    const right = marginBox.right || left;

    const l = String(left).trim();
    const r = String(right).trim();

    if (l === 'auto' || r === 'auto') {
      return { top, right: 'auto', bottom, left: 'auto' };
    }

    const lpx = parsePx(l);
    const rpx = parsePx(r);
    if (lpx === null || rpx === null) return null;

    if (Math.abs(lpx - rpx) > 2) return null;
    if (Math.max(lpx, rpx) < 16) return null;

    return { top, right: 'auto', bottom, left: 'auto' };
  }

  function parseGapPx(gap) {
    const v = normalizeCssValue(gap);
    if (!v) return { row: null, col: null };
    const parts = v.split(' ').filter(Boolean);
    const row = parsePx(parts[0]);
    const col = parsePx(parts[1] || parts[0]);
    return { row, col };
  }

  function parsePxTrackList(columns) {
    // Only handle simple resolved lists like: "317px 317px" or "658px".
    const v = normalizeCssValue(columns);
    if (!v || v === 'none') return null;
    const parts = v.split(' ').filter(Boolean);
    if (parts.length < 1) return null;

    const nums = [];
    for (const p of parts) {
      const n = parsePx(p);
      if (n === null) return null;
      nums.push(n);
    }
    return nums;
  }

  function isPurePxTrackList(value) {
    const v = normalizeCssValue(value);
    if (!v || v === 'none') return false;
    const lower = v.toLowerCase();
    if (
      lower.includes('fr') ||
      lower.includes('minmax') ||
      lower.includes('auto-fit') ||
      lower.includes('auto-fill') ||
      lower.includes('%') ||
      lower.includes('calc(') ||
      lower.includes('repeat(') ||
      lower.includes('auto') ||
      lower.includes('min-content') ||
      lower.includes('max-content') ||
      lower.includes('fit-content')
    ) {
      return false;
    }
    const tracks = parsePxTrackList(v);
    return !!tracks;
  }

  function normalizeGridTemplateColumns(columns, rect, gap, options = {}) {
    // Convert some computed pixel-resolved grids back into flexible fr tracks.
    // Example: "317px 317px" -> "repeat(2, minmax(0, 1fr))"
    const v = normalizeCssValue(columns);
    if (!v || v === 'none') return columns;
    if (options.normalizeGridTemplateColumns === false) return columns;

    const lower = v.toLowerCase();
    // Already flexible or expression-based: keep as-is.
    if (
      lower.includes('fr') ||
      lower.includes('minmax') ||
      lower.includes('auto-fit') ||
      lower.includes('auto-fill') ||
      lower.includes('%') ||
      lower.includes('calc(')
    ) {
      return columns;
    }

    const tracks = parsePxTrackList(v);
    if (!tracks) return columns;
    const n = tracks.length;
    if (n < 1 || n > 6) return columns;

    const min = Math.min(...tracks);
    const max = Math.max(...tracks);
    if (!(min > 0) || !(max > 0)) return columns;

    if (n >= 2) {
      const equalTol = Number.isFinite(options.gridColumnEqualTolerance) ? options.gridColumnEqualTolerance : 0.04;
      if ((max - min) / max > equalTol) return columns;
    } else {
      const singleMinPx = Number.isFinite(options.gridSingleTrackMinPx) ? options.gridSingleTrackMinPx : 320;
      if (tracks[0] < singleMinPx) return columns;
    }

    const { col: colGap } = parseGapPx(gap);
    const totalGap = Number.isFinite(colGap) ? colGap * (n - 1) : 0;
    const totalTracks = tracks.reduce((a, b) => a + b, 0) + totalGap;

    const rectW = rect && Number.isFinite(rect.width) ? Number(rect.width) : null;
    if (Number.isFinite(rectW) && rectW > 0) {
      const fillTol = Number.isFinite(options.gridColumnFillTolerance) ? options.gridColumnFillTolerance : 0.12;
      const ratio = totalTracks / rectW;
      if (ratio < 1 - fillTol || ratio > 1 + fillTol) {
        // Likely a fixed-size grid or overflow layout.
        return columns;
      }
    } else if (n === 1) {
      // Without a container width reference, don't guess a single-track normalization.
      return columns;
    }

    if (n === 1) return 'minmax(0, 1fr)';
    return `repeat(${n}, minmax(0, 1fr))`;
  }

  function rectArea(rect) {
    if (!rect) return 0;
    const w = Number(rect.width);
    const h = Number(rect.height);
    if (!Number.isFinite(w) || !Number.isFinite(h)) return 0;
    return Math.max(0, w) * Math.max(0, h);
  }

  function indexBySelector(items) {
    const map = new Map();
    const list = Array.isArray(items) ? items : [];
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      if (!item.selector) continue;
      map.set(item.selector, item);
    }
    return map;
  }

  function inferViewportMaxWidthPx(viewportName, layout, options = {}) {
    const overrides = options.responsiveMaxWidthByViewport;
    if (overrides && typeof overrides === 'object') {
      const v = overrides[viewportName];
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) return Math.round(n);
    }

    const name = String(viewportName || '').toLowerCase();
    if (name === 'mobile' || name === 'mobilelarge') return 767;
    if (name === 'tablet' || name === 'tabletlandscape') return 1023;
    if (name === 'laptop') return 1279;

    const w = layout?.viewport?.width;
    return Number.isFinite(w) && w > 0 ? Math.round(w) : null;
  }

  function toReplicaCSS(blueprint, stateCapture, options = {}) {
    if (!blueprint?.tree) return '';

    const dataAttr = options.dataAttrName || 'data-se-id';
    const selectorFor = (uid) => `[${dataAttr}="${uid}"]`;

    const rules = [];
    const baseHasMargin = new Set();
    const emittedPseudo = new Set(); // `${uid}::before` / `${uid}::after`

    const buildPseudoDeclsFromBlueprint = (pseudoData) => {
      if (!pseudoData || typeof pseudoData !== 'object') return null;
      const decls = [];

      pushDecl(decls, 'content', pseudoData.content);
      pushDecl(decls, 'display', pseudoData.display);
      pushDecl(decls, 'position', pseudoData.position);
      pushDecl(decls, 'top', pseudoData.top);
      pushDecl(decls, 'right', pseudoData.right);
      pushDecl(decls, 'bottom', pseudoData.bottom);
      pushDecl(decls, 'left', pseudoData.left);
      pushDecl(decls, 'width', pseudoData.width);
      pushDecl(decls, 'height', pseudoData.height);

      pushDecl(decls, 'color', pseudoData.color);
      pushDecl(decls, 'backgroundColor', pseudoData.backgroundColor);
      pushDecl(decls, 'backgroundImage', pseudoData.backgroundImage);
      pushDecl(decls, 'borderRadius', pseudoData.borderRadius);

      if (pseudoData.border && typeof pseudoData.border === 'object') {
        const b = pseudoData.border;
        if (b.width && b.style && b.color) {
          pushDecl(decls, 'border', `${b.width} ${b.style} ${b.color}`);
        }
      }

      pushDecl(decls, 'boxShadow', pseudoData.boxShadow);
      pushDecl(decls, 'opacity', pseudoData.opacity);
      pushDecl(decls, 'transform', pseudoData.transform);

      // Typography (counters/labels)
      pushDecl(decls, 'fontSize', pseudoData.fontSize);
      pushDecl(decls, 'fontWeight', pseudoData.fontWeight);
      pushDecl(decls, 'fontFamily', pseudoData.fontFamily);

      if (pseudoData.transition && typeof pseudoData.transition === 'object') {
        pushDecl(decls, 'transitionProperty', pseudoData.transition.property);
        pushDecl(decls, 'transitionDuration', pseudoData.transition.duration);
        pushDecl(decls, 'transitionTimingFunction', pseudoData.transition.timingFunction);
      }

      if (!decls.some((d) => String(d).startsWith('content:'))) return null;
      return decls;
    };

    // Base reset for predictable rendering.
    rules.push(`/* Generated by style-extractor replica codegen */`);
    rules.push(`* { box-sizing: border-box; }`);
    rules.push(`html, body { margin: 0; padding: 0; }`);
    rules.push(`${selectorFor(blueprint.tree.uid)} { min-height: 100vh; }`);

    walkBlueprintTree(
      blueprint.tree,
      (node) => {
        const decls = buildCssDeclsFromBlueprintNode(node, options);
        if (!decls.length) return;
        if (decls.some((d) => String(d).startsWith('margin:'))) {
          baseHasMargin.add(node.uid);
        }
        rules.push(`${selectorFor(node.uid)} {`);
        rules.push(`  ${decls.join('\n  ')}`);
        rules.push(`}`);

        // Blueprint pseudo-elements (::before/::after).
        // This is complementary to state-capture pseudo evidence, and covers more nodes than the stateLimit.
        const pseudos = node?.pseudoElements || null;
        if (pseudos && typeof pseudos === 'object') {
          const beforeDecls = buildPseudoDeclsFromBlueprint(pseudos.before);
          if (beforeDecls) {
            emittedPseudo.add(`${node.uid}::before`);
            rules.push(`${selectorFor(node.uid)}::before {`);
            rules.push(`  ${beforeDecls.join('\n  ')}`);
            rules.push(`}`);
          }
          const afterDecls = buildPseudoDeclsFromBlueprint(pseudos.after);
          if (afterDecls) {
            emittedPseudo.add(`${node.uid}::after`);
            rules.push(`${selectorFor(node.uid)}::after {`);
            rules.push(`  ${afterDecls.join('\n  ')}`);
            rules.push(`}`);
          }
        }
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
        if (beforeDecls && !emittedPseudo.has(`${uid}::before`)) {
          rules.push(`${selectorFor(uid)}::before {`);
          rules.push(`  ${beforeDecls.join('\n  ')}`);
          rules.push(`}`);
        }
        const afterDecls = collectPseudoDecls(base, '::after');
        if (afterDecls && !emittedPseudo.has(`${uid}::after`)) {
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

    // Responsive overrides (best-effort): generate @media blocks from stored viewport layouts.
    // This requires that the viewport workflow has been executed so __seResponsive has stored layouts.
    const includeResponsive = options.includeResponsive !== false;
    if (includeResponsive && window.__seResponsive?.getAllStoredLayouts) {
      try {
        const stored = window.__seResponsive.getAllStoredLayouts();
        const entries = stored && typeof stored === 'object' ? Object.entries(stored) : [];
        const valid = entries
          .filter(([, v]) => v && typeof v === 'object' && v.viewport && Number.isFinite(v.viewport.width))
          .map(([k, v]) => [k, v]);

        if (valid.length >= 2) {
          // Prefer desktop as base if present; otherwise pick the widest stored viewport.
          let baseName = valid.some(([k]) => k === 'desktop') ? 'desktop' : null;
          if (!baseName) {
            valid.sort((a, b) => (Number(a[1]?.viewport?.width) || 0) - (Number(b[1]?.viewport?.width) || 0));
            baseName = valid[valid.length - 1][0];
          }
          const baseLayout = stored[baseName];
          if (baseLayout) {
            const baseGrid = indexBySelector(baseLayout.gridLayouts);
            const baseFlex = indexBySelector(baseLayout.flexLayouts);
            const baseVis = indexBySelector(baseLayout.visibilityStates);
            const baseContainers = indexBySelector(baseLayout.layoutContainers);

            // Best-effort: infer centered containers (Tailwind max-w-* + mx-auto) and emit margin:auto.
            // This fixes cases where computed auto margins are resolved into symmetric px or dropped in the blueprint.
            try {
              const containers = Array.isArray(baseLayout.layoutContainers) ? baseLayout.layoutContainers : [];
              const centered = [];

              for (const c of containers) {
                if (!c?.selector) continue;
                const uid = selectorToUid.get(c.selector);
                if (!uid) continue;
                if (baseHasMargin.has(uid)) continue;

                const maxW = normalizeCssValue(c?.sizing?.maxWidth);
                if (!maxW || maxW === 'none' || maxW === 'auto') continue;

                const mar = normalizeBoxShorthand(c?.sizing?.margin);
                if (!mar) continue;
                const parts = mar.split(' ').filter(Boolean);
                if (parts.length !== 4) continue;
                const right = parts[1];
                const left = parts[3];
                const rpx = parsePx(right);
                const lpx = parsePx(left);
                if (rpx === null || lpx === null) continue;
                if (Math.abs(rpx - lpx) > 2) continue;
                if (Math.max(rpx, lpx) < 16) continue;

                centered.push({ uid, margin: `${parts[0]} auto ${parts[2]} auto` });
              }

              if (centered.length > 0) {
                rules.push(``);
                rules.push(`/* Inferred centered containers (max-width + symmetric margins) */`);
                for (const entry of centered) {
                  rules.push(`${selectorFor(entry.uid)} {`);
                  rules.push(`  margin: ${entry.margin};`);
                  rules.push(`}`);
                }
              }
            } catch {
              // ignore
            }

            // Generate from larger max-width to smaller so smaller viewports can override later.
            const targets = valid
              .filter(([k]) => k !== baseName)
              .map(([k, v]) => ({ name: k, layout: v, maxWidth: inferViewportMaxWidthPx(k, v, options) }))
              .filter((t) => Number.isFinite(t.maxWidth) && t.maxWidth > 0)
              .sort((a, b) => b.maxWidth - a.maxWidth);

            const maxRulesPerViewport = Number.isFinite(options.responsiveMaxRulesPerViewport)
              ? options.responsiveMaxRulesPerViewport
              : 90;

            for (const target of targets) {
              const layout = target.layout;
              const maxWidth = target.maxWidth;
              const viewportName = target.name;

              const overridesByUid = new Map(); // uid -> Map(prop -> value)

              const setOverride = (uid, prop, value) => {
                if (!uid || !prop) return;
                if (value === null || value === undefined) return;
                const v = String(value).trim();
                if (!v) return;

                let m = overridesByUid.get(uid);
                if (!m) {
                  m = new Map();
                  overridesByUid.set(uid, m);
                }

                if (prop === 'display') {
                  const existing = m.get(prop);
                  // Don't overwrite display:none with display:flex/block inside the same media query.
                  if (String(existing || '').trim() === 'none' && v !== 'none') return;
                }

                m.set(prop, v);
              };

              const grid = Array.isArray(layout.gridLayouts) ? layout.gridLayouts.slice() : [];
              grid.sort((a, b) => rectArea(b.rect) - rectArea(a.rect));
              for (const item of grid.slice(0, 60)) {
                if (!item?.selector) continue;
                const uid = selectorToUid.get(item.selector);
                if (!uid) continue;

              const baseItem = baseGrid.get(item.selector);
              const colsOut = normalizeGridTemplateColumns(
                  item.gridTemplateColumns,
                  item.rect,
                  item.columnGap || item.gap,
                  options
                );
              const baseColsOut = baseItem
                ? normalizeGridTemplateColumns(
                    baseItem.gridTemplateColumns,
                    baseItem.rect,
                    baseItem.columnGap || baseItem.gap,
                    options
                  )
                : null;
              const cols = normalizeCssValue(colsOut);
              const rows = normalizeCssValue(item.gridTemplateRows);
              const flow = normalizeCssValue(item.gridAutoFlow);
              const gap = normalizeCssValue(item.gap);
              const colGap = normalizeCssValue(item.columnGap);
              const rowGap = normalizeCssValue(item.rowGap);

                const changed =
                  !baseItem ||
                  normalizeCssValue(baseColsOut || baseItem.gridTemplateColumns) !== cols ||
                  normalizeCssValue(baseItem.gridTemplateRows) !== rows ||
                  normalizeCssValue(baseItem.gridAutoFlow) !== flow ||
                  normalizeCssValue(baseItem.gap) !== gap ||
                  normalizeCssValue(baseItem.columnGap) !== colGap ||
                  normalizeCssValue(baseItem.rowGap) !== rowGap;

                if (!changed) continue;

                setOverride(uid, 'display', 'grid');
                if (cols) setOverride(uid, 'gridTemplateColumns', colsOut);
                if (rows && (options.omitPixelGridTemplateRows === false || !isPurePxTrackList(item.gridTemplateRows))) {
                  setOverride(uid, 'gridTemplateRows', item.gridTemplateRows);
                }
                if (flow) setOverride(uid, 'gridAutoFlow', item.gridAutoFlow);
                if (gap && gap !== 'normal') setOverride(uid, 'gap', item.gap);
                if (colGap && colGap !== 'normal') setOverride(uid, 'columnGap', item.columnGap);
                if (rowGap && rowGap !== 'normal') setOverride(uid, 'rowGap', item.rowGap);

                if (overridesByUid.size >= maxRulesPerViewport) break;
              }

              const flex = Array.isArray(layout.flexLayouts) ? layout.flexLayouts.slice() : [];
              flex.sort((a, b) => rectArea(b.rect) - rectArea(a.rect));
              for (const item of flex.slice(0, 120)) {
                if (overridesByUid.size >= maxRulesPerViewport) break;
                if (!item?.selector) continue;
                const uid = selectorToUid.get(item.selector);
                if (!uid) continue;

                const baseItem = baseFlex.get(item.selector);
                const dir = normalizeCssValue(item.flexDirection);
                const wrap = normalizeCssValue(item.flexWrap);
                const justify = normalizeCssValue(item.justifyContent);
                const align = normalizeCssValue(item.alignItems);
                const gap = normalizeCssValue(item.gap);

                const changed =
                  !baseItem ||
                  normalizeCssValue(baseItem.flexDirection) !== dir ||
                  normalizeCssValue(baseItem.flexWrap) !== wrap ||
                  normalizeCssValue(baseItem.justifyContent) !== justify ||
                  normalizeCssValue(baseItem.alignItems) !== align ||
                  normalizeCssValue(baseItem.gap) !== gap;

                if (!changed) continue;

                setOverride(uid, 'display', 'flex');
                if (dir) setOverride(uid, 'flexDirection', item.flexDirection);
                if (wrap) setOverride(uid, 'flexWrap', item.flexWrap);
                if (justify) setOverride(uid, 'justifyContent', item.justifyContent);
                if (align) setOverride(uid, 'alignItems', item.alignItems);
                if (gap && gap !== 'normal') setOverride(uid, 'gap', item.gap);
              }

              // Container spacing overrides (padding/margin/maxWidth): only when we can compare to base.
              const maxContainerUids = Number.isFinite(options.responsiveMaxContainerUids)
                ? options.responsiveMaxContainerUids
                : 24;
              let containerSeen = 0;

              const containers = Array.isArray(layout.layoutContainers) ? layout.layoutContainers.slice() : [];
              containers.sort((a, b) => rectArea(b.rect) - rectArea(a.rect));
              for (const item of containers.slice(0, 80)) {
                if (overridesByUid.size >= maxRulesPerViewport) break;
                if (containerSeen >= maxContainerUids) break;
                if (!item?.selector) continue;
                const uid = selectorToUid.get(item.selector);
                if (!uid) continue;

                const baseItem = baseContainers.get(item.selector);
                if (!baseItem) continue; // conservative: avoid guessing without a baseline

                const had = overridesByUid.has(uid);

                const pad = normalizeBoxShorthand(item?.sizing?.padding);
                const basePad = normalizeBoxShorthand(baseItem?.sizing?.padding);
                if (pad && pad !== basePad && pad !== '0px 0px 0px 0px') {
                  setOverride(uid, 'padding', pad);
                }

                const mar = normalizeBoxShorthand(item?.sizing?.margin);
                const baseMar = normalizeBoxShorthand(baseItem?.sizing?.margin);
                // Margin changes are often fragile; keep this conservative.
                if (mar && baseMar && mar !== baseMar && mar !== '0px 0px 0px 0px') {
                  setOverride(uid, 'margin', mar);
                }

                const maxW = normalizeCssValue(item?.sizing?.maxWidth);
                const baseMaxW = normalizeCssValue(baseItem?.sizing?.maxWidth);
                if (maxW && maxW !== baseMaxW && maxW !== 'auto') {
                  setOverride(uid, 'maxWidth', maxW);
                } else if (baseMaxW && baseMaxW !== 'none' && maxW === 'none') {
                  setOverride(uid, 'maxWidth', 'none');
                }

                if (!had && overridesByUid.has(uid)) containerSeen += 1;
              }

              const vis = Array.isArray(layout.visibilityStates) ? layout.visibilityStates : [];
              for (const item of vis) {
                if (overridesByUid.size >= maxRulesPerViewport) break;
                if (!item?.selector) continue;
                const uid = selectorToUid.get(item.selector);
                if (!uid) continue;

                // High-signal: show/hide changes (tailwind hidden/md:flex patterns).
                const baseItem = baseVis.get(item.selector);
                const display = normalizeCssValue(item.display);
                const baseDisplay = baseItem ? normalizeCssValue(baseItem.display) : '';

                if (display === 'none') {
                  setOverride(uid, 'display', 'none');
                } else if (baseItem && baseDisplay !== display) {
                  setOverride(uid, 'display', item.display);
                }

                // Keep these conservative: only change when we have a base reference.
                if (baseItem) {
                  const visibility = normalizeCssValue(item.visibility);
                  const baseVisibility = normalizeCssValue(baseItem.visibility);
                  if (visibility && baseVisibility && visibility !== baseVisibility) {
                    setOverride(uid, 'visibility', item.visibility);
                  }

                  const opacity = normalizeCssValue(item.opacity);
                  const baseOpacity = normalizeCssValue(baseItem.opacity);
                  if (opacity && baseOpacity && opacity !== baseOpacity) {
                    setOverride(uid, 'opacity', item.opacity);
                  }
                }
              }

              if (overridesByUid.size === 0) continue;

              // Emit @media block.
              rules.push(``);
              rules.push(`/* Responsive overrides: ${viewportName} */`);
              rules.push(`@media (max-width: ${maxWidth}px) {`);

              const uidEntries = Array.from(overridesByUid.entries()).sort((a, b) => {
                const an = parseInt(String(a[0]).replace(/^\D+/, ''), 10);
                const bn = parseInt(String(b[0]).replace(/^\D+/, ''), 10);
                if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
                return String(a[0]).localeCompare(String(b[0]));
              });

              const propPriority = [
                'display',
                'flexDirection',
                'flexWrap',
                'justifyContent',
                'alignItems',
                'gridTemplateColumns',
                'gridTemplateRows',
                'gridAutoFlow',
                'columnGap',
                'rowGap',
                'gap',
                'visibility',
                'opacity'
              ];
              const propOrder = (prop) => {
                const idx = propPriority.indexOf(prop);
                return idx === -1 ? 999 : idx;
              };

              for (const [uid, propMap] of uidEntries) {
                const decls = [];
                const props = Array.from(propMap.entries())
                  .sort((a, b) => propOrder(a[0]) - propOrder(b[0]) || String(a[0]).localeCompare(String(b[0])));

                for (const [prop, value] of props) {
                  pushDecl(decls, prop, value);
                }

                if (!decls.length) continue;
                rules.push(`  ${selectorFor(uid)} {`);
                rules.push(`    ${decls.join('\n    ')}`);
                rules.push(`  }`);
              }

              rules.push(`}`);
            }
          }
        }
      } catch (e) {
        // Ignore: responsive evidence is optional.
        debug('Responsive CSS generation failed:', e?.message || String(e));
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
