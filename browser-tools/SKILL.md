---
name: browser-tools
description: Interactive browser automation via Chrome DevTools Protocol. Use when you need to interact with web pages, test frontends, inspect DOM/accessibility, debug console/network issues, or validate Playwright locators.
---

# Browser Tools

Chrome DevTools Protocol tools for agent-assisted web automation. These tools connect to Chrome running on `:9222` with remote debugging enabled.

## Setup

Run once before first use:

```bash
cd {baseDir}/browser-tools
npm install
```

## Start Chrome

```bash
{baseDir}/browser-start.js              # Fresh profile
{baseDir}/browser-start.js --profile    # Copy user's profile (cookies, logins)
```

Launch Chrome with remote debugging on `:9222`. Use `--profile` to preserve user's authentication state.

## Navigate

```bash
{baseDir}/browser-nav.js https://example.com
{baseDir}/browser-nav.js https://example.com --new
```

Navigate to URLs. Use `--new` flag to open in a new tab instead of reusing current tab.

## Evaluate JavaScript

```bash
{baseDir}/browser-eval.js 'document.title'
{baseDir}/browser-eval.js 'document.querySelectorAll("a").length'
```

Execute JavaScript in the active tab. Code runs in async context. Use this to extract data, inspect page state, or perform DOM operations programmatically.

## Suggest Playwright Locators

```bash
{baseDir}/browser-locators.js
{baseDir}/browser-locators.js --role button
{baseDir}/browser-locators.js --text "Save" --json
```

Inspect the active page and suggest Playwright-style locators. Prefer these user-facing locators over CSS selectors:

1. `getByRole()`
2. `getByLabel()`
3. `getByPlaceholder()`
4. `getByText()`
5. CSS selectors only as fallback

Example output can be converted directly into Playwright test code:

```typescript
await page.getByRole('searchbox', { name: 'Search' }).fill('query');
await page.getByRole('button', { name: 'Search' }).click();
```

The `action` field returned by `browser-locators.js` can be used with `browser-action.js`.

## Run and Diagnose an Action

```bash
{baseDir}/browser-action.js \
  --fill "role=searchbox[name='Search']::playwright" \
  --click "role=button[name='Go']" \
  --wait-url "playwright"
```

Run a simple browser action and collect diagnostics around it. Supported selectors:

```text
role=button[name='Save']
label='Email'
placeholder='Search'
text='Save'
css=#submit
```

Supported waits:

```bash
--wait-url <text>
--wait-selector <selector>
--wait-response <url-text>
```

Prefer deterministic waits such as URL changes, visible selectors, hidden spinners, or expected API responses. Do not use network-idle as the default success condition.

## Console Diagnostics

```bash
{baseDir}/browser-console.js --duration 10000
{baseDir}/browser-console.js --reload --json
```

Capture console messages and page errors from the active tab. Use this when UI behavior is unexpected or a page may have runtime errors.

## Network Diagnostics

```bash
{baseDir}/browser-network.js --duration 10000
{baseDir}/browser-network.js --reload --filter "/api/"
{baseDir}/browser-network.js --errors-only --json
```

Capture network requests from the active tab. Use this to find failed requests, HTTP `4xx/5xx`, slow requests, and API calls triggered by UI actions.

## Screenshot

```bash
{baseDir}/browser-screenshot.js
```

Capture current viewport and return temporary file path. Use this to visually inspect page state or verify UI changes.

## Pick Elements

```bash
{baseDir}/browser-pick.js "Click the submit button"
```

**IMPORTANT**: Use this tool when the user wants to select specific DOM elements on the page. This launches an interactive picker that lets the user click elements to select them. The user can select multiple elements (Cmd/Ctrl+Click) and press Enter when done. The tool returns CSS selectors for the selected elements.

Common use cases:
- User says "I want to click that button" → Use this tool to let them select it
- User says "extract data from these items" → Use this tool to let them select the elements
- When you need specific selectors but the page structure is complex or ambiguous

## Cookies

```bash
{baseDir}/browser-cookies.js
```

Display all cookies for the current tab including domain, path, httpOnly, and secure flags. Use this to debug authentication issues or inspect session state.

## Extract Page Content

```bash
{baseDir}/browser-content.js https://example.com
```

Navigate to a URL and extract readable content as markdown. Uses Mozilla Readability for article extraction and Turndown for HTML-to-markdown conversion. Works on pages with JavaScript content (waits for page to load).

## When to Use

- Testing frontend code in a real browser
- Interacting with pages that require JavaScript
- Inspecting DOM and accessibility information
- Finding robust Playwright locators
- Validating locators in a live page
- Debugging console errors or failed network calls
- When user needs to visually see or interact with a page
- Debugging authentication or session issues
- Scraping dynamic content that requires JS execution

---

## Efficiency Guide

### DOM Inspection Over Screenshots

**Don't** take screenshots to understand page state. **Do** parse the DOM/accessibility tree directly:

```javascript
// Get page structure
document.body.innerHTML.slice(0, 5000)

// Find interactive elements
Array.from(document.querySelectorAll('button, input, [role="button"]')).map(e => ({
  id: e.id,
  text: e.textContent.trim(),
  class: e.className
}))
```

Use screenshots for visual confirmation and communication, not as the primary inspection method.

### Locator Discovery

When helping write Playwright tests:

1. Run `browser-locators.js` first.
2. Prefer user-facing locators.
3. Validate important locators with `browser-action.js` or direct Playwright if needed.
4. Use CSS selectors only when no stable accessible locator exists.

### Console and Network Debugging

When an action behaves unexpectedly:

1. Use `browser-console.js` to check runtime errors.
2. Use `browser-network.js --filter "/api/"` to inspect backend calls.
3. Use `browser-action.js` to repeat the action and collect diagnostics in one run.

### Complex Scripts in Single Calls

Wrap everything in an IIFE to run multi-statement code:

```javascript
(function() {
  // Multiple operations
  const data = document.querySelector('#target').textContent;
  const buttons = document.querySelectorAll('button');
  
  // Interactions
  buttons[0].click();
  
  // Return results
  return JSON.stringify({ data, buttonCount: buttons.length });
})()
```

### Batch Interactions

**Don't** make separate calls for each click. **Do** batch them:

```javascript
(function() {
  const actions = ["btn1", "btn2", "btn3"];
  actions.forEach(id => document.getElementById(id).click());
  return "Done";
})()
```

### Typing/Input Sequences

```javascript
(function() {
  const text = "HELLO";
  for (const char of text) {
    document.getElementById("key-" + char).click();
  }
  document.getElementById("submit").click();
  return "Submitted: " + text;
})()
```

### Reading App/Game State

Extract structured state in one call:

```javascript
(function() {
  const state = {
    score: document.querySelector('.score')?.textContent,
    status: document.querySelector('.status')?.className,
    items: Array.from(document.querySelectorAll('.item')).map(el => ({
      text: el.textContent,
      active: el.classList.contains('active')
    }))
  };
  return JSON.stringify(state, null, 2);
})()
```

### Waiting for Updates

If DOM updates after actions, add a small delay with bash:

```bash
sleep 0.5 && {baseDir}/browser-eval.js '...'
```

For repeatable checks, prefer `browser-action.js` with `--wait-url`, `--wait-selector`, or `--wait-response`.

### Investigate Before Interacting

Always start by understanding the page structure:

```javascript
(function() {
  return {
    title: document.title,
    forms: document.forms.length,
    buttons: document.querySelectorAll('button').length,
    inputs: document.querySelectorAll('input').length,
    mainContent: document.body.innerHTML.slice(0, 3000)
  };
})()
```

Then target specific elements based on what you find.
