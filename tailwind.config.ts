import type { Config } from "tailwindcss";

// Single source of truth for design tokens (colors, type, radii, shadows, motion).
// Brand = the falcon logo: deep navy + silver, with one blue accent.
// Pages and components use these names only; never hard-code hex values in components.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { 950: "#070B1A", 900: "#0B1530", 800: "#12214A", 700: "#1E3A8A", 600: "#274690" },
        brand: { DEFAULT: "#2563EB", hover: "#1D4ED8", soft: "#DBEAFE" },
        silver: { DEFAULT: "#C7D2E6", dim: "#8EA0C0" },
        background: "#F8FAFC",
        canvas: "#F1F5F9",
        surface: { DEFAULT: "#FFFFFF", muted: "#F8FAFC" },
        ink: { DEFAULT: "#0F172A", muted: "#475569", faint: "#64748B" },
        line: { DEFAULT: "#E2E8F0", strong: "#CBD5E1" },
        success: { DEFAULT: "#059669", soft: "#D1FAE5", ink: "#065F46" },
        warning: { DEFAULT: "#F59E0B", soft: "#FEF3C7", ink: "#92400E" },
        danger: { DEFAULT: "#DC2626", soft: "#FEE2E2", ink: "#991B1B" },
      },
      fontFamily: {
        sans: ["var(--font-cairo)", "var(--font-inter)", "system-ui", "sans-serif"],
        latin: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      borderRadius: { control: "0.75rem", card: "1rem", sheet: "1.5rem" },
      boxShadow: {
        card: "0 1px 2px rgba(15,23,42,0.06), 0 4px 16px rgba(15,23,42,0.05)",
        pop: "0 12px 40px rgba(7,11,26,0.22)",
      },
      maxWidth: { page: "72rem" },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "rise-in": { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
        "count-pop": { "0%": { transform: "scale(1)" }, "40%": { transform: "scale(1.06)" }, "100%": { transform: "scale(1)" } },
      },
      animation: {
        "fade-in": "fade-in 160ms ease-out",
        "rise-in": "rise-in 200ms ease-out",
        "count-pop": "count-pop 160ms ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
