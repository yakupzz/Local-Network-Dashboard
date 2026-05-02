/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: '#3B82F6',
        success: '#10B981',
        error: '#EF4444',
        warning: '#F59E0B',
        dark: {
          bg: '#0F172A',
          card: '#1E293B',
          text: '#F1F5F9'
        },
        light: {
          bg: '#F8FAFC',
          card: '#FFFFFF',
          text: '#0F172A'
        }
      }
    },
  },
  plugins: [],
}
