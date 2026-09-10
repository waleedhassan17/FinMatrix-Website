# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
## Deployment (Vercel)

`vercel.json` sets cache headers only — no `builds` key, so the Vite preset stays
inferred. Two rules, and they are a pair:

- `/assets/*` → `immutable`. Safe because Vite content-hashes every filename, so
  a changed file is a *different* file.
- `index.html` and `/` → `must-revalidate`. This one is load-bearing. Deployments
  are immutable snapshots, so a redeploy deletes the old hashed chunks; a browser
  holding a cached `index.html` would keep asking for files that no longer exist
  and fail with `Failed to fetch dynamically imported module` on the next
  navigation. Revalidating the HTML is what keeps the hash list current.

`src/app/lazyWithReload.ts` handles the same failure from the client side, for
tabs that were already open when the deploy landed.

# FinMatrix-Website
