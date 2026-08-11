# Abetterlou Starter

A Vite + React + TypeScript + Tailwind v4 project pre-wired with the
Abetterlou design tokens.

## What's here

- `DESIGN.md` — the full style guide (colors, type scale, components, do's/don'ts, imagery direction). Keep this in the repo as the source of truth for anyone (human or AI) working on the UI later.
- `design/tokens.json` — the same tokens in [W3C Design Tokens](https://design-tokens.github.io/community-group/format/) format, for use in tools like Figma Tokens Studio or a future token-transform pipeline.
- `src/theme.css` — the tokens as a Tailwind v4 `@theme` block. Tailwind v4 auto-generates utility classes from these (`bg-espresso`, `text-warm-cream`, `bg-amber-forge`, `border-walnut`, etc.) — no `tailwind.config.js` needed.
- `src/index.css` — imports Tailwind + `theme.css` and sets the base page background/text/font.
- `src/App.tsx` — a starter page proving the tokens are wired up (pill buttons, hairline-border feature cards, amber accent).

## Run it locally

```bash
npm install
npm run dev
```

## Push it to GitHub

From inside this folder:

```bash
git init
git add .
git commit -m "Initial commit: Abetterlou starter with design tokens"
git branch -M main
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main
```

If you don't have a GitHub repo yet, create one first at
https://github.com/new (don't initialize it with a README, since this repo
already has one), then use the `origin` URL it gives you above.

If you have the `gh` CLI installed, you can skip the manual repo creation:

```bash
gh repo create <repo-name> --public --source=. --remote=origin --push
```

## Using the tokens elsewhere

- **Plain CSS project (no Tailwind):** use `variables.css` instead of
  `theme.css` — same values as plain `:root` custom properties.
- **Design tools:** import `design/tokens.json` directly into Figma Tokens
  Studio or similar.
- **Another React/Tailwind v4 project:** copy `src/theme.css` and `@import`
  it from that project's own CSS entry point.
