const path = require('path');

module.exports = {
  test: {
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    exclude: ['src/__tests__/smoke/**', 'node_modules/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  css: false,
  server: {
    fs: {
      allow: ['.'],
    },
  },
};
