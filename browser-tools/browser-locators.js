#!/usr/bin/env node

import puppeteer from "puppeteer-core";

const args = process.argv.slice(2);
const json = args.includes("--json");
const roleFilter = valueAfter("--role");
const textFilter = valueAfter("--text")?.toLowerCase();
const limit = Number(valueAfter("--limit") || 50);

if (args.includes("--help")) {
	console.log("Usage: browser-locators.js [--role <role>] [--text <text>] [--limit <n>] [--json]");
	console.log("\nSuggests Playwright-style locators for the active tab.");
	console.log("\nExamples:");
	console.log("  browser-locators.js");
	console.log("  browser-locators.js --role button");
	console.log('  browser-locators.js --text "Save" --json');
	process.exit(0);
}

function valueAfter(flag) {
	const index = args.indexOf(flag);
	return index === -1 ? null : args[index + 1];
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

const result = await p.evaluate(({ roleFilter, textFilter, limit }) => {
	const clean = (value) => (value || "").replace(/\s+/g, " ").trim();
	const quote = (value) => `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
	const cssEscape = (value) => {
		if (window.CSS?.escape) return window.CSS.escape(value);
		return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
	};
	const isVisible = (el) => {
		const style = getComputedStyle(el);
		return style.visibility !== "hidden" && style.display !== "none" && !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
	};
	const textOf = (el) => clean(el.innerText || el.textContent || el.value || "");
	const labelledBy = (el) => clean((el.getAttribute("aria-labelledby") || "")
		.split(/\s+/)
		.map((id) => document.getElementById(id)?.textContent || "")
		.join(" "));
	const labelsOf = (el) => {
		const labels = Array.from(el.labels || []).map((label) => clean(label.textContent));
		if (el.id) {
			labels.push(...Array.from(document.querySelectorAll(`label[for="${cssEscape(el.id)}"]`)).map((label) => clean(label.textContent)));
		}
		const wrapper = el.closest("label");
		if (wrapper) labels.push(clean(wrapper.textContent));
		return [...new Set(labels.filter(Boolean))];
	};
	const roleOf = (el) => {
		const explicit = el.getAttribute("role");
		if (explicit) return explicit;
		const tag = el.tagName.toLowerCase();
		const type = (el.getAttribute("type") || "").toLowerCase();
		if (tag === "button") return "button";
		if (tag === "a" && el.hasAttribute("href")) return "link";
		if (tag === "select") return "combobox";
		if (tag === "textarea") return "textbox";
		if (tag === "form" && el.getAttribute("role") === "search") return "search";
		if (tag === "input") {
			if (["button", "submit", "reset"].includes(type)) return "button";
			if (type === "checkbox") return "checkbox";
			if (type === "radio") return "radio";
			if (type === "search") return "searchbox";
			if (!["hidden", "file"].includes(type)) return "textbox";
		}
		return null;
	};
	const nameOf = (el, role) => {
		const label = labelsOf(el)[0];
		const explicitName = clean(
			el.getAttribute("aria-label") ||
			labelledBy(el) ||
			label ||
			el.getAttribute("alt") ||
			el.getAttribute("title") ||
			el.getAttribute("placeholder") ||
			(el.tagName === "INPUT" ? el.getAttribute("value") : ""),
		);
		if (explicitName) return explicitName;
		if (["search", "navigation", "main", "complementary", "region", "dialog"].includes(role)) return "";
		return textOf(el);
	};
	const actionSelector = (kind, value, name) => name ? `${kind}=${value}[name=${quote(name)}]` : `${kind}=${value}`;
	const cssLocator = (el) => el.id ? `page.locator('#${cssEscape(el.id)}')` : null;
	const locatorFor = (el, role, name) => {
		const labels = labelsOf(el);
		if (role && name) return { playwright: `page.getByRole(${quote(role)}, { name: ${quote(name)} })`, action: actionSelector("role", role, name) };
		if (role) return { playwright: `page.getByRole(${quote(role)})`, action: `role=${role}` };
		if (labels[0]) return { playwright: `page.getByLabel(${quote(labels[0])})`, action: `label=${quote(labels[0])}` };
		if (el.getAttribute("placeholder")) return { playwright: `page.getByPlaceholder(${quote(el.getAttribute("placeholder"))})`, action: `placeholder=${quote(el.getAttribute("placeholder"))}` };
		const text = textOf(el);
		if (text) return { playwright: `page.getByText(${quote(text.slice(0, 80))})`, action: `text=${quote(text.slice(0, 80))}` };
		return { playwright: cssLocator(el), action: el.id ? `css=#${cssEscape(el.id)}` : null };
	};

	const selector = [
		"button",
		"a[href]",
		"input:not([type='hidden'])",
		"textarea",
		"select",
		"form[role]",
		"[role]",
		"[aria-label]",
		"[placeholder]",
	].join(",");

	const seen = new Set();
	const candidates = [];
	for (const el of Array.from(document.querySelectorAll(selector))) {
		if (!isVisible(el)) continue;
		const role = roleOf(el);
		const name = nameOf(el, role);
		const text = textOf(el);
		const haystack = `${role || ""} ${name} ${text} ${el.id || ""}`.toLowerCase();
		if (roleFilter && role !== roleFilter) continue;
		if (textFilter && !haystack.includes(textFilter)) continue;
		const locator = locatorFor(el, role, name);
		if (!locator.playwright || seen.has(locator.playwright)) continue;
		seen.add(locator.playwright);
		candidates.push({
			tag: el.tagName.toLowerCase(),
			role,
			name: name || null,
			text: text ? text.slice(0, 120) : null,
			id: el.id || null,
			playwright: locator.playwright,
			action: locator.action,
			cssFallback: cssLocator(el),
		});
		if (candidates.length >= limit) break;
	}

	return {
		url: location.href,
		title: document.title,
		count: candidates.length,
		candidates,
	};
}, { roleFilter, textFilter, limit });

if (json) {
	console.log(JSON.stringify(result, null, 2));
} else {
	console.log(`URL: ${result.url}`);
	console.log(`Title: ${result.title}`);
	console.log(`Locators: ${result.count}`);
	for (const [index, candidate] of result.candidates.entries()) {
		console.log("");
		console.log(`${index + 1}. ${candidate.playwright}`);
		console.log(`   tag: ${candidate.tag}${candidate.role ? `, role: ${candidate.role}` : ""}${candidate.name ? `, name: ${candidate.name}` : ""}`);
		if (candidate.action) console.log(`   action: ${candidate.action}`);
		if (candidate.cssFallback && candidate.cssFallback !== candidate.playwright) console.log(`   fallback: ${candidate.cssFallback}`);
	}
}

await b.disconnect();
