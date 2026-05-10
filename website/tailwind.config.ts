import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        green: {
          DEFAULT: "#1D9E75",
          dark: "#0F6E56",
          light: "rgba(29,158,117,0.1)",
          muted: "rgba(29,158,117,0.25)",
        },
        bg: {
          DEFAULT: "#0F1117",
          card: "#161B26",
          elevated: "#1C2333",
        },
        border: {
          DEFAULT: "rgba(255,255,255,0.08)",
          light: "rgba(255,255,255,0.05)",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
