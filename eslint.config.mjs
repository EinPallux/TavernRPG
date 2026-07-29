import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

/**
 * Determinism guard (CLAUDE.md hard rule / architecture.md §4):
 * game logic must never read wall time or unseeded randomness directly.
 * `src/engine/rng.ts` and `src/engine/clock.ts` are the only sanctioned sources,
 * and they opt out of these rules below.
 */
const determinismRules = [
  {
    selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
    message:
      'Math.random() is banned. Use a seeded RNG stream from src/engine/rng.ts (docs/tech/architecture.md §4).',
  },
  {
    selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
    message:
      'Date.now() is banned. Read wall time through GameClock in src/engine/clock.ts (docs/tech/architecture.md §4).',
  },
  {
    selector: "NewExpression[callee.name='Date'][arguments.length=0]",
    message:
      'new Date() with no arguments is banned. Read wall time through GameClock in src/engine/clock.ts.',
  },
];

const eslintConfig = [
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
      'public/**',
      'game_assets/**',
    ],
  },

  ...nextCoreWebVitals,
  ...nextTypeScript,

  {
    rules: {
      'no-restricted-syntax': ['error', ...determinismRules],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  // The two modules that are allowed to touch the outside world.
  {
    files: ['src/engine/rng.ts', 'src/engine/clock.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },

  // Purity guard: the engine and content layers must run in plain Node.
  {
    files: ['src/engine/**/*.ts', 'src/data/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'react', message: 'src/engine and src/data must stay React-free (CLAUDE.md).' },
            {
              name: 'react-dom',
              message: 'src/engine and src/data must stay DOM-free (CLAUDE.md).',
            },
            {
              name: 'next',
              message: 'src/engine and src/data must stay framework-free (CLAUDE.md).',
            },
            {
              name: 'zustand',
              message: 'src/engine and src/data must not depend on UI state (CLAUDE.md).',
            },
            { name: 'idb', message: 'Persistence glue belongs in src/state, not the pure engine.' },
          ],
          patterns: [
            {
              group: ['next/*', '@/components/*', '@/state/*'],
              message: 'src/engine and src/data must not import UI layers (CLAUDE.md).',
            },
          ],
        },
      ],
    },
  },

  // Tests may reach for real timers/randomness when they are the thing under test.
  {
    files: ['**/*.test.ts', '**/*.test.tsx', 'e2e/**/*.ts', 'scripts/**/*.mjs'],
    rules: { 'no-restricted-syntax': 'off', 'no-console': 'off' },
  },
];

export default eslintConfig;
