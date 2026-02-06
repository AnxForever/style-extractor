// Style Extractor: Multi-Page Extraction
// Coordinates extraction across multiple pages of a website
//
// This module:
// 1. Discovers pages via sitemap, navigation links, or manual list
// 2. Tracks extraction state across pages
// 3. Merges and deduplicates tokens from multiple pages
// 4. Generates site-wide style report
//
// Usage in evaluate_script:
//   window.__seMultiPage.discoverPages()
//   window.__seMultiPage.getExtractionState()
//   window.__seMultiPage.mergeResults(results)
//   window.__seMultiPage.generateSiteReport(results)

(() => {
  if (window.__seMultiPage?.installed) return;

  // Debug mode
  const debug = (...args) => {
    if (window.__seDebug) console.log('[style-extractor:multipage]', ...args);
  };

  // ============================================
  // Page Discovery
  // ============================================

  /**
   * Discover pages from navigation links
   */
  function discoverFromNavigation() {
    const pages = new Map();
    const baseUrl = new URL(location.href);
    const baseDomain = baseUrl.hostname;

    // Find navigation links
    const navSelectors = [
      'nav a[href]',
      '[role="navigation"] a[href]',
      'header a[href]',
      '.nav a[href]',
      '.menu a[href]',
      'footer a[href]'
    ];

    for (const selector of navSelectors) {
      try {
        const links = document.querySelectorAll(selector);
        for (const link of links) {
          const href = link.getAttribute('href');
          if (!href) continue;

          try {
            const url = new URL(href, location.href);

            // Only same-domain links
            if (url.hostname !== baseDomain) continue;

            // Skip anchors, javascript, mailto, etc.
            if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;
            if (url.pathname === location.pathname && url.hash) continue;

            // Normalize URL (remove hash, trailing slash)
            url.hash = '';
            let normalizedPath = url.pathname.replace(/\/$/, '') || '/';
            const normalizedUrl = `${url.origin}${normalizedPath}${url.search}`;

            if (!pages.has(normalizedUrl)) {
              pages.set(normalizedUrl, {
                url: normalizedUrl,
                path: normalizedPath,
                text: (link.innerText || link.textContent || '').trim().slice(0, 50),
                source: 'navigation',
                selector: selector
              });
            }
          } catch (e) {
            // Invalid URL, skip
          }
        }
      } catch (e) {
        debug('Error discovering from selector:', selector, e.message);
      }
    }

    return Array.from(pages.values());
  }

  /**
   * Discover pages from sitemap.xml
   */
  async function discoverFromSitemap(sitemapUrl) {
    const pages = [];
    const url = sitemapUrl || `${location.origin}/sitemap.xml`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}`, pages: [] };
      }

      const text = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'text/xml');

      // Handle sitemap index
      const sitemapLocs = doc.querySelectorAll('sitemap > loc');
      if (sitemapLocs.length > 0) {
        return {
          success: true,
          type: 'sitemapindex',
          sitemaps: Array.from(sitemapLocs).map(loc => loc.textContent),
          pages: []
        };
      }

      // Handle regular sitemap
      const urlLocs = doc.querySelectorAll('url > loc');
      for (const loc of urlLocs) {
        const pageUrl = loc.textContent;
        const lastmod = loc.parentElement.querySelector('lastmod')?.textContent;
        const priority = loc.parentElement.querySelector('priority')?.textContent;

        pages.push({
          url: pageUrl,
          path: new URL(pageUrl).pathname,
          source: 'sitemap',
          lastmod,
          priority: priority ? parseFloat(priority) : null
        });
      }

      return { success: true, type: 'sitemap', pages };
    } catch (e) {
      return { success: false, error: e.message, pages: [] };
    }
  }

  /**
   * Discover all pages using multiple methods
   */
  async function discoverPages(options = {}) {
    const allPages = new Map();
    const results = {
      navigation: [],
      sitemap: null,
      manual: options.urls || []
    };

    // 1. From navigation
    const navPages = discoverFromNavigation();
    results.navigation = navPages;
    for (const page of navPages) {
      allPages.set(page.url, page);
    }

    // 2. From sitemap (if enabled)
    if (options.includeSitemap !== false) {
      results.sitemap = await discoverFromSitemap(options.sitemapUrl);
      if (results.sitemap.success) {
        for (const page of results.sitemap.pages) {
          if (!allPages.has(page.url)) {
            allPages.set(page.url, page);
          }
        }
      }
    }

    // 3. Manual URLs
    for (const url of (options.urls || [])) {
      if (!allPages.has(url)) {
        allPages.set(url, {
          url,
          path: new URL(url).pathname,
          source: 'manual'
        });
      }
    }

    // Sort by path
    const pages = Array.from(allPages.values())
      .sort((a, b) => a.path.localeCompare(b.path));

    return {
      pages,
      count: pages.length,
      sources: results,
      currentPage: location.href,
      timestamp: Date.now()
    };
  }

  // ============================================
  // Extraction State Management
  // ============================================

  // Store extraction state in sessionStorage for persistence across pages
  const STATE_KEY = '__seMultiPageState';

  function getExtractionState() {
    try {
      const stored = sessionStorage.getItem(STATE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      debug('Error reading state:', e.message);
    }

    return {
      startedAt: null,
      pages: {},
      currentIndex: 0,
      totalPages: 0,
      status: 'idle'
    };
  }

  function saveExtractionState(state) {
    try {
      sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
    } catch (e) {
      debug('Error saving state:', e.message);
    }
  }

  function initExtraction(pages) {
    const state = {
      startedAt: Date.now(),
      pages: {},
      pageList: pages.map(p => p.url),
      currentIndex: 0,
      totalPages: pages.length,
      status: 'running'
    };

    for (const page of pages) {
      state.pages[page.url] = {
        url: page.url,
        path: page.path,
        status: 'pending',
        result: null,
        error: null
      };
    }

    saveExtractionState(state);
    return state;
  }

  function markPageComplete(url, result) {
    const state = getExtractionState();
    if (state.pages[url]) {
      state.pages[url].status = 'complete';
      state.pages[url].result = result;
      state.pages[url].completedAt = Date.now();
      state.currentIndex++;

      if (state.currentIndex >= state.totalPages) {
        state.status = 'complete';
        state.completedAt = Date.now();
      }

      saveExtractionState(state);
    }
    return state;
  }

  function markPageError(url, error) {
    const state = getExtractionState();
    if (state.pages[url]) {
      state.pages[url].status = 'error';
      state.pages[url].error = error;
      state.currentIndex++;
      saveExtractionState(state);
    }
    return state;
  }

  function clearExtractionState() {
    sessionStorage.removeItem(STATE_KEY);
    return { cleared: true };
  }

  // ============================================
  // Result Merging
  // ============================================

  /**
   * Merge extraction results from multiple pages
   */
  function mergeResults(results) {
    const merged = {
      meta: {
        pageCount: results.length,
        mergedAt: new Date().toISOString()
      },
      colors: new Map(),
      typography: {
        families: new Set(),
        sizes: new Map()
      },
      spacing: new Map(),
      components: {},
      breakpoints: new Map(),
      variables: new Map()
    };

    for (const result of results) {
      if (!result || result.error) continue;

      // Merge colors
      if (result.stylekit?.normalized?.tokens?.colors) {
        for (const [name, value] of Object.entries(result.stylekit.normalized.tokens.colors)) {
          if (!merged.colors.has(value)) {
            merged.colors.set(value, { value, names: [name], pages: [result.url] });
          } else {
            const existing = merged.colors.get(value);
            if (!existing.names.includes(name)) existing.names.push(name);
            if (!existing.pages.includes(result.url)) existing.pages.push(result.url);
          }
        }
      }

      // Merge typography
      if (result.stylekit?.normalized?.tokens?.typography) {
        const typo = result.stylekit.normalized.tokens.typography;
        if (typo.fontFamily) {
          for (const family of Object.values(typo.fontFamily)) {
            if (family) merged.typography.families.add(family);
          }
        }
        if (typo.fontSize) {
          for (const [name, size] of Object.entries(typo.fontSize)) {
            if (size && !merged.typography.sizes.has(size)) {
              merged.typography.sizes.set(size, name);
            }
          }
        }
      }

      // Merge spacing
      if (result.stylekit?.normalized?.tokens?.spacing) {
        for (const [name, value] of Object.entries(result.stylekit.normalized.tokens.spacing)) {
          if (value && !merged.spacing.has(value)) {
            merged.spacing.set(value, name);
          }
        }
      }

      // Merge components
      if (result.components?.components) {
        for (const [type, items] of Object.entries(result.components.components)) {
          if (!merged.components[type]) {
            merged.components[type] = { count: 0, pages: [] };
          }
          merged.components[type].count += items.length;
          merged.components[type].pages.push(result.url);
        }
      }

      // Merge breakpoints
      if (result.structure?.breakpoints?.breakpoints) {
        for (const bp of result.structure.breakpoints.breakpoints) {
          if (!merged.breakpoints.has(bp.px)) {
            merged.breakpoints.set(bp.px, bp);
          }
        }
      }

      // Merge CSS variables
      if (result.css?.variables?.root) {
        for (const [name, value] of Object.entries(result.css.variables.root)) {
          if (!merged.variables.has(name)) {
            merged.variables.set(name, { value, pages: [result.url] });
          } else {
            merged.variables.get(name).pages.push(result.url);
          }
        }
      }
    }

    // Convert to plain objects
    return {
      meta: merged.meta,
      colors: {
        unique: merged.colors.size,
        values: Array.from(merged.colors.values())
      },
      typography: {
        families: Array.from(merged.typography.families),
        sizes: Object.fromEntries(merged.typography.sizes)
      },
      spacing: Object.fromEntries(merged.spacing),
      components: merged.components,
      breakpoints: Array.from(merged.breakpoints.values()).sort((a, b) => a.px - b.px),
      variables: {
        count: merged.variables.size,
        global: Array.from(merged.variables.entries())
          .filter(([_, v]) => v.pages.length > 1)
          .map(([name, v]) => ({ name, value: v.value, pageCount: v.pages.length }))
      }
    };
  }

  // ============================================
  // Site Report Generation
  // ============================================

  /**
   * Generate a site-wide style report
   */
  function generateSiteReport(results, options = {}) {
    const merged = mergeResults(results);
    const successfulPages = results.filter(r => r && !r.error);

    const report = {
      meta: {
        siteName: options.siteName || new URL(location.href).hostname,
        generatedAt: new Date().toISOString(),
        pageCount: results.length,
        successfulPages: successfulPages.length
      },

      summary: {
        uniqueColors: merged.colors.unique,
        fontFamilies: merged.typography.families.length,
        fontSizes: Object.keys(merged.typography.sizes).length,
        spacingValues: Object.keys(merged.spacing).length,
        componentTypes: Object.keys(merged.components).length,
        breakpoints: merged.breakpoints.length,
        cssVariables: merged.variables.count
      },

      tokens: {
        colors: merged.colors.values.slice(0, 20),
        typography: merged.typography,
        spacing: merged.spacing,
        breakpoints: merged.breakpoints
      },

      components: merged.components,

      globalVariables: merged.variables.global,

      pages: successfulPages.map(r => ({
        url: r.url,
        title: r.title,
        componentCount: r.components?.summary?.total || 0
      })),

      consistency: analyzeConsistency(merged, successfulPages)
    };

    return report;
  }

  /**
   * Analyze style consistency across pages
   */
  function analyzeConsistency(merged, pages) {
    const issues = [];
    const score = { total: 100, deductions: [] };

    // Check color consistency
    const colorsWithMultipleNames = merged.colors.values.filter(c => c.names.length > 1);
    if (colorsWithMultipleNames.length > 5) {
      issues.push({
        type: 'color-naming',
        severity: 'warning',
        message: `${colorsWithMultipleNames.length} colors have inconsistent naming across pages`
      });
      score.deductions.push({ reason: 'Inconsistent color naming', points: 10 });
    }

    // Check if all pages use same font families
    if (merged.typography.families.length > 4) {
      issues.push({
        type: 'typography',
        severity: 'warning',
        message: `${merged.typography.families.length} different font families detected`
      });
      score.deductions.push({ reason: 'Too many font families', points: 5 });
    }

    // Check CSS variable usage
    const globalVarRatio = merged.variables.global.length / merged.variables.count;
    if (globalVarRatio < 0.5 && merged.variables.count > 10) {
      issues.push({
        type: 'variables',
        severity: 'info',
        message: 'Many CSS variables are page-specific, consider consolidating'
      });
      score.deductions.push({ reason: 'Low variable reuse', points: 5 });
    }

    // Calculate final score
    const totalDeductions = score.deductions.reduce((sum, d) => sum + d.points, 0);
    score.final = Math.max(0, score.total - totalDeductions);

    return {
      score: score.final,
      issues,
      deductions: score.deductions
    };
  }

  // ============================================
  // MCP Command Generation
  // ============================================

  /**
   * Generate MCP commands for multi-page extraction
   */
  function generateMCPWorkflow(pages, options = {}) {
    const commands = [];

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];

      // Navigate to page
      commands.push({
        step: i * 3 + 1,
        tool: 'navigate_page',
        params: { url: page.url },
        description: `Navigate to ${page.path}`
      });

      // Wait for load
      commands.push({
        step: i * 3 + 2,
        tool: 'wait_for',
        params: { time: options.waitTime || 2 },
        description: 'Wait for page load'
      });

      // Run extraction
      commands.push({
        step: i * 3 + 3,
        tool: 'evaluate_script',
        params: {
          function: `(() => {
            const result = {
              url: location.href,
              title: document.title,
              structure: window.__seStructure?.extract(),
              stylekit: window.__seStyleKit?.extract(),
              components: window.__seComponents?.generateReport(),
              css: window.__seCSS?.analyze()
            };
            window.__seMultiPage?.markPageComplete(location.href, result);
            return result;
          })()`
        },
        description: `Extract styles from ${page.path}`
      });
    }

    return {
      commands,
      totalSteps: commands.length,
      estimatedTime: `${pages.length * 5} seconds`
    };
  }

  // ============================================
  // Export
  // ============================================

  window.__seMultiPage = {
    installed: true,

    // Discovery
    discoverPages,
    discoverFromNavigation,
    discoverFromSitemap,

    // State management
    getExtractionState,
    initExtraction,
    markPageComplete,
    markPageError,
    clearExtractionState,

    // Merging
    mergeResults,

    // Reporting
    generateSiteReport,
    analyzeConsistency,

    // MCP integration
    generateMCPWorkflow
  };
})();
