#!/usr/bin/env node

import puppeteer from "puppeteer-core";

const args = process.argv.slice(2);
const json = args.includes("--json");
const reload = args.includes("--reload");
const errorsOnly = args.includes("--errors-only");
const duration = Number(valueAfter("--duration") || 10000);
const filter = valueAfter("--filter");
const slowMs = Number(valueAfter("--slow") || 1000);

if (args.includes("--help")) {
	console.log("Usage: browser-network.js [--duration <ms>] [--reload] [--filter <text>] [--errors-only] [--slow <ms>] [--json]");
	console.log("\nCaptures network activity from the active tab.");
	console.log("\nExamples:");
	console.log("  browser-network.js --duration 10000");
	console.log('  browser-network.js --reload --filter "/api/"');
	console.log("  browser-network.js --errors-only --json");
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

const byRequest = new Map();
const entries = [];

p.on("request", (request) => {
	const entry = {
		method: request.method(),
		url: request.url(),
		type: request.resourceType(),
		startTime: Date.now(),
		status: null,
		durationMs: null,
		failed: false,
		error: null,
	};
	byRequest.set(request, entry);
	entries.push(entry);
});

p.on("response", (response) => {
	const entry = byRequest.get(response.request());
	if (!entry) return;
	entry.status = response.status();
	entry.durationMs = Date.now() - entry.startTime;
});

p.on("requestfinished", (request) => {
	const entry = byRequest.get(request);
	if (!entry) return;
	entry.durationMs = Date.now() - entry.startTime;
});

p.on("requestfailed", (request) => {
	const entry = byRequest.get(request);
	if (!entry) return;
	entry.failed = true;
	entry.error = request.failure()?.errorText || "unknown";
	entry.durationMs = Date.now() - entry.startTime;
});

if (reload) {
	await p.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
}

await new Promise((resolve) => setTimeout(resolve, duration));

let visibleEntries = entries.map(({ startTime, ...entry }) => entry);
if (filter) visibleEntries = visibleEntries.filter((entry) => entry.url.includes(filter));
if (errorsOnly) visibleEntries = visibleEntries.filter((entry) => entry.failed || entry.status >= 400);

const failures = visibleEntries.filter((entry) => entry.failed);
const httpErrors = visibleEntries.filter((entry) => entry.status >= 400);
const slow = visibleEntries
	.filter((entry) => entry.durationMs >= slowMs)
	.sort((a, b) => b.durationMs - a.durationMs)
	.slice(0, 20);
const byType = visibleEntries.reduce((acc, entry) => {
	acc[entry.type] = (acc[entry.type] || 0) + 1;
	return acc;
}, {});

const result = {
	url: p.url(),
	title: await p.title(),
	durationMs: duration,
	filter,
	requestCount: visibleEntries.length,
	failureCount: failures.length,
	httpErrorCount: httpErrors.length,
	slowCount: slow.length,
	byType,
	failures,
	httpErrors,
	slow,
	requests: errorsOnly ? visibleEntries : visibleEntries.slice(0, 100),
};

if (json) {
	console.log(JSON.stringify(result, null, 2));
} else {
	console.log(`URL: ${result.url}`);
	console.log(`Title: ${result.title}`);
	console.log(`Duration: ${duration}ms`);
	if (filter) console.log(`Filter: ${filter}`);
	console.log(`Requests: ${result.requestCount}`);
	console.log(`Failures: ${result.failureCount}`);
	console.log(`HTTP errors: ${result.httpErrorCount}`);
	console.log(`Slow requests >= ${slowMs}ms: ${result.slowCount}`);
	console.log(`By type: ${JSON.stringify(byType)}`);

	if (failures.length) {
		console.log("\nFailures:");
		for (const entry of failures.slice(0, 20)) console.log(`  ${entry.method} ${entry.url} - ${entry.error}`);
	}
	if (httpErrors.length) {
		console.log("\nHTTP errors:");
		for (const entry of httpErrors.slice(0, 20)) console.log(`  ${entry.status} ${entry.method} ${entry.url}`);
	}
	if (slow.length) {
		console.log("\nSlow requests:");
		for (const entry of slow) console.log(`  ${entry.durationMs}ms ${entry.method} ${entry.url}`);
	}
}

await b.disconnect();
