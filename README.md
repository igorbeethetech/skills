# Bee The Tech — Claude Code Skills

> Open-source skills for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Install in seconds, use forever.

Each skill is a self-contained package that teaches Claude how to build specific systems — from knowledge bases to workflow automations. Install one skill or all of them.

<p align="center">
  <img src="https://img.shields.io/badge/Claude_Code-Skills-blueviolet?style=for-the-badge" alt="Claude Code Skills" />
  <img src="https://img.shields.io/badge/Open_Source-MIT-blue?style=for-the-badge" alt="MIT License" />
  <img src="https://img.shields.io/badge/Made_by-Bee_The_Tech-yellow?style=for-the-badge" alt="Bee The Tech" />
</p>

---

## Available Skills

| Skill | Description | Status |
|-------|-------------|--------|
| [**knowledge-base-rag**](skills/knowledge-base-rag/) | Build complete Knowledge Base systems with advanced RAG (contextual chunking, hybrid search, reranking). Supports n8n workflows or application code (TS/Python). | Stable |

> More skills coming soon. See the [Roadmap](#roadmap) below.

---

## Quick Install

Pick the method that fits your setup. All you need is `git`.

### Install a skill for yourself (personal, all projects)

Skills placed in `~/.claude/skills/` are available in every project you open with Claude Code.

**macOS / Linux:**

```bash
git clone https://github.com/igorbeethetech/skills.git /tmp/beethetech-skills && \
  mkdir -p ~/.claude/skills && \
  cp -r /tmp/beethetech-skills/skills/knowledge-base-rag ~/.claude/skills/ && \
  rm -rf /tmp/beethetech-skills
```

**Windows (PowerShell):**

```powershell
git clone https://github.com/igorbeethetech/skills.git $env:TEMP\beethetech-skills
New-Item -ItemType Directory -Force -Path "$HOME\.claude\skills" | Out-Null
Copy-Item -Recurse "$env:TEMP\beethetech-skills\skills\knowledge-base-rag" "$HOME\.claude\skills\knowledge-base-rag"
Remove-Item -Recurse -Force "$env:TEMP\beethetech-skills"
```

> Replace `knowledge-base-rag` with any skill name from the table above.

### Install a skill in your project (shared with team)

Skills placed in `.claude/skills/` inside your repo are loaded automatically for anyone using Claude Code on that project.

**macOS / Linux:**

```bash
git clone https://github.com/igorbeethetech/skills.git /tmp/beethetech-skills && \
  mkdir -p .claude/skills && \
  cp -r /tmp/beethetech-skills/skills/knowledge-base-rag .claude/skills/ && \
  rm -rf /tmp/beethetech-skills
```

**Windows (PowerShell):**

```powershell
git clone https://github.com/igorbeethetech/skills.git $env:TEMP\beethetech-skills
New-Item -ItemType Directory -Force -Path ".claude\skills" | Out-Null
Copy-Item -Recurse "$env:TEMP\beethetech-skills\skills\knowledge-base-rag" ".claude\skills\knowledge-base-rag"
Remove-Item -Recurse -Force "$env:TEMP\beethetech-skills"
```

Then commit the skill to your repo:

```bash
git add .claude/skills/
git commit -m "feat: add knowledge-base-rag skill"
```

### Install all skills at once

**macOS / Linux:**

```bash
git clone https://github.com/igorbeethetech/skills.git /tmp/beethetech-skills && \
  mkdir -p ~/.claude/skills && \
  cp -r /tmp/beethetech-skills/skills/* ~/.claude/skills/ && \
  rm -rf /tmp/beethetech-skills
```

**Windows (PowerShell):**

```powershell
git clone https://github.com/igorbeethetech/skills.git $env:TEMP\beethetech-skills
New-Item -ItemType Directory -Force -Path "$HOME\.claude\skills" | Out-Null
Copy-Item -Recurse "$env:TEMP\beethetech-skills\skills\*" "$HOME\.claude\skills\"
Remove-Item -Recurse -Force "$env:TEMP\beethetech-skills"
```

### Update an installed skill

To get the latest version, just reinstall it — the copy will overwrite the old files.

---

## How It Works

Claude Code automatically reads `SKILL.md` files from these directories:

| Location | Scope | Who sees it |
|----------|-------|-------------|
| `~/.claude/skills/` | Personal | Only you, across all projects |
| `.claude/skills/` (in project) | Project | Anyone using Claude Code on this repo |

Once installed, **no extra configuration is needed**. Claude detects when a skill is relevant based on your prompts and activates it automatically.

---

## Repository Structure

```
skills/
├── README.md                        <- This file
├── LICENSE                          <- MIT License
│
└── skills/
    └── knowledge-base-rag/          <- RAG & Knowledge Base skill
        ├── SKILL.md                     Entry point (Claude reads this)
        ├── README.md                    Skill documentation
        └── references/
            ├── rag-theory.md            RAG concepts & best practices
            ├── sql-schema.md            PostgreSQL + pgvector schema
            ├── workflow-ingestion.md    [n8n] Ingestion workflows
            ├── workflow-rag-query.md    [n8n] Query workflow
            ├── n8n-patterns.md          [n8n] JSON & node patterns
            ├── code-ingestion.md        [Code] Ingestion service (TS/Python)
            ├── code-rag-query.md        [Code] Query service (TS/Python)
            └── code-patterns.md         [Code] Project patterns
```

Each skill is **fully self-contained** in its own folder. No shared dependencies between skills.

---

## Roadmap

Upcoming skills we're working on:

- [ ] **n8n-ai-agent-prompt** — Advanced prompt engineering for n8n AI Agent nodes with security, multi-persona, and tool orchestration
- [ ] **supabase-multi-tenant** — Multi-tenant SaaS architecture with Supabase (RLS, auth, schema design)
- [ ] **n8n-workflow-patterns** — Common n8n patterns: error handling, retry logic, webhook security, rate limiting
- [ ] **api-integration-builder** — Generate API integration code for REST/SOAP/GraphQL services
- [ ] **chatbot-conversation-design** — Design conversation flows with fallback handling, escalation, and analytics

Have an idea for a skill? [Open an issue](https://github.com/igorbeethetech/skills/issues/new) or submit a PR!

---

## Contributing

### Adding a new skill

1. Create a folder under `skills/` with a descriptive name
2. Add a `SKILL.md` with proper YAML frontmatter (`name` and `description`)
3. Add reference files in a `references/` subfolder if needed
4. Add a `README.md` inside the skill folder documenting what it does
5. Update this root `README.md` to list the new skill in the table
6. Submit a PR

### Skill structure template

```
skills/your-skill-name/
├── SKILL.md          <- Required: frontmatter + instructions
├── README.md         <- Recommended: user-facing documentation
└── references/       <- Optional: supporting files
    ├── concept-a.md
    └── concept-b.md
```

### SKILL.md template

```markdown
---
name: your-skill-name
description: >
  A clear description of what this skill does and when Claude should
  use it. Include trigger words and phrases.
---

# Skill Title

Instructions for Claude go here...
```

---

## License

This project is licensed under the [MIT License](LICENSE).

---

<p align="center">
  Built by <a href="https://github.com/igorbeethetech">Bee The Tech</a> ·
  Powering AI with <a href="https://claude.ai">Claude</a>
</p>
