// Style Extractor: Enhanced Motion Module
// Complete animation capture with keyframes, triggers, and chains
//
// This module provides:
// 1. Full keyframe extraction with all properties
// 2. Animation trigger detection (load, hover, click, scroll, intersection)
// 3. Animation chain/sequence detection
// 4. CSS transition extraction
// 5. Animation timeline visualization
//
// Usage:
//   window.__seMotionEnhanced.captureAll()
//   window.__seMotionEnhanced.extractFullKeyframes(animation)
//   window.__seMotionEnhanced.detectTriggers(element)
//   window.__seMotionEnhanced.detectAnimationChains()
//   window.__seMotionEnhanced.extractTransitions(element)

(() => {
  if (window.__seMotionEnhanced?.installed) return;

  const debug = (...args) => {
    if (window.__seDebug) console.log('[style-extractor:motion-enhanced]', ...args);
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

  // ============================================
  // Full Keyframe Extraction
  // ============================================

  /**
   * Extract complete keyframes from an animation
   */
  function extractFullKeyframes(animation) {
    const effect = animation.effect;
    if (!effect || !effect.getKeyframes) {
      return null;
    }

    try {
      const keyframes = effect.getKeyframes();
      return keyframes.map(kf => {
        const frame = {
          offset: kf.offset,
          easing: kf.easing || 'linear',
          composite: kf.composite || 'replace'
        };

        // Extract all animated properties
        const skipProps = ['offset', 'easing', 'composite', 'computedOffset'];
        for (const [key, value] of Object.entries(kf)) {
          if (!skipProps.includes(key) && value !== undefined) {
            frame[key] = value;
          }
        }

        return frame;
      });
    } catch (e) {
      debug('Error extracting keyframes:', e.message);
      return null;
    }
  }

  /**
   * Extract animation timing details
   */
  function extractTiming(animation) {
    const effect = animation.effect;
    if (!effect || !effect.getTiming) {
      return null;
    }

    try {
      const timing = effect.getTiming();
      return {
        duration: timing.duration,
        delay: timing.delay,
        endDelay: timing.endDelay,
        iterations: timing.iterations,
        iterationStart: timing.iterationStart,
        direction: timing.direction,
        fill: timing.fill,
        easing: timing.easing
      };
    } catch (e) {
      debug('Error extracting timing:', e.message);
      return null;
    }
  }

  /**
   * Get computed timing (current progress)
   */
  function getComputedTiming(animation) {
    const effect = animation.effect;
    if (!effect || !effect.getComputedTiming) {
      return null;
    }

    try {
      const computed = effect.getComputedTiming();
      return {
        progress: computed.progress,
        currentIteration: computed.currentIteration,
        activeDuration: computed.activeDuration,
        endTime: computed.endTime,
        localTime: computed.localTime
      };
    } catch (e) {
      return null;
    }
  }

  // ============================================
  // Animation Trigger Detection
  // ============================================

  /**
   * Detect what triggers an element's animations
   */
  function detectTriggers(el) {
    if (!el || el.nodeType !== 1) return null;

    const triggers = {
      onLoad: false,
      onHover: false,
      onClick: false,
      onFocus: false,
      onScroll: false,
      onIntersection: false,
      onClass: false,
      details: []
    };

    const selector = cssPath(el);

    // Check CSS for hover/focus animations
    for (const sheet of document.styleSheets) {
      try {
        const rules = sheet.cssRules || sheet.rules;
        for (const rule of rules) {
          if (rule.type !== 1) continue;
          const selectorText = rule.selectorText || '';

          // Check if rule applies to this element
          const baseSelector = selectorText
            .replace(/:hover/g, '')
            .replace(/:focus/g, '')
            .replace(/:active/g, '')
            .replace(/:focus-visible/g, '');

          try {
            if (!el.matches(baseSelector)) continue;
          } catch {
            continue;
          }

          // Check for animation/transition in hover state
          if (selectorText.includes(':hover')) {
            const hasAnimation = rule.style.animation ||
                                 rule.style.animationName ||
                                 rule.style.transition;
            if (hasAnimation) {
              triggers.onHover = true;
              triggers.details.push({
                trigger: 'hover',
                selector: selectorText,
                animation: rule.style.animation || rule.style.animationName,
                transition: rule.style.transition
              });
            }
          }

          // Check for focus animations
          if (selectorText.includes(':focus')) {
            const hasAnimation = rule.style.animation ||
                                 rule.style.animationName ||
                                 rule.style.transition;
            if (hasAnimation) {
              triggers.onFocus = true;
              triggers.details.push({
                trigger: 'focus',
                selector: selectorText,
                animation: rule.style.animation || rule.style.animationName,
                transition: rule.style.transition
              });
            }
          }

          // Check for active animations
          if (selectorText.includes(':active')) {
            const hasAnimation = rule.style.animation ||
                                 rule.style.animationName ||
                                 rule.style.transition;
            if (hasAnimation) {
              triggers.onClick = true;
              triggers.details.push({
                trigger: 'active',
                selector: selectorText,
                animation: rule.style.animation || rule.style.animationName,
                transition: rule.style.transition
              });
            }
          }
        }
      } catch (e) {
        // Cross-origin stylesheet
      }
    }

    // Check for load animations (animation on base element)
    const styles = getComputedStyle(el);
    if (styles.animationName && styles.animationName !== 'none') {
      triggers.onLoad = true;
      triggers.details.push({
        trigger: 'load',
        animationName: styles.animationName,
        animationDuration: styles.animationDuration,
        animationDelay: styles.animationDelay
      });
    }

    // Check for scroll-based animations
    if (styles.animationTimeline && styles.animationTimeline !== 'auto') {
      triggers.onScroll = true;
      triggers.details.push({
        trigger: 'scroll',
        animationTimeline: styles.animationTimeline
      });
    }

    // Check for intersection observer patterns (class-based)
    const classList = Array.from(el.classList || []);
    const intersectionPatterns = ['animate', 'fade-in', 'slide-in', 'reveal', 'aos', 'wow'];
    for (const cls of classList) {
      const clsLower = cls.toLowerCase();
      for (const pattern of intersectionPatterns) {
        if (clsLower.includes(pattern)) {
          triggers.onIntersection = true;
          triggers.onClass = true;
          triggers.details.push({
            trigger: 'intersection',
            className: cls,
            pattern
          });
          break;
        }
      }
    }

    // Check data attributes for animation libraries
    const dataAttrs = ['data-aos', 'data-animate', 'data-scroll', 'data-sal'];
    for (const attr of dataAttrs) {
      if (el.hasAttribute(attr)) {
        triggers.onIntersection = true;
        triggers.details.push({
          trigger: 'intersection',
          attribute: attr,
          value: el.getAttribute(attr)
        });
      }
    }

    return triggers;
  }

  // ============================================
  // Animation Chain Detection
  // ============================================

  /**
   * Detect animation chains (sequential animations)
   */
  function detectAnimationChains() {
    const animations = document.getAnimations({ subtree: true });
    const chains = [];

    // Group animations by delay
    const byDelay = new Map();
    for (const anim of animations) {
      const timing = extractTiming(anim);
      if (!timing) continue;

      const delay = timing.delay || 0;
      if (!byDelay.has(delay)) {
        byDelay.set(delay, []);
      }
      byDelay.get(delay).push({
        animation: anim,
        timing,
        target: anim.effect?.target
      });
    }

    // Find chains (animations with sequential delays)
    const sortedDelays = Array.from(byDelay.keys()).sort((a, b) => a - b);

    if (sortedDelays.length >= 2) {
      // Check for staggered animations
      const delayDiffs = [];
      for (let i = 1; i < sortedDelays.length; i++) {
        delayDiffs.push(sortedDelays[i] - sortedDelays[i - 1]);
      }

      // If delays are consistent, it's likely a stagger
      const avgDiff = delayDiffs.reduce((a, b) => a + b, 0) / delayDiffs.length;
      const isStagger = delayDiffs.every(d => Math.abs(d - avgDiff) < 50);

      if (isStagger && sortedDelays.length >= 3) {
        chains.push({
          type: 'stagger',
          staggerDelay: avgDiff,
          count: sortedDelays.length,
          delays: sortedDelays,
          elements: sortedDelays.map(d => {
            const items = byDelay.get(d);
            return items.map(item => ({
              selector: item.target ? cssPath(item.target) : null,
              delay: d
            }));
          }).flat()
        });
      }
    }

    // Find parent-child animation chains
    for (const anim of animations) {
      const target = anim.effect?.target;
      if (!target) continue;

      const timing = extractTiming(anim);
      if (!timing) continue;

      // Check if parent has animation that ends when this starts
      let parent = target.parentElement;
      while (parent) {
        const parentAnims = parent.getAnimations?.() || [];
        for (const parentAnim of parentAnims) {
          const parentTiming = extractTiming(parentAnim);
          if (!parentTiming) continue;

          const parentEnd = (parentTiming.delay || 0) + (parentTiming.duration || 0);
          const childStart = timing.delay || 0;

          // If child starts when parent ends (within 100ms tolerance)
          if (Math.abs(parentEnd - childStart) < 100) {
            chains.push({
              type: 'sequence',
              parent: {
                selector: cssPath(parent),
                animationName: parentAnim.animationName,
                endTime: parentEnd
              },
              child: {
                selector: cssPath(target),
                animationName: anim.animationName,
                startTime: childStart
              }
            });
          }
        }
        parent = parent.parentElement;
      }
    }

    return {
      chains,
      hasStagger: chains.some(c => c.type === 'stagger'),
      hasSequence: chains.some(c => c.type === 'sequence'),
      totalChains: chains.length
    };
  }

  // ============================================
  // CSS Transition Extraction
  // ============================================

  /**
   * Extract CSS transitions from an element
   */
  function extractTransitions(el) {
    if (!el || el.nodeType !== 1) return null;

    const styles = getComputedStyle(el);

    const transitionProperty = styles.transitionProperty;
    const transitionDuration = styles.transitionDuration;
    const transitionTimingFunction = styles.transitionTimingFunction;
    const transitionDelay = styles.transitionDelay;

    if (!transitionProperty || transitionProperty === 'none' ||
        transitionProperty === 'all' && transitionDuration === '0s') {
      return null;
    }

    // Parse into individual transitions
    const properties = transitionProperty.split(',').map(p => p.trim());
    const durations = transitionDuration.split(',').map(d => d.trim());
    const timings = transitionTimingFunction.split(',').map(t => t.trim());
    const delays = transitionDelay.split(',').map(d => d.trim());

    const transitions = properties.map((prop, i) => ({
      property: prop,
      duration: durations[i % durations.length],
      timingFunction: timings[i % timings.length],
      delay: delays[i % delays.length]
    }));

    return {
      selector: cssPath(el),
      transitions,
      raw: {
        transitionProperty,
        transitionDuration,
        transitionTimingFunction,
        transitionDelay
      }
    };
  }

  /**
   * Find all elements with transitions
   */
  function findAllTransitions() {
    const results = [];
    const elements = document.querySelectorAll('*');

    for (const el of elements) {
      const transition = extractTransitions(el);
      if (transition) {
        results.push(transition);
      }
    }

    return {
      elements: results,
      count: results.length,
      properties: [...new Set(results.flatMap(r => r.transitions.map(t => t.property)))]
    };
  }

  // ============================================
  // CSS @keyframes Extraction
  // ============================================

  /**
   * Extract all @keyframes from stylesheets
   */
  function extractAllKeyframesRules() {
    const keyframesMap = new Map();

    for (const sheet of document.styleSheets) {
      try {
        const rules = sheet.cssRules || sheet.rules;
        for (const rule of rules) {
          if (rule.type === CSSRule.KEYFRAMES_RULE) {
            const name = rule.name;
            const frames = [];

            for (const keyframe of rule.cssRules) {
              const frame = {
                keyText: keyframe.keyText, // e.g., "0%", "50%", "100%"
                styles: {}
              };

              // Extract all styles from this keyframe
              for (let i = 0; i < keyframe.style.length; i++) {
                const prop = keyframe.style[i];
                frame.styles[prop] = keyframe.style.getPropertyValue(prop);
              }

              frames.push(frame);
            }

            keyframesMap.set(name, {
              name,
              frames,
              cssText: rule.cssText
            });
          }
        }
      } catch (e) {
        // Cross-origin stylesheet
        debug('Cannot access stylesheet for keyframes:', sheet.href);
      }
    }

    return {
      keyframes: Array.from(keyframesMap.values()),
      names: Array.from(keyframesMap.keys()),
      count: keyframesMap.size
    };
  }

  // ============================================
  // Complete Animation Capture
  // ============================================

  /**
   * Capture all animations with full details
   */
  function captureAll() {
    const animations = document.getAnimations({ subtree: true });

    const captured = animations.map(anim => {
      const target = anim.effect?.target;
      const timing = extractTiming(anim);
      const keyframes = extractFullKeyframes(anim);
      const computedTiming = getComputedTiming(anim);
      const triggers = target ? detectTriggers(target) : null;

      return {
        id: anim.id || null,
        type: anim.constructor?.name || 'Animation',
        animationName: anim.animationName || null,
        playState: anim.playState,
        currentTime: anim.currentTime,
        startTime: anim.startTime,

        target: target ? {
          selector: cssPath(target),
          tag: target.tagName.toLowerCase(),
          rect: getRect(target)
        } : null,

        timing,
        computedTiming,
        keyframes,
        triggers,

        // Summary
        summary: {
          duration: timing?.duration || 0,
          delay: timing?.delay || 0,
          iterations: timing?.iterations || 1,
          easing: timing?.easing || 'linear',
          animatedProperties: keyframes ?
            [...new Set(keyframes.flatMap(kf =>
              Object.keys(kf).filter(k => !['offset', 'easing', 'composite'].includes(k))
            ))] : []
        }
      };
    });

    // Get keyframes rules from CSS
    const keyframesRules = extractAllKeyframesRules();

    // Detect chains
    const chains = detectAnimationChains();

    // Get all transitions
    const transitions = findAllTransitions();

    return {
      url: location.href,
      timestamp: Date.now(),
      scrollY: Math.round(scrollY),

      animations: {
        count: captured.length,
        items: captured,
        byPlayState: {
          running: captured.filter(a => a.playState === 'running').length,
          paused: captured.filter(a => a.playState === 'paused').length,
          finished: captured.filter(a => a.playState === 'finished').length,
          idle: captured.filter(a => a.playState === 'idle').length
        }
      },

      keyframesRules,
      chains,
      transitions,

      summary: {
        totalAnimations: captured.length,
        totalKeyframes: keyframesRules.count,
        totalTransitions: transitions.count,
        hasChains: chains.totalChains > 0,
        animatedProperties: [...new Set(captured.flatMap(a => a.summary.animatedProperties))]
      }
    };
  }

  // ============================================
  // Animation Timeline
  // ============================================

  /**
   * Generate animation timeline data
   */
  function generateTimeline() {
    const animations = document.getAnimations({ subtree: true });
    const timeline = [];

    for (const anim of animations) {
      const timing = extractTiming(anim);
      if (!timing) continue;

      const target = anim.effect?.target;
      const delay = timing.delay || 0;
      const duration = timing.duration || 0;
      const iterations = timing.iterations || 1;
      const totalDuration = duration * (iterations === Infinity ? 1 : iterations);

      timeline.push({
        name: anim.animationName || anim.id || 'unnamed',
        target: target ? cssPath(target) : null,
        start: delay,
        end: delay + totalDuration,
        duration: totalDuration,
        iterations,
        easing: timing.easing
      });
    }

    // Sort by start time
    timeline.sort((a, b) => a.start - b.start);

    // Calculate total timeline duration
    const maxEnd = Math.max(...timeline.map(t => t.end), 0);

    return {
      items: timeline,
      totalDuration: maxEnd,
      count: timeline.length
    };
  }

  /**
   * Generate ASCII timeline visualization
   */
  function visualizeTimeline(width = 60) {
    const timeline = generateTimeline();
    if (timeline.count === 0) {
      return 'No animations found';
    }

    const maxDuration = timeline.totalDuration;
    const scale = width / maxDuration;

    const lines = [];
    lines.push(`Timeline (${maxDuration}ms total)`);
    lines.push('='.repeat(width + 20));

    for (const item of timeline.items) {
      const startPos = Math.round(item.start * scale);
      const endPos = Math.round(item.end * scale);
      const barLength = Math.max(1, endPos - startPos);

      const bar = ' '.repeat(startPos) + '#'.repeat(barLength);
      const name = (item.name || 'unnamed').slice(0, 15).padEnd(15);

      lines.push(`${name} |${bar}`);
    }

    lines.push('='.repeat(width + 20));
    lines.push(`0ms${' '.repeat(width - 6)}${maxDuration}ms`);

    return lines.join('\n');
  }

  // ============================================
  // Motion Documentation Generator
  // ============================================

  /**
   * Generate motion documentation for AI
   */
  function generateMotionDoc() {
    const data = captureAll();
    const timeline = generateTimeline();

    const doc = {
      overview: {
        totalAnimations: data.summary.totalAnimations,
        totalKeyframes: data.summary.totalKeyframes,
        totalTransitions: data.summary.totalTransitions,
        animatedProperties: data.summary.animatedProperties
      },

      animations: data.animations.items.map(anim => ({
        name: anim.animationName,
        target: anim.target?.selector,
        duration: `${anim.summary.duration}ms`,
        delay: `${anim.summary.delay}ms`,
        easing: anim.summary.easing,
        iterations: anim.summary.iterations,
        properties: anim.summary.animatedProperties,
        triggers: anim.triggers ? Object.entries(anim.triggers)
          .filter(([k, v]) => v === true)
          .map(([k]) => k) : []
      })),

      keyframes: data.keyframesRules.keyframes.map(kf => ({
        name: kf.name,
        steps: kf.frames.length,
        cssText: kf.cssText.slice(0, 500)
      })),

      transitions: data.transitions.elements.slice(0, 20).map(t => ({
        selector: t.selector,
        properties: t.transitions.map(tr => tr.property),
        duration: t.transitions[0]?.duration
      })),

      chains: data.chains.chains,

      timeline: {
        totalDuration: `${timeline.totalDuration}ms`,
        sequence: timeline.items.map(t => ({
          name: t.name,
          start: `${t.start}ms`,
          duration: `${t.duration}ms`
        }))
      },

      codeHints: generateMotionCodeHints(data)
    };

    return doc;
  }

  /**
   * Generate code hints for motion
   */
  function generateMotionCodeHints(data) {
    const hints = {
      css: [],
      tailwind: [],
      framerMotion: []
    };

    // Generate CSS hints
    for (const kf of data.keyframesRules.keyframes.slice(0, 5)) {
      hints.css.push(kf.cssText);
    }

    // Generate Tailwind hints
    for (const anim of data.animations.items.slice(0, 5)) {
      if (anim.summary.animatedProperties.includes('opacity')) {
        hints.tailwind.push('animate-fade-in');
      }
      if (anim.summary.animatedProperties.includes('transform')) {
        hints.tailwind.push('animate-slide-in');
      }
    }

    // Generate Framer Motion hints
    for (const anim of data.animations.items.slice(0, 3)) {
      const motion = {
        initial: {},
        animate: {},
        transition: {
          duration: (anim.summary.duration || 300) / 1000,
          delay: (anim.summary.delay || 0) / 1000,
          ease: anim.summary.easing
        }
      };

      if (anim.keyframes && anim.keyframes.length >= 2) {
        const first = anim.keyframes[0];
        const last = anim.keyframes[anim.keyframes.length - 1];

        if (first.opacity !== undefined) {
          motion.initial.opacity = parseFloat(first.opacity);
          motion.animate.opacity = parseFloat(last.opacity);
        }
        if (first.transform) {
          motion.initial.transform = first.transform;
          motion.animate.transform = last.transform;
        }
      }

      hints.framerMotion.push(motion);
    }

    return hints;
  }

  // ============================================
  // Export
  // ============================================

  window.__seMotionEnhanced = {
    installed: true,
    version: '1.0.0',

    // Full capture
    captureAll,

    // Keyframe extraction
    extractFullKeyframes,
    extractTiming,
    getComputedTiming,
    extractAllKeyframesRules,

    // Trigger detection
    detectTriggers,

    // Chain detection
    detectAnimationChains,

    // Transitions
    extractTransitions,
    findAllTransitions,

    // Timeline
    generateTimeline,
    visualizeTimeline,

    // Documentation
    generateMotionDoc,
    generateMotionCodeHints,

    // Utilities
    cssPath,
    getRect
  };
})();
