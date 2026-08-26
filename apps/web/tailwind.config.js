/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // shadcn/ui-compatible token names, driven by the CSS variables in
        // src/index.css. Phase 1 onwards we add shadcn components on top.
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      // Small phones (iPhone SE is 375px) genuinely need a step below `sm`:
      // the signed-out header has to drop a link between 375 and 400px or it
      // overflows and scrolls the whole page sideways.
      screens: {
        xs: "400px",
      },
      fontFamily: {
        // Self-hosted variable fonts (see main.tsx) — no CDN request, so the
        // type renders identically offline and in production.
        sans: ['"Manrope Variable"', "ui-sans-serif", "system-ui", "sans-serif"],
        display: ['"Fraunces Variable"', "ui-serif", "Georgia", "serif"],
        /*
         * The shouting voice. Archivo carries both a weight (100–900) and a
         * width (62–125%) axis, so a headline can be pushed heavy AND narrow —
         * which is what lets oversized type hold a line without wrapping. Used
         * only at display scale; Fraunces keeps the serif line beneath it and
         * Manrope keeps every piece of UI text.
         */
        grotesk: ['"Archivo Variable"', "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "calc(var(--radius) + 4px)",
        "2xl": "calc(var(--radius) + 10px)",
      },
      /*
       * Elevation as a deliberate scale rather than ad-hoc `shadow-md`s. Each
       * step layers a tight contact shadow under a wider ambient one, which is
       * how real light behaves — a single large blur always looks like fog.
       */
      boxShadow: {
        subtle:
          "0 1px 2px -1px hsl(var(--shadow-tint) / 0.08), 0 1px 3px hsl(var(--shadow-tint) / 0.05)",
        raised:
          "0 1px 2px -1px hsl(var(--shadow-tint) / 0.09), 0 4px 12px -2px hsl(var(--shadow-tint) / 0.08)",
        lifted:
          "0 2px 4px -2px hsl(var(--shadow-tint) / 0.1), 0 12px 28px -6px hsl(var(--shadow-tint) / 0.14)",
        float:
          "0 4px 8px -4px hsl(var(--shadow-tint) / 0.12), 0 24px 48px -12px hsl(var(--shadow-tint) / 0.2)",
      },
      transitionTimingFunction: {
        "out-soft": "cubic-bezier(0.22, 1, 0.36, 1)",
        spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
      keyframes: {
        // The hero's scroll cue: a dot falling down its hairline, then resetting.
        "scroll-cue": {
          "0%": { transform: "translate(-50%, 0)", opacity: "0" },
          "20%": { opacity: "1" },
          "80%": { opacity: "1" },
          "100%": { transform: "translate(-50%, 2rem)", opacity: "0" },
        },
        /*
         * Starts at 0.3, NOT 0 — the same rule as `.row-enter` in index.css.
         * An animation that has been created but is not advancing (a throttled
         * background tab, a stalled frame loop, a renderer that never
         * composites) paints and holds its FIRST keyframe. At `opacity: 0` that
         * means the content is simply gone, which is the worst failure this
         * site has; at 0.3 the worst case is "briefly dim". This is the
         * workhorse entrance for `Reveal` and `.stagger`, so it carries most of
         * the page's text.
         */
        "fade-up": {
          from: { opacity: "0.3", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        /*
         * Same rule, and it matters most here: `fade-in` is the dialog backdrop
         * and `scale-in` the dialog panel. A frozen first keyframe at zero
         * opacity gives an INVISIBLE modal that has already trapped focus and
         * locked scroll — the user is stuck in a dialog they cannot see.
         */
        "fade-in": {
          from: { opacity: "0.3" },
          to: { opacity: "1" },
        },
        "scale-in": {
          from: { opacity: "0.3", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "slide-down": {
          // Toasts. Same rule: a frozen toast should read as faint, not absent.
          from: { opacity: "0.3", transform: "translateY(-8px) scale(0.98)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        // Skeletons sweep a highlight across themselves instead of pulsing.
        // A pulse says "broken"; a sweep says "working on it".
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        "draw-in": {
          from: { transform: "scaleX(0)" },
          to: { transform: "scaleX(1)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) both",
        "fade-in": "fade-in 0.4s ease-out both",
        "scale-in": "scale-in 0.25s cubic-bezier(0.22, 1, 0.36, 1) both",
        "slide-down": "slide-down 0.2s cubic-bezier(0.22, 1, 0.36, 1) both",
        shimmer: "shimmer 1.8s infinite",
        "draw-in": "draw-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) both",
      },
    },
  },
  plugins: [],
};
