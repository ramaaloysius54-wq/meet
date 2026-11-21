import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        rm: {
          bg: "#0F172A",
          stage: "#0A101E",
          sidebar: "#111C33",
          card: "#172554",
          surface: "#15223B",
          primary: "#1677FF",
          secondary: "#2563EB",
          border: "#263858",
          text: "#F8FAFC",
          muted: "#94A3B8",
          success: "#22C55E",
          danger: "#EF4444"
        }
      },
      boxShadow: {
        "speaker-glow": "0 0 0 2px #38BDF8, 0 0 22px rgba(22, 119, 255, 0.55)",
        "blue-glow": "0 8px 24px -4px rgba(22, 119, 255, 0.45)",
        "panel": "0 12px 32px -8px rgba(2, 6, 23, 0.65)"
      }
    }
  },
  plugins: []
};

export default config;
