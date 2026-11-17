import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        lunar: {
          void: "#09090B",
          panel: "#121216",
          raised: "#19191F",
          line: "rgba(255,255,255,0.08)",
          cyan: "#9BE7F5",
          violet: "#B6A0FF",
        },
      },
      fontFamily: {
        sans: ["Inter", "Segoe UI", "sans-serif"],
        mono: ["Cascadia Code", "Consolas", "monospace"],
      },
      boxShadow: {
        glow: "0 0 40px rgba(155,231,245,0.08)",
      },
    },
  },
  plugins: [],
} satisfies Config;
