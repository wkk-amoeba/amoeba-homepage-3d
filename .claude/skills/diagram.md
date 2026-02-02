---
description: "Generate UML diagram using Mermaid.js"
user_invocable: true
command_name: "diagram"
---

# Project UML Generator

This Skill teaches Claude how to perform a deep structural analysis of a codebase and visualize it through an interactive UML diagram hosted in a single HTML file.

## Instructions

When this Skill is activated, follow these steps to generate the documentation:

1. **Project Mapping**:
   * Use `Glob` or `ls -R` to understand the project structure and folder hierarchy.
   * Identify the tech stack (e.g., React, Node.js, Python) to determine how modules interact.

2. **Dependency Analysis**:
   * Use `Grep` or `Read` on configuration files (e.g., `package.json`, `requirements.txt`, `tsconfig.json`) and main entry points.
   * Analyze imports and exports in core files to identify class relationships, inheritance, and data flow.

3. **Mermaid.js Synthesis**:
   * Convert the discovered architecture into Mermaid.js syntax.
   * Use `classDiagram` for object-oriented structures or `graph TD` for modular architectures.
   * Group related components into subgraphs for better readability.

4. **HTML Construction**:
   * Create a boilerplate HTML5 template.
   * Include the Mermaid.js library via a reliable CDN (e.g., `https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js`).
   * Embed the generated Mermaid code within a `<pre class="mermaid">` tag.
   * Add basic CSS to ensure the diagram is centered, responsive, and visually appealing.

5. **Final Output**:
   * Save the entire content into a file named `UML.html` at the project root directory.
   * Confirm to the user once the file has been successfully created.

## Best Practices

* **Clarity over Complexity**: For large projects, do not map every single utility function. Focus on high-level architecture, core business logic, and primary data models.
* **Self-Contained**: Ensure all CSS and JavaScript initialization logic is included within the single `UML.html` file so it is easy to share and view.
* **Logical Grouping**: Use namespaces or directory names as labels for subgraphs to help the user navigate the diagram.

## Safety and Security

* **No Data Exposure**: Ensure that no sensitive information (API keys, hardcoded credentials, or private environment variables) found during analysis is included in the generated UML diagram.
* **Read-Only Analysis**: Only use `Read` tools for analysis. Do not modify existing source code files during the generation process.
