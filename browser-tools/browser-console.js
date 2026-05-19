#!/usr/bin/env node

import puppeteer from "puppeteer-core";

const args = process.argv.slice(2);
const json = args.includes("--json");
const reload = args.includes("--reload");
const duration = Number(valueAfter("--duration") || 10000);

if (args.includes("--help")) {
	console.log("Usage: browser-console.js [--duration <ms>] [--reload] [--json]");
	console.log("\nCaptures console messages and page errors from the active tab.");
	console.log("\nExamples:");
	console.log("  browser-console.js --duration 5000");
	console.log("  browser-console.js --reload --json");
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

const messages = [];
const pageErrors = [];

p.on("console", (msg) => {
	messages.push({
		type: msg.type(),
		text: msg.text(),
		location: msg.location(),
	});
});

p.on("pageerror", (error) => {
	pageErrors.push(error.message);
});

if (reload) {
	await p.reload({ waitUntil: "domcontentloaded" }).catch((error) => {
		pageErrors.push(`Reload failed: ${error.message}`);
	});
}

await new Promise((resolve) => setTimeout(resolve, duration));

const result = {
	url: p.url(),
	title: await p.title(),
	durationMs: duration,
	messageCount: messages.length,
	pageErrorCount: pageErrors.length,
	messages,
	pageErrors,
};

if (json) {
	console.log(JSON.stringify(result, null, 2));
} else {
	console.log(`URL: ${result.url}`);
	console.log(`Title: ${result.title}`);
	console.log(`Duration: ${duration}ms`);
	console.log(`Console messages: ${messages.length}`);
	console.log(`Page errors: ${pageErrors.length}`);
	for (const message of messages) {
		const location = message.location?.url ? ` (${message.location.url}:${message.location.lineNumber || 0})` : "";
		console.log(`[${message.type}] ${message.text}${location}`);
	}
	for (const error of pageErrors) {
		console.log(`[pageerror] ${error}`);
	}
}

await b.disconnect();
