import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#0A0A0A',
          secondary: '#111111',
          card: '#161616',
          hover: '#1E1E1E',
          border: '#272727',
        },
        accent: {
          purple: '#A855F7',
          purple2: '#9333EA',
          glow: 'rgba(168,85,247,0.4)',
        },
        text: {
          primary: '#F0F0F0',
          secondary: '#999999',
          muted: '#555555',
        },
        status: {
          success: '#22C55E',
          error: '#EF4444',
          warning: '#F59E0B',
          running: '#A855F7',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'pulse-glow': 'pulseGlow 1.5s ease-in-out infinite',
        'spin-slow': 'spin 2s linear infinite',
        'fade-in': 'fadeIn 0.2s ease-out',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 8px 2px rgba(168,85,247,0.4)' },
          '50%': { boxShadow: '0 0 20px 6px rgba(168,85,247,0.7)' },
        },
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      boxShadow: {
        node: '0 0 0 1px #272727, 0 4px 24px rgba(0,0,0,0.5)',
        'node-selected': '0 0 0 2px #A855F7, 0 4px 24px rgba(168,85,247,0.2)',
        'node-running': '0 0 0 2px #A855F7, 0 0 20px 4px rgba(168,85,247,0.4)',
      },
    },
  },
  plugins: [],
};

export default config;
