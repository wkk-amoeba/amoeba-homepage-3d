---
description: "Generate UML documentation for the project"
user_invocable: true
command_name: "uml"
---

# Project UML Web Document Generator

## Goal

Create a single standalone HTML file named **UML.html** in the **project root folder**. This file must contain everything it needs (all CSS, JavaScript, and diagram assets embedded inline) and present UML-style visualizations and summaries of the project.

This Skill is for *analysis and documentation*. It must not execute project code.

## Safety and security requirements

1. **No code execution**
   Do not run, import, compile, or execute any project files. Do not start servers. Do not run build steps, tests, package scripts, or tooling inside the project.

2. **No network access / external dependencies**
   The generated UML.html must not reference remote scripts, stylesheets, images, fonts, CDNs, or external APIs. Everything must be embedded in the single file.

3. **Do not expose secrets**
   Never copy or display sensitive material (API keys, tokens, credentials, private URLs, customer data). If discovered in files, exclude it and note that secrets were redacted.

4. **Minimize data collection**
   Prefer structural extraction (names, relationships, signatures) over copying bodies of code. Avoid quoting large blocks of code. Use short excerpts only when absolutely necessary for clarity and keep them minimal.

5. **Respect ignore patterns and size limits**
   Skip large and generated folders such as: node_modules, dist, build, out, coverage, .next, .nuxt, .cache, vendor, target, bin, obj, **pycache**, .venv, venv, .tox, .git.
   If the repository is very large, sample representative modules and document the sampling approach in UML.html.

## Inputs and scope discovery

1. **Confirm root**
   Treat the current working directory as the project root unless the user specifies otherwise.

2. **Inventory files safely**
   Use file listing/search to identify:

   * Primary languages/frameworks (based on extensions and key files)
   * Entry points (common main/app files, server startup files, CLI entrypoints)
   * Module boundaries (packages, services, layers, apps, libraries)
   * Dependency metadata (e.g., package manifests, module descriptors)

3. **Select an analysis subset when needed**
   If the project is large, prioritize:

   * Top-level apps/services
   * Public API layers (controllers/routes/handlers)
   * Core domain modules
   * Shared libraries/utilities
   * Data access layers

## What UML.html must contain

UML.html must be a readable, navigable documentation page with the following sections (omit only if not applicable and explain why):

1. **Project Overview**

   * Project name (derived from repository folder or manifest)
   * Detected language(s), framework(s), build system(s)
   * High-level description of what the project appears to do (inferred from README and structure)
   * A clear note: "Static analysis only; no code was executed."

2. **Repository Map**

   * A tree-style summary of major directories (depth-limited)
   * A "Key Files" list (README, configs, manifests) without exposing sensitive content

3. **Architecture Diagram (UML-style)**

   * A component/package-style diagram showing major subsystems and their dependencies
   * Indicate direction of dependencies and coupling hotspots

4. **Module/Package Diagrams**

   * For each major subsystem, show its internal packages/modules and their relationships
   * Highlight public interfaces (exported modules, API surfaces) when detectable

5. **Class/Type Diagram (Best-effort)**

   * For OOP or typed projects: key classes/types, inheritance/implementation, associations
   * For functional projects: key data types and module-level relationships
   * Keep it representative: focus on important domain entities and service interfaces

6. **Call Flow / Sequence (Best-effort)**

   * At least one end-to-end flow for a primary user action or request lifecycle
   * Example patterns: request → controller/handler → service → repository → database
   * If uncertain, label assumptions explicitly

7. **Dependencies and Integrations**

   * External services (databases, queues, caches, third-party APIs) inferred from configuration and clients
   * Major third-party libraries (top dependencies) summarized at a high level
   * Environment/configuration overview without secret values

8. **Quality Notes and Risks**

   * Complexity hotspots (very large modules, excessive dependencies, cyclic references)
   * Potential architecture smells (tight coupling, God modules, circular imports)
   * Suggested next steps (tests, refactors, diagram improvements)

## Diagram rendering requirements (single-file, offline)

1. **Self-contained visuals**

   * All diagrams must render without fetching anything from the internet.
   * Use inline rendering assets embedded within UML.html.

2. **Readable and interactive**
   UML.html must include:

   * A left sidebar or top navigation with section links
   * Search/filter for entities (modules/classes/components) within the page
   * Collapsible panels for large diagrams or long lists
   * A legend explaining diagram notation

3. **Accessibility**

   * Provide text alternatives: each diagram must have a short textual summary under it.
   * Use clear headings and consistent typography.

## Relationship extraction guidance (static analysis heuristics)

Apply language-appropriate heuristics without executing code:

* **Imports/Includes/Requires**: treat as dependency edges between modules/packages.
* **Routing/Endpoints**: detect route definitions and map to handlers/controllers.
* **Classes/Interfaces/Types**: identify key entities and relationships:

  * Inheritance/implements
  * Composition (fields holding other types)
  * Associations (method parameters/returns referencing other types)
* **Layer detection**: infer layers by folder names and conventions (e.g., controller/service/repository, ui/domain/data).
* **Entry points**: infer application startup path from typical files and manifests.

When uncertain, explicitly label:

* "Inferred"
* "Likely"
* "Unconfirmed"
  and explain the basis for the inference.

## Output instructions

1. **Create/overwrite UML.html**

   * Write UML.html into the project root.
   * If UML.html already exists, replace it entirely (do not append), unless the user explicitly requests preservation.

2. **Keep it single-file**

   * Do not create additional files, images, or directories.
   * Do not require a local web server; opening the file in a browser must work.

3. **No embedded sensitive content**

   * Do not embed raw configuration values, secrets, or large source code blocks.
   * Prefer names and structural metadata.

4. **Include an "Analysis Metadata" footer**

   * Date/time of generation
   * Scope notes (what was excluded and why)
   * Any assumptions or limitations encountered

## Completion checklist

Before finishing, verify:

* UML.html exists in the project root.
* The page renders offline with no external references.
* Diagrams are present and accompanied by textual summaries.
* No secrets or large code blocks are included.
* Excluded directories and sampling decisions are documented.
* Uncertainties are clearly labeled as inferences.
