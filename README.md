# 🐝 Bee The Tech — Claude Skills

> A curated collection of Claude Skills for AI automation, RAG systems, and enterprise workflows.

Each skill is a self-contained package that teaches Claude how to build specific systems — from knowledge bases to workflow automations. Install one skill or all of them.

<p align="center">
  <img src="https://img.shields.io/badge/Claude-Skills-blueviolet?style=for-the-badge" alt="Claude Skills" />
  <img src="https://img.shields.io/badge/Open_Source-MIT-blue?style=for-the-badge" alt="MIT License" />
  <img src="https://img.shields.io/badge/Made_by-Bee_The_Tech-yellow?style=for-the-badge" alt="Bee The Tech" />
</p>

---

## 📦 Available Skills

| Skill | Description | Status |
|-------|-------------|--------|
| [**knowledge-base-rag**](skills/knowledge-base-rag/) | Build complete Knowledge Base systems with advanced RAG (contextual chunking, hybrid search, reranking). Supports n8n workflows or application code (TS/Python). | ✅ Stable |

> More skills coming soon. See the [Roadmap](#-roadmap) below.

---

## 🚀 Installation

### Option 1: Install a single skill on Claude.ai

1. Download only the skill folder you want (e.g., `skills/knowledge-base-rag/`)
2. Compress it as a `.zip` file
3. Go to **Settings → Capabilities → Skills → Upload skill**

### Option 2: Install a single skill in Claude Code

```bash
# Personal (available across all projects)
git clone https://github.com/igorbeethetech/claude-skills.git /tmp/claude-skills
cp -r /tmp/claude-skills/skills/knowledge-base-rag ~/.claude/skills/knowledge-base-rag
rm -rf /tmp/claude-skills
```

### Option 3: Install all skills in Claude Code

```bash
# Clone the full repo and point Claude to it
git clone https://github.com/igorbeethetech/claude-skills.git ~/claude-skills

# Then for each project, or globally:
claude --add-dir ~/claude-skills/skills/knowledge-base-rag
# Repeat for each skill you want active
```

### Option 4: Add to your project repository

```bash
# From your project root
mkdir -p .claude/skills

# Copy only the skills you need
cp -r ~/claude-skills/skills/knowledge-base-rag .claude/skills/

git add .claude/skills/
git commit -m "feat: add knowledge-base-rag skill"
```

---

## 📁 Repository Structure

```
claude-skills/
├── README.md                        ← This file
├── LICENSE                          ← MIT License
├── .gitignore
│
└── skills/
    │
    ├── knowledge-base-rag/          ← RAG & Knowledge Base skill
    │   ├── SKILL.md                     Entry point
    │   ├── README.md                    Skill documentation
    │   └── references/
    │       ├── rag-theory.md            RAG concepts & best practices
    │       ├── sql-schema.md            PostgreSQL + pgvector schema
    │       ├── workflow-ingestion.md    [n8n] Ingestion workflows
    │       ├── workflow-rag-query.md    [n8n] Query workflow
    │       ├── n8n-patterns.md          [n8n] JSON & node patterns
    │       ├── code-ingestion.md        [Code] Ingestion service (TS/Python)
    │       ├── code-rag-query.md        [Code] Query service (TS/Python)
    │       └── code-patterns.md         [Code] Project patterns
    │
    └── (future skills go here)
```

Each skill is **fully self-contained** in its own folder. No shared dependencies between skills.

---

## 🗺️ Roadmap

Upcoming skills we're working on:

- [ ] **n8n-ai-agent-prompt** — Advanced prompt engineering for n8n AI Agent nodes with security, multi-persona, and tool orchestration
- [ ] **supabase-multi-tenant** — Multi-tenant SaaS architecture with Supabase (RLS, auth, schema design)
- [ ] **n8n-workflow-patterns** — Common n8n patterns: error handling, retry logic, webhook security, rate limiting
- [ ] **api-integration-builder** — Generate API integration code for REST/SOAP/GraphQL services
- [ ] **chatbot-conversation-design** — Design conversation flows with fallback handling, escalation, and analytics

Have an idea for a skill? [Open an issue](../../issues/new) or submit a PR!

---

## 🤝 Contributing

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
├── SKILL.md          ← Required: frontmatter + instructions
├── README.md         ← Recommended: user-facing documentation
└── references/       ← Optional: supporting files
    ├── concept-a.md
    └── concept-b.md
```

### SKILL.md template

```markdown
---
name: your-skill-name
description: >
  A clear description of what this skill does and when Claude should
  use it. Include trigger words and phrases. Max 200 characters for
  the description field.
---

# Skill Title

Instructions for Claude go here...
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

<p align="center">
  Built by <a href="https://github.com/igorbeethetech">Bee The Tech</a> · 
  Powering AI with <a href="https://claude.ai">Claude</a>
</p>
