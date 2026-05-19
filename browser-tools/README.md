# browser-tools

Chrome DevTools Protocol tools for agent-assisted web inspection, diagnostics, and Playwright test authoring support.

## Design principle

This skill should not try to become a full browser automation framework.

It should provide four things:

1. A compact, structured model of the current page.
2. A factual recording of what happened during manual testing.
3. Playwright locator and assertion intelligence.
4. A bridge between UI behavior and browser-observed API/network evidence.

The skill should prefer structured JSON artifacts over long prose. The agent can summarize those artifacts, but the tools should capture facts.

The skill should not replace Playwright, Bruno, curl, or a full test framework. It should help the agent inspect, diagnose, and explain what is happening in the browser, then turn that evidence into better manual testing notes or Playwright test code.

## Implementation model

The tools are implemented with Puppeteer/CDP because that is a lightweight way to connect to a running Chrome instance on `:9222`.

The locators suggested by the tools are Playwright-style because they are intended to be copied into Playwright tests.

`browser-action.js` supports a small Playwright-inspired selector syntax for quick validation. It is not the full Playwright locator engine.

## Tools

| Tool | Purpose |
|------|---------|
| `browser-start.js` | Start Chrome with remote debugging enabled |
| `browser-nav.js` | Navigate the active tab or open a new tab |
| `browser-eval.js` | Evaluate JavaScript in the active tab |
| `browser-locators.js` | Suggest Playwright-style locators from the current page |
| `browser-action.js` | Run simple actions and collect diagnostics |
| `browser-console.js` | Capture console messages and page errors |
| `browser-network.js` | Capture requests, failures, HTTP errors, and slow calls |
| `browser-screenshot.js` | Capture a screenshot |
| `browser-pick.js` | Let the user visually pick elements |
| `browser-cookies.js` | Inspect cookies for the active tab |
| `browser-content.js` | Extract readable page content as markdown |

## Typical workflow

```bash
./browser-start.js
./browser-nav.js https://example.com
./browser-locators.js --json
./browser-action.js --click "role=button[name='Save']" --wait-selector "text='Saved'" --json
./browser-console.js --duration 5000 --json
./browser-network.js --filter "/api/" --duration 5000 --json
```

Prefer deterministic waits such as URL changes, visible selectors, or expected responses. Do not use network idle as the default success condition.

## Locator strategy

Prefer Playwright user-facing locators:

1. `getByRole()`
2. `getByLabel()`
3. `getByPlaceholder()`
4. `getByText()`
5. CSS selectors only as fallback

Example:

```ts
await page.getByRole('searchbox', { name: 'Search' }).fill('query');
await page.getByRole('button', { name: 'Search' }).click();
```
