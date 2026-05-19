#!/usr/bin/env node

import puppeteer from "puppeteer-core";

const args = process.argv.slice(2);
const json = args.includes("--json");
const fills = valuesAfter("--fill");
const clicks = valuesAfter("--click");
const presses = valuesAfter("--press");
const waitUrl = valueAfter("--wait-url");
const waitSelector = valueAfter("--wait-selector");
const waitResponse = valueAfter("--wait-response");
const timeout = Number(valueAfter("--timeout") || 10000);

if (args.includes("--help") || (!fills.length && !clicks.length && !presses.length)) {
	console.log("Usage: browser-action.js [--fill <selector::value>] [--click <selector>] [--press <selector::key>] [wait options] [--json]");
	console.log("\nRuns a browser action and captures basic console/network diagnostics.");
	console.log("\nSelectors can be CSS or one of:");
	console.log("  role=button[name='Save']");
	console.log("  label='Email'");
	console.log("  placeholder='Search'");
	console.log("  text='Save'");
	console.log("  css=#submit");
	console.log("\nWait options:");
	console.log("  --wait-url <text>");
	console.log("  --wait-selector <selector>");
	console.log("  --wait-response <url-text>");
	console.log("\nExamples:");
	console.log("  browser-action.js --fill \"role=searchbox[name='Search']::hello\" --click \"role=button[name='Go']\" --wait-url hello");
	console.log("  browser-action.js --click \"text='Save'\" --wait-selector \"text='Saved'\"");
	process.exit(args.includes("--help") ? 0 : 1);
}

function valueAfter(flag) {
	const index = args.indexOf(flag);
	return index === -1 ? null : args[index + 1];
}

function valuesAfter(flag) {
	const values = [];
	for (let i = 0; i < args.length; i++) {
		if (args[i] === flag && args[i + 1]) values.push(args[i + 1]);
	}
	return values;
}

function splitPair(value, flag) {
	const index = value.indexOf("::");
	if (index === -1) {
		console.error(`✗ ${flag} expects <selector::value>`);
		process.exit(1);
	}
	return [value.slice(0, index), value.slice(index + 2)];
}

function namedWait(name, promise) {
	return promise.then(() => ({ name, ok: true })).catch((error) => ({ name, ok: false, error: error.message }));
}

const b = await Promise.race([
	puppeteer.connect({
		browserURL: "http://localhost:9222",
		defaultViewport: null,
	}),
	new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
]).catch((e) => {
	console.error("✗ Could not connect to browser:", e.message);
	console.error("  Run: browser-start.js");
	process.exit(1);
});

const p = (await b.pages()).at(-1);

if (!p) {
	console.error("✗ No active tab found");
	process.exit(1);
}

const consoleMessages = [];
const pageErrors = [];
const networkFailures = [];
const httpErrors = [];

p.on("console", (msg) => {
	consoleMessages.push({ type: msg.type(), text: msg.text(), location: msg.location() });
});
p.on("pageerror", (error) => pageErrors.push(error.message));
p.on("requestfailed", (request) => {
	networkFailures.push({ method: request.method(), url: request.url(), error: request.failure()?.errorText || "unknown" });
});
p.on("response", (response) => {
	if (response.status() >= 400) {
		httpErrors.push({ status: response.status(), method: response.request().method(), url: response.url() });
	}
});

const responseWaiter = waitResponse
	? namedWait("response", p.waitForResponse((response) => response.url().includes(waitResponse), { timeout }))
	: null;

const start = Date.now();
const actions = [];

try {
	for (const fill of fills) {
		const [selector, value] = splitPair(fill, "--fill");
		await runDomAction(p, "fill", selector, value);
		actions.push({ type: "fill", selector });
	}
	for (const press of presses) {
		const [selector, key] = splitPair(press, "--press");
		await runDomAction(p, "focus", selector);
		await p.keyboard.press(key);
		actions.push({ type: "press", selector, key });
	}
	for (const selector of clicks) {
		await runDomAction(p, "click", selector);
		actions.push({ type: "click", selector });
	}
} catch (error) {
	console.error("✗ Action failed:", error.message);
	await b.disconnect();
	process.exit(1);
}

const waits = [];
if (waitUrl) waits.push(await namedWait("url", p.waitForFunction((value) => location.href.includes(value), { timeout }, waitUrl)));
if (waitSelector) waits.push(await namedWait("selector", waitForDomSelector(p, waitSelector, timeout)));
if (responseWaiter) waits.push(await responseWaiter);
if (!waits.length) await new Promise((resolve) => setTimeout(resolve, 300));
await p.waitForFunction(() => document.readyState !== "loading", { timeout }).catch(() => {});

const result = {
	url: p.url(),
	title: await p.title(),
	durationMs: Date.now() - start,
	actions,
	waits,
	consoleErrors: consoleMessages.filter((message) => message.type === "error"),
	consoleWarnings: consoleMessages.filter((message) => message.type === "warning" || message.type === "warn"),
	pageErrors,
	networkFailures,
	httpErrors,
};

if (json) {
	console.log(JSON.stringify(result, null, 2));
} else {
	console.log(`URL: ${result.url}`);
	console.log(`Title: ${result.title}`);
	console.log(`Duration: ${result.durationMs}ms`);
	console.log(`Actions: ${actions.map((action) => action.type).join(", ")}`);
	for (const wait of waits) console.log(`Wait ${wait.name}: ${wait.ok ? "ok" : `failed - ${wait.error}`}`);
	console.log(`Console errors: ${result.consoleErrors.length}`);
	console.log(`Console warnings: ${result.consoleWarnings.length}`);
	console.log(`Page errors: ${pageErrors.length}`);
	console.log(`Network failures: ${networkFailures.length}`);
	console.log(`HTTP errors: ${httpErrors.length}`);
}

await b.disconnect();

async function waitForDomSelector(page, selector, timeout) {
	return page.waitForFunction((selector) => {
		const el = window.__browserToolsResolve?.(selector);
		return !!el && window.__browserToolsVisible?.(el);
	}, { timeout }, selector).catch(async () => {
		await installResolver(page);
		return page.waitForFunction((selector) => {
			const el = window.__browserToolsResolve(selector);
			return !!el && window.__browserToolsVisible(el);
		}, { timeout }, selector);
	});
}

async function runDomAction(page, type, selector, value = null) {
	await installResolver(page);
	return page.evaluate(({ type, selector, value }) => {
		const el = window.__browserToolsResolve(selector);
		if (!el) throw new Error(`No element found for ${selector}`);
		if (!window.__browserToolsVisible(el)) throw new Error(`Element is not visible for ${selector}`);
		if (type === "focus") {
			el.focus();
			return true;
		}
		if (type === "fill") {
			el.focus();
			el.value = value;
			el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
			el.dispatchEvent(new Event("change", { bubbles: true }));
			return true;
		}
		if (type === "click") {
			el.click();
			return true;
		}
		throw new Error(`Unknown action ${type}`);
	}, { type, selector, value });
}

async function installResolver(page) {
	await page.evaluate(() => {
		window.__browserToolsClean = (text) => (text || "").replace(/\s+/g, " ").trim();
		window.__browserToolsUnquote = (text) => {
			const trimmed = window.__browserToolsClean(text);
			return /^['"].*['"]$/.test(trimmed) ? trimmed.slice(1, -1) : trimmed;
		};
		window.__browserToolsVisible = (el) => {
			const style = getComputedStyle(el);
			return style.visibility !== "hidden" && style.display !== "none" && !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
		};
		window.__browserToolsLabels = (el) => {
			const clean = window.__browserToolsClean;
			const labels = Array.from(el.labels || []).map((label) => clean(label.textContent));
			if (el.id && window.CSS?.escape) {
				labels.push(...Array.from(document.querySelectorAll(`label[for="${CSS.escape(el.id)}"]`)).map((label) => clean(label.textContent)));
			}
			const wrapper = el.closest("label");
			if (wrapper) labels.push(clean(wrapper.textContent));
			return labels.filter(Boolean);
		};
		window.__browserToolsRole = (el) => {
			const explicit = el.getAttribute("role");
			if (explicit) return explicit;
			const tag = el.tagName.toLowerCase();
			const inputType = (el.getAttribute("type") || "").toLowerCase();
			if (tag === "button") return "button";
			if (tag === "a" && el.hasAttribute("href")) return "link";
			if (tag === "select") return "combobox";
			if (tag === "textarea") return "textbox";
			if (tag === "input") {
				if (["button", "submit", "reset"].includes(inputType)) return "button";
				if (inputType === "checkbox") return "checkbox";
				if (inputType === "radio") return "radio";
				if (inputType === "search") return "searchbox";
				if (inputType !== "hidden") return "textbox";
			}
			return null;
		};
		window.__browserToolsName = (el) => window.__browserToolsClean(
			el.getAttribute("aria-label") ||
			window.__browserToolsLabels(el)[0] ||
			el.getAttribute("placeholder") ||
			el.getAttribute("value") ||
			el.innerText ||
			el.textContent ||
			"",
		);
		window.__browserToolsResolve = (selector) => {
			const clean = window.__browserToolsClean;
			const unquote = window.__browserToolsUnquote;
			const visible = window.__browserToolsVisible;
			if (selector.startsWith("css=")) return document.querySelector(selector.slice(4));
			if (selector.startsWith("label=")) {
				const label = unquote(selector.slice(6));
				return Array.from(document.querySelectorAll("input, textarea, select")).find((el) => visible(el) && window.__browserToolsLabels(el).includes(label));
			}
			if (selector.startsWith("placeholder=")) {
				const placeholder = unquote(selector.slice(12));
				return Array.from(document.querySelectorAll("input, textarea")).find((el) => visible(el) && el.getAttribute("placeholder") === placeholder);
			}
			if (selector.startsWith("text=")) {
				const text = unquote(selector.slice(5));
				return Array.from(document.querySelectorAll("button, a, [role='button']")).find((el) => visible(el) && clean(el.innerText || el.textContent).includes(text)) ||
					Array.from(document.querySelectorAll("body *")).find((el) => visible(el) && clean(el.innerText || el.textContent).includes(text));
			}
			const roleMatch = selector.match(/^role=([^[]+)(?:\[name=(['"])(.*)\2\])?$/);
			if (roleMatch) {
				const role = roleMatch[1];
				const name = roleMatch[3];
				return Array.from(document.querySelectorAll("button, a, input, textarea, select, form, [role]")).find((el) => visible(el) && window.__browserToolsRole(el) === role && (!name || window.__browserToolsName(el) === name));
			}
			return document.querySelector(selector);
		};
	});
}
