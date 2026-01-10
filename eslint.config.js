import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

// Common Node.js globals
const nodeGlobals = {
  console: 'readonly',
  process: 'readonly',
  Buffer: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  setImmediate: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  TextEncoder: 'readonly',
  TextDecoder: 'readonly',
  fetch: 'readonly',
  Request: 'readonly',
  Response: 'readonly',
  Headers: 'readonly',
  RequestInit: 'readonly',
  AbortSignal: 'readonly',
  AbortController: 'readonly',
  global: 'readonly',
  require: 'readonly',
  module: 'readonly',
  exports: 'readonly',
};

// Browser/DOM globals for React apps
const browserGlobals = {
  ...nodeGlobals,
  window: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  localStorage: 'readonly',
  sessionStorage: 'readonly',
  crypto: 'readonly',
  btoa: 'readonly',
  atob: 'readonly',
  Blob: 'readonly',
  File: 'readonly',
  FileReader: 'readonly',
  FormData: 'readonly',
  alert: 'readonly',
  confirm: 'readonly',
  prompt: 'readonly',
  location: 'readonly',
  history: 'readonly',
  performance: 'readonly',
  requestAnimationFrame: 'readonly',
  cancelAnimationFrame: 'readonly',
  MutationObserver: 'readonly',
  ResizeObserver: 'readonly',
  IntersectionObserver: 'readonly',
  // DOM element types (used in TypeScript type annotations)
  React: 'readonly',
  JSX: 'readonly',
  HTMLElement: 'readonly',
  HTMLDivElement: 'readonly',
  HTMLSpanElement: 'readonly',
  HTMLButtonElement: 'readonly',
  HTMLInputElement: 'readonly',
  HTMLTextAreaElement: 'readonly',
  HTMLAnchorElement: 'readonly',
  HTMLFormElement: 'readonly',
  HTMLImageElement: 'readonly',
  HTMLTableElement: 'readonly',
  HTMLTableSectionElement: 'readonly',
  HTMLTableRowElement: 'readonly',
  HTMLTableCellElement: 'readonly',
  HTMLTableCaptionElement: 'readonly',
  HTMLUListElement: 'readonly',
  HTMLOListElement: 'readonly',
  HTMLLIElement: 'readonly',
  HTMLParagraphElement: 'readonly',
  HTMLHeadingElement: 'readonly',
  HTMLSelectElement: 'readonly',
  HTMLOptionElement: 'readonly',
  HTMLLabelElement: 'readonly',
  KeyboardEvent: 'readonly',
  MouseEvent: 'readonly',
  Event: 'readonly',
  EventTarget: 'readonly',
  RequestInit: 'readonly',
  supabase: 'readonly',
};

export default [
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/node_modules/**',
      '**/*.config.js',
      '**/*.config.mjs',
      '**/coverage/**',
      '**/.turbo/**',
    ],
  },
  js.configs.recommended,
  // TypeScript files for Node.js packages
  {
    files: ['packages/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: nodeGlobals,
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': 'off',
      'no-unused-vars': 'off',
    },
  },
  // TypeScript/React files for browser apps
  {
    files: ['apps/**/*.ts', 'apps/**/*.tsx'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: browserGlobals,
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': 'off',
      'no-unused-vars': 'off',
      'no-redeclare': 'off',
    },
  },
  // JavaScript files
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...nodeGlobals,
        document: 'readonly',
        window: 'readonly',
        alert: 'readonly',
        jQuery: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
    },
  },
  // WordPress plugin JS files
  {
    files: ['**/plugins/**/*.js'],
    languageOptions: {
      globals: {
        document: 'readonly',
        window: 'readonly',
        alert: 'readonly',
        jQuery: 'readonly',
        openbotauth: 'readonly',
      },
    },
  },
];

