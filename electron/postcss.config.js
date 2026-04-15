module.exports = {
  plugins: {
    '@tailwindcss/postcss': {
      // Tailwind's production Lightning CSS optimizer rewrites backdrop-filter
      // to the unsupported -webkit-prefixed form in Electron 39/Chromium 142.
      // Vite still minifies CSS after this step.
      optimize: false
    }
  }
}
