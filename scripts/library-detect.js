// Style Extractor: Third-party Library Detection
//
// Detects common UI/animation libraries via global symbols, DOM hints, and asset URLs.
// Exposed as window.__seLibs for the registry preset pipeline.

(() => {
  if (window.__seLibs?.installed) return;

  const DEFAULT_GLOBALS = [
    { name: 'Swiper', test: () => typeof window.Swiper !== 'undefined' },
    { name: 'gsap', test: () => typeof window.gsap !== 'undefined' },
    { name: 'ScrollTrigger', test: () => typeof window.ScrollTrigger !== 'undefined' },
    { name: 'anime', test: () => typeof window.anime !== 'undefined' },
    { name: 'THREE', test: () => typeof window.THREE !== 'undefined' },
    { name: 'lottie', test: () => typeof window.lottie !== 'undefined' }
  ];

  function collectAssets() {
    const scripts = Array.from(document.scripts || [])
      .map((s) => s && s.src)
      .filter(Boolean);
    const stylesheets = Array.from(document.querySelectorAll('link[rel="stylesheet"]') || [])
      .map((l) => l && l.href)
      .filter(Boolean);
    return { scripts, stylesheets };
  }

  function hasKeyword(urls, kw) {
    const k = String(kw || '').toLowerCase();
    if (!k) return false;
    return (urls || []).some((u) => String(u).toLowerCase().includes(k));
  }

  function detectDomHints() {
    return {
      swiper: !!document.querySelector('.swiper, .swiper-wrapper, .swiper-slide'),
      video: document.querySelectorAll('video').length,
      canvas: document.querySelectorAll('canvas').length,
      svg: document.querySelectorAll('svg').length
    };
  }

  function detectFingerprints(assets) {
    return {
      hasSwiperThemeVar: (() => {
        try {
          const v = getComputedStyle(document.documentElement).getPropertyValue('--swiper-theme-color');
          return Boolean(v && v.trim());
        } catch {
          return false;
        }
      })(),
      assetHints: {
        swiper: hasKeyword((assets?.scripts || []).concat(assets?.stylesheets || []), 'swiper'),
        gsap: hasKeyword(assets?.scripts || [], 'gsap'),
        lottie: hasKeyword(assets?.scripts || [], 'lottie'),
        three: hasKeyword(assets?.scripts || [], 'three')
      }
    };
  }

  function detect() {
    const assets = collectAssets();

    const globals = {};
    for (const item of DEFAULT_GLOBALS) {
      try {
        globals[item.name] = Boolean(item.test());
      } catch {
        globals[item.name] = false;
      }
    }

    const dom = detectDomHints();
    const fingerprints = detectFingerprints(assets);

    const likely = [];
    const pushLikely = (name, reason) => {
      if (!name) return;
      likely.push({ name, reason });
    };

    if (globals.Swiper || dom.swiper || fingerprints.assetHints.swiper || fingerprints.hasSwiperThemeVar) {
      pushLikely('Swiper', 'globals/dom/assets/cssVar');
    }
    if (globals.gsap || globals.ScrollTrigger || fingerprints.assetHints.gsap) {
      pushLikely('GSAP', 'globals/assets');
    }
    if (globals.lottie || fingerprints.assetHints.lottie) {
      pushLikely('Lottie', 'globals/assets');
    }
    if (globals.THREE || fingerprints.assetHints.three) {
      pushLikely('Three.js', 'globals/assets');
    }
    if (globals.anime) {
      pushLikely('anime.js', 'globals');
    }

    return { globals, dom, fingerprints, assets, likely };
  }

  window.__seLibs = {
    installed: true,
    version: '1.0.0',
    detect
  };
})();

