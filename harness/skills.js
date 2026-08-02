// Skills (ch-07).
//
// A skill is a *directory* containing a SKILL.md file with YAML frontmatter
// (name + description) followed by instructions - the agentskills.io format.
// Only the name and description are advertised in the prompt; the model loads
// the full body on demand with the read_file tool (progressive disclosure).
// Skills are not tools - a tool is a capability ("run pytest"), a skill is a
// procedure ("how we cut a release").

import fs from "node:fs";
import path from "node:path";

// Read top-level `key: value` pairs from the leading `---` YAML block.
function parseFrontmatter(text) {
  const lines = text.split("\n");
  if (!lines.length || lines[0].trim() !== "---") return {};
  const meta = {};
  for (const line of lines.slice(1)) {
    if (line.trim() === "---") break;
    // only top-level keys (skip nested/indented lines like a metadata map)
    if (line.includes(":") && !/^[ \t]/.test(line)) {
      const idx = line.indexOf(":");
      meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  }
  return meta;
}

// Load skills from `<directory>/<name>/SKILL.md` (agentskills.io layout).
export function loadSkills(directory) {
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) return [];
  const names = fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  const skills = [];
  for (const name of names) {
    const skillPath = path.join(directory, name, "SKILL.md");
    if (!fs.existsSync(skillPath)) continue;
    const meta = parseFrontmatter(fs.readFileSync(skillPath, "utf8"));
    skills.push({ name: meta.name ?? name, description: meta.description ?? "", path: skillPath });
  }
  return skills;
}

export function skillsPrompt(skills) {
  if (!skills.length) return "";
  const lines = [
    "You have skills available. When one applies, use the read_file tool to read its file, " +
      "then follow it exactly:",
    ...skills.map((s) => `- ${s.name}: ${s.description} (file: ${s.path})`),
  ];
  return lines.join("\n");
}
