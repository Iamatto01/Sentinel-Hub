---
name: sentinel-recon
description: >-
  Use this skill to research, scan files, check architecture, and distill context
  before invoking large coding models. Ensures high speed and 80-90% token savings
  by reading MEMORY.md and providing only minimal diff slices to the coder.
---

# Sentinel Recon & Token Auto-Distiller Skill

This skill guides the Recon & Research Subagent in exploring the codebase efficiently without loading massive files into the main conversation context.

---

## 1. RECON WORKFLOW

1. **Step 1: Check Living Memory First:**
   * Always check [MEMORY.md](../../MEMORY.md) first to locate the relevant project, its port, its entry point, and its database resolver.
   * Avoid searching the entire disk if the service location is already documented in memory.

2. **Step 2: Targeted File Search:**
   * Use targeted search tools (e.g. `view_file` with precise `StartLine`/`EndLine`, or specific grep patterns) rather than reading 800+ lines of untouched code.

3. **Step 3: Distill Context into Minimal Slices:**
   * Extract only the function definition, interface, or bug site (15 to 40 lines).
   * Format the summary for the Coder model:
     * **File:** `path/to/file.js`
     * **Lines:** L45-L65
     * **Context:** Function signature and the exact bug/requirement.

4. **Step 4: Update MEMORY.md When New Architecture is Learned:**
   * If a new port, new service, or resolved defect is discovered during recon, add a concise note to `MEMORY.md` so future agent runs know it instantly.
