/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Roboto", "Arial", "sans-serif"],
      },
      colors: {
        surface: "#F5F5F5",
        ink: "#1A1A1A",
        muted: "#6B7280",
        border: "#E5E7EB",
        // Agent accent colours
        moderator: {
          bg: "#EFF6FF",
          border: "#BFDBFE",
          text: "#1D4ED8",
          avatar: "#3B82F6",
        },
        advocate: {
          bg: "#F0FDF4",
          border: "#BBF7D0",
          text: "#15803D",
          avatar: "#22C55E",
        },
        critic: {
          bg: "#FFF7ED",
          border: "#FED7AA",
          text: "#C2410C",
          avatar: "#F97316",
        },
        audience: {
          bg: "#FAF5FF",
          border: "#E9D5FF",
          text: "#7E22CE",
          avatar: "#A855F7",
        },
      },
    },
  },
  plugins: [],
};
