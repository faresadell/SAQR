import type { Config } from "tailwindcss";

// Single source of truth for design tokens (colors, type, radii).
// Brand = the falcon logo: deep navy + silver, with one blue accent.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { 950: "#070B1A", 900: "#0B1530", 800: "#12214A", 700: "#1E3A8A" },
        brand: { DEFAULT: "#2563EB", hover: "#1D4ED8", soft: "#DBEAFE" },
        silver: { DEFAULT: "#C7D2E6", dim: "#8EA0C0" },
        background: "#F8FAFC",
        surface: "#FFFFFF",
        ink: { DEFAULT: "#0F172A", muted: "#475569" },
        line: "#E2E8F0",
        success: { DEFAULT: "#059669", soft: "#D1FAE5", ink: "#065F46" },
        warning: { DEFAULT: "#F59E0B", soft: "#FEF3C7", ink: "#92400E" },
        danger: { DEFAULT: "#DC2626", soft: "#FEE2E2", ink: "#991B1B" },
      },
      fontFamily: {
        sans: ["var(--font-cairo)", "var(--font-inter)", "system-ui", "sans-serif"],
        latin: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      borderRadius: { control: "0.75rem", card: "1rem" },
      boxShadow: { card: "0 1px 2px rgba(15,23,42,0.06), 0 4px 16px rgba(15,23,42,0.05)" },
    },
  },
  plugins: [],
};

export default config;
