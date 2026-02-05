/** @type {import('tailwindcss').Config} */

// Style Extractor - Tailwind CSS Configuration
// Generated from: {{SOURCE_URL}}
// Generated at: {{TIMESTAMP}}

module.exports = {
  theme: {
    extend: {
      // ===========================================
      // Colors
      // ===========================================
      colors: {
        // Semantic colors
        primary: '{{COLOR_PRIMARY}}',
        secondary: '{{COLOR_SECONDARY}}',
        accent: '{{COLOR_ACCENT}}',

        // Surface colors
        background: '{{COLOR_BACKGROUND}}',
        surface: '{{COLOR_SURFACE}}',

        // Text colors
        text: {
          DEFAULT: '{{COLOR_TEXT}}',
          muted: '{{COLOR_TEXT_MUTED}}'
        },

        // Border colors
        border: {
          DEFAULT: '{{COLOR_BORDER}}',
          muted: '{{COLOR_BORDER_MUTED}}'
        },

        // Semantic states
        error: '{{COLOR_ERROR}}',
        success: '{{COLOR_SUCCESS}}',
        warning: '{{COLOR_WARNING}}',
        info: '{{COLOR_INFO}}'
      },

      // ===========================================
      // Typography
      // ===========================================
      fontFamily: {
        primary: ['{{FONT_PRIMARY}}', 'system-ui', 'sans-serif'],
        secondary: ['{{FONT_SECONDARY}}', 'serif'],
        mono: ['{{FONT_MONO}}', 'monospace']
      },

      fontSize: {
        xs: '{{FONT_SIZE_XS}}',
        sm: '{{FONT_SIZE_SM}}',
        base: '{{FONT_SIZE_BASE}}',
        lg: '{{FONT_SIZE_LG}}',
        xl: '{{FONT_SIZE_XL}}',
        '2xl': '{{FONT_SIZE_2XL}}',
        '3xl': '{{FONT_SIZE_3XL}}',
        '4xl': '{{FONT_SIZE_4XL}}'
      },

      lineHeight: {
        tight: '{{LINE_HEIGHT_TIGHT}}',
        normal: '{{LINE_HEIGHT_NORMAL}}',
        relaxed: '{{LINE_HEIGHT_RELAXED}}'
      },

      // ===========================================
      // Spacing
      // ===========================================
      spacing: {
        xs: '{{SPACING_XS}}',
        sm: '{{SPACING_SM}}',
        md: '{{SPACING_MD}}',
        lg: '{{SPACING_LG}}',
        xl: '{{SPACING_XL}}',
        '2xl': '{{SPACING_2XL}}',
        '3xl': '{{SPACING_3XL}}',
        '4xl': '{{SPACING_4XL}}'
      },

      // ===========================================
      // Border Radius
      // ===========================================
      borderRadius: {
        none: '0',
        sm: '{{RADIUS_SM}}',
        DEFAULT: '{{RADIUS_DEFAULT}}',
        md: '{{RADIUS_MD}}',
        lg: '{{RADIUS_LG}}',
        xl: '{{RADIUS_XL}}',
        full: '9999px'
      },

      // ===========================================
      // Box Shadow
      // ===========================================
      boxShadow: {
        sm: '{{SHADOW_SM}}',
        DEFAULT: '{{SHADOW_DEFAULT}}',
        md: '{{SHADOW_MD}}',
        lg: '{{SHADOW_LG}}',
        xl: '{{SHADOW_XL}}'
      },

      // ===========================================
      // Transitions
      // ===========================================
      transitionDuration: {
        instant: '{{DURATION_INSTANT}}',
        fast: '{{DURATION_FAST}}',
        normal: '{{DURATION_NORMAL}}',
        slow: '{{DURATION_SLOW}}',
        slower: '{{DURATION_SLOWER}}'
      },

      transitionTimingFunction: {
        linear: 'linear',
        ease: 'ease',
        'ease-in': 'ease-in',
        'ease-out': 'ease-out',
        'ease-in-out': 'ease-in-out',
        emphasis: '{{EASING_EMPHASIS}}'
      },

      // ===========================================
      // Keyframes
      // ===========================================
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        },
        'fade-out': {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' }
        },
        'slide-in-up': {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' }
        },
        'slide-in-down': {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' }
        },
        'scale-in': {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' }
        }
        // Add custom keyframes extracted from the site here
      },

      // ===========================================
      // Animations
      // ===========================================
      animation: {
        'fade-in': 'fade-in {{DURATION_NORMAL}} ease-out',
        'fade-out': 'fade-out {{DURATION_NORMAL}} ease-out',
        'slide-in-up': 'slide-in-up {{DURATION_NORMAL}} ease-out',
        'slide-in-down': 'slide-in-down {{DURATION_NORMAL}} ease-out',
        'scale-in': 'scale-in {{DURATION_NORMAL}} ease-out'
      }
    }
  },

  plugins: [
    // Add plugins as needed
  ]
}
