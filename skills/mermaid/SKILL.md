---
name: mermaid
description: Render Mermaid diagram source (.mmd) files to PNG, SVG, or PDF using mermaid-cli. Use when the user asks for a diagram, flowchart, sequence diagram, or any visual output from Mermaid syntax. Always write a .mmd source file first, then render to the requested format. Default output is PNG.
allowed-tools: Bash(npx -p @mermaid-js/mermaid-cli mmdc*)
---

# Mermaid Diagram Renderer

Uses `@mermaid-js/mermaid-cli` via npx. No installation required — npx handles it automatically.

## Workflow

1. Write a `.mmd` file with the Mermaid syntax (use Write tool)
2. Run `mmdc` to render to PNG/SVG/PDF
3. Show the user the output file path

## Core Command

```bash
npx -p @mermaid-js/mermaid-cli mmdc -i diagram.mmd -o diagram.png
```

## Flags

| Flag | Description | Default |
|------|-------------|---------|
| `-i <file>` | Input `.mmd` file (required) | — |
| `-o <file>` | Output file (`.png`, `.svg`, `.pdf`) | input + `.svg` |
| `-t <theme>` | Theme: `default`, `forest`, `dark`, `neutral` | `default` |
| `-b <color>` | Background color: `white`, `transparent`, `'#F0F0F0'` | `white` |
| `-w <px>` | Page width in pixels | `800` |
| `-H <px>` | Page height in pixels | `600` |
| `-s <factor>` | Puppeteer scale factor (increase for higher-res PNG) | `1` |
| `-c <file>` | JSON config file for mermaid renderer | — |
| `-q` | Quiet mode (suppress log output) | — |
| `-f` | Scale PDF to fit chart (PDF only) | — |

## Common Examples

### PNG (default, good for Slack/docs)
```bash
npx -p @mermaid-js/mermaid-cli mmdc -i diagram.mmd -o diagram.png -t default -b white -w 1200 -q
```

### High-res PNG
```bash
npx -p @mermaid-js/mermaid-cli mmdc -i diagram.mmd -o diagram.png -w 1600 -s 2 -q
```

### SVG (scalable, good for web)
```bash
npx -p @mermaid-js/mermaid-cli mmdc -i diagram.mmd -o diagram.svg -b transparent -q
```

### Dark theme
```bash
npx -p @mermaid-js/mermaid-cli mmdc -i diagram.mmd -o diagram.png -t dark -b '#1e1e1e' -q
```

### PDF
```bash
npx -p @mermaid-js/mermaid-cli mmdc -i diagram.mmd -o diagram.pdf -f -q
```

### From Markdown (extracts all mermaid blocks)
```bash
npx -p @mermaid-js/mermaid-cli mmdc -i README.md -o README.md -q
```

## Supported Diagram Types

- `flowchart` / `graph` — LR, TD, RL, BT directions
- `sequenceDiagram`
- `classDiagram`
- `stateDiagram-v2`
- `erDiagram`
- `gantt`
- `pie`
- `gitGraph`
- `mindmap`

## Notes

- First run downloads Puppeteer/Chromium (~300MB) — subsequent runs are fast
- Output path must end in `.png`, `.svg`, or `.pdf` — extension determines format
- For diagrams requested in Slack: use PNG with `-b white`
- For diagrams requested for web embedding: use SVG with `-b transparent`
- Store `.mmd` source files alongside output so diagrams can be re-rendered or edited
