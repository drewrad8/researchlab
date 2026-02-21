# Research Lab

AI-powered research pipeline. Give it a topic, it spawns parallel research workers,
synthesizes findings into a knowledge graph with citations, and serves an interactive
explorer.

## Install

```
git clone https://github.com/drewrad8/researchlab.git
cd researchlab
./install.sh
```

The installer checks prerequisites (Node.js 20+, tmux, curl), detects or offers to install
[Strategos](https://github.com/drewrad8/strategos), and sets up the data directory.

Then start the server:

```
bin/researchlab start
```

Open http://localhost:3700

**Manual setup** (if you already have Strategos running): `npm start`

## Requirements

- Node.js 20+
- [Strategos](https://github.com/drewrad8/strategos)
- tmux
- Claude Code CLI (`npm i -g @anthropic-ai/claude-code`)

## How it works

1. Enter a research topic
2. Planning phase: breaks topic into 5-8 sub-questions
3. Research phase: 3-5 parallel workers investigate sub-questions
4. Synthesis phase: merges findings into a knowledge graph
5. Explore the graph -- click nodes for detail, citations, evidence chains

## Configuration

| Variable | Default | What it does |
|---|---|---|
| RESEARCHLAB_PORT | 3700 | Server port |
| STRATEGOS_URL | http://localhost:38007 | Strategos API URL |

## Data Sources

Register data sources in `~/.researchlab/sources.json` (see `config/sources.example.json`).
Workers automatically match sources to research topics by tag overlap.

## CLI

```
bin/researchlab start    # Start the server (background, PID file)
bin/researchlab stop     # Graceful shutdown
bin/researchlab status   # Show running state + project count
bin/researchlab logs     # Tail log file
bin/researchlab version  # Print version
```

## License

MIT
