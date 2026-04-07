# Testing and linting

## TypeScript tests

Tests live alongside source files as `*.test.ts`. Run with:

```sh
npm run test:ts        # vitest run (single pass)
npm run test:watch     # vitest (watch mode)
```

Vitest config is in `vitest.config.ts` — includes `src/**/*.test.ts`.

## Go tests

TUI tests live alongside source files as `*_test.go`. Run with:

```sh
npm run test:tui       # cd tui && go test ./...
```

## All tests

```sh
npm test               # runs test:ts then test:tui
```

## Linting

```sh
npm run lint           # runs lint:ts, lint:tui, lint:md, lint:yaml
npm run lint:ts        # eslint src
npm run lint:tui       # cd tui && golangci-lint run ./...
npm run lint:md        # markdownlint
npm run lint:yaml      # yamllint
```

## Type checking

```sh
npm run typecheck      # tsc --noEmit
```

## Formatting

```sh
npm run format         # prettier (TS) + golangci-lint --fix (Go)
```

## Commit conventions

Commits follow [Conventional Commits](https://www.conventionalcommits.org/). Commitlint enforces this via husky pre-commit hooks. Use `npm run commit` for an interactive prompt.

## Build

```sh
npm run build          # tsup (TS) + go build (TUI)
```

Build output: `dist/` (TypeScript) and `tui/playback-tui` (Go binary).
