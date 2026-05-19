# pi-skills

Personal collection of skills for [pi-coding-agent](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent).

This repository is used to source-control and evolve the skills installed locally under:

```bash
~/.pi/agent/skills/pi-skills
```

## Installation

### pi-coding-agent

```bash
# User-level installation
git clone https://github.com/PierrickTassery/pi-skills ~/.pi/agent/skills/pi-skills
```

### Claude Code-compatible layout

Each skill folder contains a `SKILL.md` file directly under the repository root, which makes the skills easy to symlink or copy into other agent skill directories.

## Available skills

| Skill | Description |
|-------|-------------|
| [brave-search](brave-search/SKILL.md) | Web search and content extraction via Brave Search API |
| [browser-tools](browser-tools/README.md) | Interactive browser inspection, diagnostics, and Playwright locator support via Chrome DevTools Protocol |
| [youtube-transcript](youtube-transcript/SKILL.md) | Fetch transcripts from YouTube videos |

## Setup

Some skills require dependencies or environment variables.

### brave-search

```bash
cd brave-search
npm install
export BRAVE_API_KEY="your-api-key"
```

### browser-tools

```bash
cd browser-tools
npm install
./browser-start.js
```

### youtube-transcript

```bash
cd youtube-transcript
npm install
```

## Upstream

Initial skills are based on the public [`badlogic/pi-skills`](https://github.com/badlogic/pi-skills) collection, then maintained here for personal workflow improvements.

## License

MIT
