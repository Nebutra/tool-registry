# @nebutra/tool-registry

Public mirror for [@nebutra/tool-registry](https://www.npmjs.com/package/%40nebutra%2Ftool-registry) from [Nebutra/Nebutra-Sailor](https://github.com/Nebutra/Nebutra-Sailor/tree/main/packages/ai/tool-registry).

This repository is generated from the Nebutra Sailor monorepo. Package releases are cut from the monorepo and mirrored here for discovery, standalone cloning, and contribution intake.

- Canonical source: `packages/ai/tool-registry` in `Nebutra/Nebutra-Sailor`
- Package registry: npm and GitHub Packages
- Contributions: open issues or PRs here; maintainers port accepted changes back into the monorepo source package

---
SKILL.md registry with progressive disclosure and content-store backing.

This package parses, stores, indexes, lists, loads, and validates agent skill
documents. It is the package-level primitive behind Nebutra's tool and skill
surface, not a UI or model-runtime package.

## Installation

```bash
pnpm add @nebutra/tool-registry
```

## Usage

```ts
import { ToolRegistry } from "@nebutra/tool-registry";

const registry = await ToolRegistry.open(".nebutra/tools", {
  tenantId: "org_123",
});

await registry.writeSkill(
  "summarize_docs",
  [
    "---",
    "name: summarize_docs",
    "description: Summarize documentation files",
    "version: 1.0.0",
    "allowed_tools: []",
    "mcp_servers: []",
    "---",
    "",
    "## What this skill does",
    "",
    "Reads docs and returns a concise summary.",
  ].join("\n"),
);

const skills = await registry.list();
const skill = await registry.load("summarize_docs");
```

## API

| Export | Description |
| --- | --- |
| `ToolRegistry.open(root, options)` | Open a content-backed registry and reindex existing skills |
| `registry.writeSkill(name, markdown)` | Persist and index a `SKILL.md` document |
| `registry.newSkill(name)` | Create a starter skill document |
| `registry.reload()` | Reindex the skill directory |
| `registry.list()` | Return sorted skill metadata |
| `registry.load(name)` | Load one skill body and metadata |
| `registry.test(name)` | Run structural checks against a skill |
| `parseSkillFrontmatter(markdown)` | Parse required YAML frontmatter |
| `parseSkillMarkdown(markdown)` | Parse and validate a complete skill document |
| `readSkillDebug(limit)` | Read debug events for registry operations |

## Skill Metadata

Required frontmatter:

```yaml
---
name: summarize_docs
description: Summarize documentation files
version: 1.0.0
allowed_tools: []
mcp_servers: []
---
```

Optional fields include `inputs`, `outputs`, and `budget`.

## License

MIT
