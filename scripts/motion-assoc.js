// Style Extractor: Motion Association
// Associates animations with components and generates component-level motion docs
//
// This module:
// 1. Links animations to their triggering components
// 2. Identifies animation triggers (hover, click, scroll, load)
// 3. Generates component-specific motion documentation
// 4. Creates animation timeline visualizations
//
// Usage in evaluate_script:
//   window.__seMotionAssoc.associateAnimations()
//   window.__seMotionAssoc.detectTriggers(element)
//   window.__seMotionAssoc.generateMotionDoc(component)
//   window.__seMotionAssoc.analyze()

(() => {
  if (window.__seMotionAssoc?.installed) return;

  // Debug mode
  const debug = (...args) => {
    if (window.__seDebug) console.log('[style-extractor:motion-assoc]', ...args);
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
      parts.unshift(part);
      if (cur.parentElement?.id) {
        parts.unshift(`#${CSS.escape(cur.parentElement.id)}`);
        break;
      }
      cur = cur.parentElement;
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

  // ============================================
  // Animation Discovery
  // ============================================

  /**
   * Get all active animations on the page
   */
  function getAllAnimations() {
    const animations = document.getAnimations({ subtree: true });

    return animations.map(anim => {
      const target = anim.effect?.target;
      const timing = anim.effect?.getTiming?.() || {};
      const keyframes = anim.effect?.getKeyframes?.() || [];

      return {
        id: anim.id || null,
        name: anim.animationName || timing.name || 'unnamed',
        target: target ? {
          element: target,
          selector: cssPath(target),
          tag: target.tagName?.toLowerCase(),
          rect: getRect(target)
        } : null,
        timing: {
          duration: timing.duration,
          delay: timing.delay,
          iterations: timing.iterations,
          direction: timing.direction,
          easing: timing.easing,
          fill: timing.fill
        },
        keyframes: keyframes.map(kf => ({
          offset: kf.offset,
          easing: kf.easing,
          properties: Object.keys(kf).filter(k => !['offset', 'easing', 'composite'].includes(k))
        })),
        state: anim.playState,
        currentTime: anim.currentTime
      };
    });
  }

  /**
   * Get CSS transition properties for an element
   */
  function getTransitionProperties(el) {
    const style = getComputedStyle(el);
    const properties = style.transitionProperty.split(',').map(p => p.trim());
    const durations = style.transitionDuration.split(',').map(d => d.trim());
    const delays = style.transitionDelay.split(',').map(d => d.trim());
    const easings = style.transitionTimingFunction.split(',').map(e => e.trim());

    if (properties[0] === 'none' || properties[0] === 'all' && durations[0] === '0s') {
      return null;
    }

    return properties.map((prop, i) => ({
      property: prop,
      duration: durations[i % durations.length],
      delay: delays[i % delays.length],
      easing: easings[i % easings.length]
    }));
  }

  // ============================================
  // Component Association
  // ============================================

  /**
   * Identify the component that owns an animated element
   */
  function findOwningComponent(el) {
    const componentSelectors = [
      'button', '[role="button"]',
      '.card', '[class*="card"]',
      '.modal', '[role="dialog"]',
      'nav', '[role="navigation"]',
      'header', '[role="banner"]',
      '.dropdown', '[class*="dropdown"]',
      '.accordion', '[class*="accordion"]',
      '.tab', '[role="tab"]',
      '.tooltip', '[class*="tooltip"]',
      '.menu', '[role="menu"]'
    ];

    let current = el;
    while (current && current !== document.body) {
      for (const selector of componentSelectors) {
        if (current.matches(selector)) {
          return {
            element: current,
            selector: cssPath(current),
            type: identifyComponentType(current, selector),
            rect: getRect(current)
          };
        }
      }
      current = current.parentElement;
    }

    return null;
  }

  function identifyComponentType(el, matchedSelector) {
    const tag = el.tagName.toLowerCase();
    const classes = Array.from(el.classList || []).join(' ').toLowerCase();

    if (tag === 'button' || el.getAttribute('role') === 'button') return 'button';
    if (classes.includes('card')) return 'card';
    if (classes.includes('modal') || el.getAttribute('role') === 'dialog') return 'modal';
    if (tag === 'nav' || el.getAttribute('role') === 'navigation') return 'navigation';
    if (classes.includes('dropdown')) return 'dropdown';
    if (classes.includes('accordion')) return 'accordion';
    if (classes.includes('tab') || el.getAttribute('role') === 'tab') return 'tab';
    if (classes.includes('tooltip')) return 'tooltip';
    if (classes.includes('menu') || el.getAttribute('role') === 'menu') return 'menu';

    return 'unknown';
  }

  /**
   * Associate all animations with their components
   */
  function associateAnimations() {
    const animations = getAllAnimations();
    const associations = new Map();

    for (const anim of animations) {
      if (!anim.target?.element) continue;

      const component = findOwningComponent(anim.target.element);
      const key = component?.selector || anim.target.selector;

      if (!associations.has(key)) {
        associations.set(key, {
          component: component || { selector: anim.target.selector, type: 'element' },
          animations: [],
          transitions: null
        });
      }

      associations.get(key).animations.push({
        name: anim.name,
        timing: anim.timing,
        keyframes: anim.keyframes,
        state: anim.state,
        targetSelector: anim.target.selector
      });
    }

    // Also check for transition-based animations
    const interactiveElements = document.querySelectorAll(
      'button, a, [role="button"], input, .card, [class*="card"], nav a, .nav-item'
    );

    for (const el of interactiveElements) {
      const transitions = getTransitionProperties(el);
      if (!transitions) continue;

      const component = findOwningComponent(el);
      const key = component?.selector || cssPath(el);

      if (!associations.has(key)) {
        associations.set(key, {
          component: component || { selector: cssPath(el), type: 'element' },
          animations: [],
          transitions: null
        });
      }

      associations.get(key).transitions = transitions;
    }

    return Array.from(associations.values());
  }

  // ============================================
  // Trigger Detection
  // ============================================

  const TRIGGER_TYPES = {
    HOVER: 'hover',
    FOCUS: 'focus',
    CLICK: 'click',
    SCROLL: 'scroll',
    LOAD: 'load',
    INTERSECTION: 'intersection',
    UNKNOWN: 'unknown'
  };

  /**
   * Detect animation triggers for an element
   */
  function detectTriggers(el) {
    const triggers = [];
    const style = getComputedStyle(el);

    // Check for hover trigger (transition on interactive element)
    if (el.matches('button, a, [role="button"], .card, [class*="card"]')) {
      const transitions = getTransitionProperties(el);
      if (transitions) {
        triggers.push({
          type: TRIGGER_TYPES.HOVER,
          properties: transitions.map(t => t.property),
          evidence: 'Has transition properties on interactive element'
        });
      }
    }

    // Check for focus trigger
    if (el.matches('input, textarea, select, button, a, [tabindex]')) {
      triggers.push({
        type: TRIGGER_TYPES.FOCUS,
        evidence: 'Focusable element'
      });
    }

    // Check for scroll-based animations (intersection observer patterns)
    const classes = Array.from(el.classList || []).join(' ').toLowerCase();
    if (classes.includes('animate-on-scroll') ||
        classes.includes('aos') ||
        classes.includes('scroll-animate') ||
        classes.includes('reveal')) {
      triggers.push({
        type: TRIGGER_TYPES.SCROLL,
        evidence: 'Has scroll animation class'
      });
    }

    // Check for load animations
    if (classes.includes('animate-in') ||
        classes.includes('fade-in') ||
        classes.includes('slide-in') ||
        style.animationPlayState === 'running') {
      triggers.push({
        type: TRIGGER_TYPES.LOAD,
        evidence: 'Has entrance animation'
      });
    }

    // Check for click triggers (modals, dropdowns, accordions)
    if (el.matches('[data-toggle], [data-bs-toggle], .accordion-button, .dropdown-toggle')) {
      triggers.push({
        type: TRIGGER_TYPES.CLICK,
        evidence: 'Has toggle attribute'
      });
    }

    if (triggers.length === 0) {
      triggers.push({
        type: TRIGGER_TYPES.UNKNOWN,
        evidence: 'Could not determine trigger'
      });
    }

    return triggers;
  }

  // ============================================
  // Motion Documentation Generation
  // ============================================

  /**
   * Generate motion documentation for a component
   */
  function generateMotionDoc(association) {
    const doc = {
      component: association.component,
      motionProfile: {
        hasAnimations: association.animations.length > 0,
        hasTransitions: !!association.transitions,
        totalEffects: association.animations.length + (association.transitions ? 1 : 0)
      },
      animations: [],
      transitions: null,
      triggers: [],
      cssCode: []
    };

    // Document animations
    for (const anim of association.animations) {
      doc.animations.push({
        name: anim.name,
        duration: anim.timing.duration,
        delay: anim.timing.delay,
        easing: anim.timing.easing,
        iterations: anim.timing.iterations,
        properties: anim.keyframes.flatMap(kf => kf.properties).filter((v, i, a) => a.indexOf(v) === i)
      });

      // Generate CSS
      if (anim.keyframes.length > 0) {
        doc.cssCode.push(generateKeyframeCSS(anim));
      }
    }

    // Document transitions
    if (association.transitions) {
      doc.transitions = association.transitions;
      doc.cssCode.push(generateTransitionCSS(association.transitions));
    }

    // Detect triggers
    if (association.component.element) {
      doc.triggers = detectTriggers(association.component.element);
    }

    return doc;
  }

  function generateKeyframeCSS(anim) {
    const lines = [`/* Animation: ${anim.name} */`];
    lines.push(`@keyframes ${anim.name} {`);

    for (const kf of anim.keyframes) {
      const offset = kf.offset !== undefined ? `${kf.offset * 100}%` : 'from';
      lines.push(`  ${offset} {`);
      lines.push(`    /* Properties: ${kf.properties.join(', ')} */`);
      lines.push(`  }`);
    }

    lines.push('}');
    lines.push('');
    lines.push(`.animated-element {`);
    lines.push(`  animation: ${anim.name} ${anim.timing.duration}ms ${anim.timing.easing || 'ease'};`);
    if (anim.timing.delay) lines.push(`  animation-delay: ${anim.timing.delay}ms;`);
    if (anim.timing.iterations !== 1) lines.push(`  animation-iteration-count: ${anim.timing.iterations};`);
    lines.push('}');

    return lines.join('\n');
  }

  function generateTransitionCSS(transitions) {
    const lines = ['/* Transitions */'];
    lines.push('.element {');

    const transitionParts = transitions.map(t =>
      `${t.property} ${t.duration} ${t.easing}${t.delay !== '0s' ? ' ' + t.delay : ''}`
    );

    lines.push(`  transition: ${transitionParts.join(',\n             ')};`);
    lines.push('}');

    return lines.join('\n');
  }

  // ============================================
  // Timeline Visualization
  // ============================================

  /**
   * Generate animation timeline data
   */
  function generateTimeline(associations) {
    const timeline = {
      totalDuration: 0,
      tracks: []
    };

    for (const assoc of associations) {
      const track = {
        component: assoc.component.selector,
        type: assoc.component.type,
        events: []
      };

      // Add animations to timeline
      for (const anim of assoc.animations) {
        const start = anim.timing.delay || 0;
        const duration = anim.timing.duration || 0;
        const end = start + duration;

        track.events.push({
          type: 'animation',
          name: anim.name,
          start,
          duration,
          end,
          easing: anim.timing.easing
        });

        if (end > timeline.totalDuration) {
          timeline.totalDuration = end;
        }
      }

      // Add transitions to timeline
      if (assoc.transitions) {
        for (const trans of assoc.transitions) {
          const duration = parseFloat(trans.duration) * 1000;
          const delay = parseFloat(trans.delay) * 1000;

          track.events.push({
            type: 'transition',
            property: trans.property,
            start: delay,
            duration,
            end: delay + duration,
            easing: trans.easing
          });

          if (delay + duration > timeline.totalDuration) {
            timeline.totalDuration = delay + duration;
          }
        }
      }

      if (track.events.length > 0) {
        timeline.tracks.push(track);
      }
    }

    return timeline;
  }

  /**
   * Generate ASCII timeline visualization
   */
  function visualizeTimeline(timeline, width = 60) {
    const lines = [];
    const scale = width / Math.max(timeline.totalDuration, 1);

    lines.push(`Timeline (${timeline.totalDuration}ms total)`);
    lines.push('=' .repeat(width + 20));

    for (const track of timeline.tracks) {
      lines.push(`\n${track.type}: ${track.component}`);
      lines.push('-'.repeat(width + 20));

      for (const event of track.events) {
        const startPos = Math.round(event.start * scale);
        const endPos = Math.round(event.end * scale);
        const barLength = Math.max(1, endPos - startPos);

        const bar = ' '.repeat(startPos) + '#'.repeat(barLength);
        const label = event.name || event.property;

        lines.push(`${bar.padEnd(width)} | ${label} (${event.duration}ms)`);
      }
    }

    return lines.join('\n');
  }

  // ============================================
  // Full Analysis
  // ============================================

  /**
   * Run complete motion association analysis
   */
  function analyze() {
    debug('Starting motion association analysis');

    const associations = associateAnimations();
    const docs = associations.map(generateMotionDoc);
    const timeline = generateTimeline(associations);

    // Group by component type
    const byType = {};
    for (const doc of docs) {
      const type = doc.component.type || 'unknown';
      if (!byType[type]) byType[type] = [];
      byType[type].push(doc);
    }

    return {
      meta: {
        url: location.href,
        analyzedAt: new Date().toISOString()
      },
      associations,
      documentation: docs,
      byComponentType: byType,
      timeline,
      visualization: visualizeTimeline(timeline),
      summary: {
        totalComponents: associations.length,
        withAnimations: associations.filter(a => a.animations.length > 0).length,
        withTransitions: associations.filter(a => a.transitions).length,
        totalAnimations: associations.reduce((sum, a) => sum + a.animations.length, 0),
        totalDuration: timeline.totalDuration
      }
    };
  }

  // ============================================
  // Export
  // ============================================

  window.__seMotionAssoc = {
    installed: true,

    // Core
    analyze,
    associateAnimations,

    // Discovery
    getAllAnimations,
    getTransitionProperties,

    // Association
    findOwningComponent,
    detectTriggers,

    // Documentation
    generateMotionDoc,
    generateKeyframeCSS: generateKeyframeCSS,
    generateTransitionCSS: generateTransitionCSS,

    // Timeline
    generateTimeline,
    visualizeTimeline,

    // Constants
    TRIGGER_TYPES
  };
})();
