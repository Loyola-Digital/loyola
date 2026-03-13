#!/usr/bin/env python3
"""
Validate Squad Structure - Worker Script (Deterministic)

Validates the video-creation squad directory structure, YAML syntax,
agent architecture, and cross-references between components.

Phases:
- Phase 0: Type Detection (scan config, count agents, check patterns)
- Phase 1: Structure Validation (files exist, YAML valid, required fields)
- Phase 2: Agent Architecture Validation (level_0 through level_5 sections)
- Phase 3: Cross-Reference Validation (workflows <-> agents/tasks)

Usage:
    python scripts/validate-squad-structure.py
    python scripts/validate-squad-structure.py --output json
    python scripts/validate-squad-structure.py --verbose

Pattern: EXEC-W-001 (Worker - Deterministic)
"""

import os
import sys
import json
import re
import argparse
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any, Optional, Tuple

try:
    import yaml
except ImportError:
    print("ERROR: PyYAML is required. Install with: pip install pyyaml")
    sys.exit(2)


# ============================================================================
# CONFIGURATION
# ============================================================================

SQUAD_NAME = "video-creation"

REQUIRED_DIRS = [
    "agents",
    "tasks",
    "workflows",
    "templates",
    "checklists",
    "data",
]

RECOMMENDED_DIRS = [
    "config",
    "docs",
    "scripts",
    "utils",
]

REQUIRED_FILES = [
    "config.yaml",
    "README.md",
]

REQUIRED_CONFIG_FIELDS = [
    "name",
    "version",
    "description",
]

AGENT_REQUIRED_LEVELS = [
    "level_0",
    "level_1",
    "level_2",
    "level_3",
    "level_4",
    "level_5",
]

SECURITY_PATTERNS = {
    "api_key": r"(api[_-]?key|apikey)\s*[:=]\s*['\"][^'\"\$\{]{8,}",
    "secret": r"(secret|password)\s*[:=]\s*['\"][^'\"\$\{]{8,}",
    "aws_key": r"AKIA[A-Z0-9]{16}",
    "private_key": r"-----BEGIN.*(PRIVATE|RSA|DSA|EC).*KEY-----",
    "db_url": r"(postgres|mysql|mongodb|redis)://[^:]+:[^@]+@",
}


# ============================================================================
# UTILITIES
# ============================================================================

def find_squad_root() -> Path:
    """Find the video-creation squad directory."""
    # From scripts/ directory inside the squad
    script_dir = Path(__file__).parent
    candidate = script_dir.parent
    if candidate.name == SQUAD_NAME and (candidate / "config.yaml").exists():
        return candidate

    # From squads/ directory
    if (candidate.parent / SQUAD_NAME).exists():
        return candidate.parent / SQUAD_NAME

    # From cwd
    cwd = Path.cwd()
    if cwd.name == SQUAD_NAME:
        return cwd
    if (cwd / SQUAD_NAME).exists():
        return cwd / SQUAD_NAME
    if (cwd / "squads" / SQUAD_NAME).exists():
        return cwd / "squads" / SQUAD_NAME

    raise FileNotFoundError(
        f"Could not find {SQUAD_NAME}/ squad directory. "
        f"Run from within the squad or provide the correct path."
    )


def count_files(directory: Path, patterns: Optional[List[str]] = None) -> int:
    """Count files matching patterns in a directory."""
    if patterns is None:
        patterns = ["*.md", "*.yaml", "*.yml"]
    if not directory.exists():
        return 0
    count = 0
    for pattern in patterns:
        count += len(list(directory.glob(pattern)))
    return count


def read_yaml_safe(file_path: Path) -> Tuple[Optional[Dict], Optional[str]]:
    """Read and parse a YAML file. Returns (data, error_message)."""
    if not file_path.exists():
        return None, f"File not found: {file_path.name}"
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
        return data, None
    except yaml.YAMLError as e:
        return None, f"YAML syntax error in {file_path.name}: {e}"
    except Exception as e:
        return None, f"Error reading {file_path.name}: {e}"


def read_file_text(file_path: Path) -> Optional[str]:
    """Read file contents as text."""
    if not file_path.exists():
        return None
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception:
        return None


def grep_in_file(file_path: Path, pattern: str) -> List[str]:
    """Search for regex pattern in a file."""
    content = read_file_text(file_path)
    if content is None:
        return []
    return re.findall(pattern, content, re.MULTILINE | re.IGNORECASE)


# ============================================================================
# PHASE 0: TYPE DETECTION
# ============================================================================

def detect_squad_type(squad_path: Path) -> Dict[str, Any]:
    """Detect squad type: expert, pipeline, or hybrid."""
    result: Dict[str, Any] = {
        "detected_type": "pipeline",
        "confidence": 0,
        "signals": {},
        "scoring": {"expert": 0, "pipeline": 0, "hybrid": 0},
    }

    agents_dir = squad_path / "agents"
    tasks_dir = squad_path / "tasks"
    workflows_dir = squad_path / "workflows"

    agent_count = count_files(agents_dir, ["*.md"])
    task_count = count_files(tasks_dir, ["*.md"])
    workflow_count = count_files(workflows_dir, ["*.yaml", "*.yml", "*.md"])

    result["signals"]["agent_count"] = agent_count
    result["signals"]["task_count"] = task_count
    result["signals"]["workflow_count"] = workflow_count

    # Pipeline signals: workflows + multi-agent + phases
    if workflow_count > 0:
        result["scoring"]["pipeline"] += 3
    if agent_count >= 3:
        result["scoring"]["pipeline"] += 2
    if task_count >= 3:
        result["scoring"]["pipeline"] += 1

    # Check for phase patterns in workflows
    phase_refs = 0
    if workflows_dir.exists():
        for wf_file in workflows_dir.glob("*.yaml"):
            content = read_file_text(wf_file)
            if content and re.search(r"phase[_\s]*\d", content, re.IGNORECASE):
                phase_refs += 1
    result["signals"]["phase_pattern_files"] = phase_refs
    if phase_refs > 0:
        result["scoring"]["pipeline"] += 2

    # Expert signals: voice_dna, few agents
    voice_dna_count = 0
    if agents_dir.exists():
        for agent_file in agents_dir.glob("*.md"):
            content = read_file_text(agent_file)
            if content and ("voice_dna:" in content or "Voice DNA" in content):
                voice_dna_count += 1
    result["signals"]["voice_dna_count"] = voice_dna_count
    if voice_dna_count > 0:
        result["scoring"]["expert"] += 3

    # Hybrid signals: human/manual references
    human_refs = 0
    for md_file in squad_path.rglob("*.md"):
        content = read_file_text(md_file)
        if content and re.search(r"human.*review|manual.*step|executor.*type", content, re.IGNORECASE):
            human_refs += 1
    result["signals"]["human_refs"] = human_refs
    if human_refs > 2:
        result["scoring"]["hybrid"] += 3

    # Determine winner
    max_score = max(result["scoring"].values())
    if result["scoring"]["pipeline"] == max_score and max_score >= 4:
        result["detected_type"] = "pipeline"
        result["confidence"] = min(result["scoring"]["pipeline"], 10)
    elif result["scoring"]["expert"] == max_score and max_score >= 4:
        result["detected_type"] = "expert"
        result["confidence"] = min(result["scoring"]["expert"], 10)
    elif result["scoring"]["hybrid"] >= 3:
        result["detected_type"] = "hybrid"
        result["confidence"] = min(result["scoring"]["hybrid"], 10)
    else:
        result["detected_type"] = "general"
        result["confidence"] = 5

    return result


# ============================================================================
# PHASE 1: STRUCTURE VALIDATION
# ============================================================================

def validate_structure(squad_path: Path) -> Dict[str, Any]:
    """Validate squad directory structure and file presence."""
    result: Dict[str, Any] = {
        "passed": True,
        "checks": [],
        "blocking_issues": [],
        "warnings": [],
    }

    # --- Check required directories ---
    for dir_name in REQUIRED_DIRS:
        dir_path = squad_path / dir_name
        if dir_path.exists() and dir_path.is_dir():
            file_count = count_files(dir_path)
            result["checks"].append({
                "id": f"T1-DIR-{dir_name}",
                "status": "pass",
                "message": f"Directory '{dir_name}/' exists ({file_count} files)",
            })
        else:
            result["checks"].append({
                "id": f"T1-DIR-{dir_name}",
                "status": "fail",
                "message": f"Required directory '{dir_name}/' not found",
            })
            result["blocking_issues"].append(f"Missing required directory: {dir_name}/")
            result["passed"] = False

    # --- Check recommended directories ---
    for dir_name in RECOMMENDED_DIRS:
        dir_path = squad_path / dir_name
        if dir_path.exists() and dir_path.is_dir():
            result["checks"].append({
                "id": f"T1-RDIR-{dir_name}",
                "status": "pass",
                "message": f"Recommended directory '{dir_name}/' exists",
            })
        else:
            result["checks"].append({
                "id": f"T1-RDIR-{dir_name}",
                "status": "warn",
                "message": f"Recommended directory '{dir_name}/' not found",
            })
            result["warnings"].append(f"Missing recommended directory: {dir_name}/")

    # --- Check required files ---
    for file_name in REQUIRED_FILES:
        file_path = squad_path / file_name
        if file_path.exists():
            result["checks"].append({
                "id": f"T1-FILE-{file_name}",
                "status": "pass",
                "message": f"Required file '{file_name}' exists",
            })
        else:
            result["checks"].append({
                "id": f"T1-FILE-{file_name}",
                "status": "fail",
                "message": f"Required file '{file_name}' not found",
            })
            result["blocking_issues"].append(f"Missing required file: {file_name}")
            result["passed"] = False

    # --- Validate config.yaml syntax and fields ---
    config_path = squad_path / "config.yaml"
    config_data, config_error = read_yaml_safe(config_path)

    if config_error:
        result["checks"].append({
            "id": "T1-CFG-YAML",
            "status": "fail",
            "message": config_error,
        })
        result["blocking_issues"].append(config_error)
        result["passed"] = False
    elif config_data:
        result["checks"].append({
            "id": "T1-CFG-YAML",
            "status": "pass",
            "message": "config.yaml has valid YAML syntax",
        })

        for field in REQUIRED_CONFIG_FIELDS:
            if field in config_data:
                result["checks"].append({
                    "id": f"T1-CFG-{field}",
                    "status": "pass",
                    "message": f"config.yaml has '{field}' field",
                })
            else:
                result["checks"].append({
                    "id": f"T1-CFG-{field}",
                    "status": "fail",
                    "message": f"config.yaml missing required field: '{field}'",
                })
                result["blocking_issues"].append(f"config.yaml missing field: {field}")
                result["passed"] = False

    # --- Validate all workflow YAML files ---
    workflows_dir = squad_path / "workflows"
    if workflows_dir.exists():
        for wf_file in sorted(workflows_dir.glob("*.yaml")):
            wf_data, wf_error = read_yaml_safe(wf_file)
            if wf_error:
                result["checks"].append({
                    "id": f"T1-WF-{wf_file.stem}",
                    "status": "fail",
                    "message": f"Workflow YAML error: {wf_error}",
                })
                result["blocking_issues"].append(f"Invalid workflow YAML: {wf_file.name}")
                result["passed"] = False
            else:
                result["checks"].append({
                    "id": f"T1-WF-{wf_file.stem}",
                    "status": "pass",
                    "message": f"Workflow '{wf_file.name}' has valid YAML",
                })

    # --- Validate template YAML files ---
    templates_dir = squad_path / "templates"
    if templates_dir.exists():
        for tmpl_file in sorted(templates_dir.glob("*.yaml")):
            tmpl_data, tmpl_error = read_yaml_safe(tmpl_file)
            if tmpl_error:
                result["checks"].append({
                    "id": f"T1-TMPL-{tmpl_file.stem}",
                    "status": "warn",
                    "message": f"Template YAML warning: {tmpl_error}",
                })
                result["warnings"].append(f"Template YAML issue: {tmpl_file.name}")
            else:
                result["checks"].append({
                    "id": f"T1-TMPL-{tmpl_file.stem}",
                    "status": "pass",
                    "message": f"Template '{tmpl_file.name}' has valid YAML",
                })

    # --- Security scan ---
    security_issues: List[Dict[str, Any]] = []
    for pattern_name, pattern in SECURITY_PATTERNS.items():
        for file_path in squad_path.rglob("*"):
            if not file_path.is_file():
                continue
            if file_path.suffix not in (".md", ".yaml", ".yml", ".txt", ".json"):
                continue
            matches = grep_in_file(file_path, pattern)
            if matches:
                real_matches = [
                    m for m in matches
                    if not any(
                        x in str(m).lower()
                        for x in ["example", "placeholder", "your-", "xxx", "{{", "${"]
                    )
                ]
                if real_matches:
                    security_issues.append({
                        "pattern": pattern_name,
                        "file": str(file_path.relative_to(squad_path)),
                        "count": len(real_matches),
                    })

    if security_issues:
        result["checks"].append({
            "id": "T1-SEC-001",
            "status": "fail",
            "message": f"Found {len(security_issues)} potential security issues",
        })
        for issue in security_issues:
            result["blocking_issues"].append(
                f"Security: {issue['pattern']} in {issue['file']}"
            )
        result["passed"] = False
    else:
        result["checks"].append({
            "id": "T1-SEC-001",
            "status": "pass",
            "message": "No security issues found",
        })

    return result


# ============================================================================
# PHASE 2: AGENT ARCHITECTURE VALIDATION
# ============================================================================

def validate_agent_levels(squad_path: Path) -> Dict[str, Any]:
    """Validate that agent files contain required level_0 through level_5 sections."""
    result: Dict[str, Any] = {
        "passed": True,
        "checks": [],
        "blocking_issues": [],
        "warnings": [],
        "agent_details": {},
    }

    agents_dir = squad_path / "agents"
    if not agents_dir.exists():
        result["checks"].append({
            "id": "T2-AGT-DIR",
            "status": "fail",
            "message": "agents/ directory not found",
        })
        result["blocking_issues"].append("agents/ directory not found")
        result["passed"] = False
        return result

    agent_files = sorted(agents_dir.glob("*.md"))
    if not agent_files:
        result["checks"].append({
            "id": "T2-AGT-COUNT",
            "status": "fail",
            "message": "No agent files found in agents/",
        })
        result["blocking_issues"].append("No agent files found")
        result["passed"] = False
        return result

    result["checks"].append({
        "id": "T2-AGT-COUNT",
        "status": "pass",
        "message": f"Found {len(agent_files)} agent files",
    })

    for agent_file in agent_files:
        agent_name = agent_file.stem
        content = read_file_text(agent_file)
        if content is None:
            result["checks"].append({
                "id": f"T2-AGT-{agent_name}-READ",
                "status": "fail",
                "message": f"Cannot read agent file: {agent_name}.md",
            })
            result["blocking_issues"].append(f"Cannot read: {agent_name}.md")
            result["passed"] = False
            continue

        line_count = len(content.split("\n"))
        found_levels: List[str] = []
        missing_levels: List[str] = []

        for level in AGENT_REQUIRED_LEVELS:
            # Look for level_N: pattern in the content (inside YAML code blocks)
            if re.search(rf"^\s*{level}\s*:", content, re.MULTILINE):
                found_levels.append(level)
            else:
                missing_levels.append(level)

        agent_detail = {
            "file": f"{agent_name}.md",
            "line_count": line_count,
            "found_levels": found_levels,
            "missing_levels": missing_levels,
            "complete": len(missing_levels) == 0,
        }
        result["agent_details"][agent_name] = agent_detail

        if missing_levels:
            result["checks"].append({
                "id": f"T2-AGT-{agent_name}-LEVELS",
                "status": "warn",
                "message": (
                    f"Agent '{agent_name}' missing levels: "
                    f"{', '.join(missing_levels)} "
                    f"(has {len(found_levels)}/{len(AGENT_REQUIRED_LEVELS)})"
                ),
            })
            result["warnings"].append(
                f"Agent '{agent_name}' missing: {', '.join(missing_levels)}"
            )
        else:
            result["checks"].append({
                "id": f"T2-AGT-{agent_name}-LEVELS",
                "status": "pass",
                "message": (
                    f"Agent '{agent_name}' has all {len(AGENT_REQUIRED_LEVELS)} "
                    f"levels ({line_count} lines)"
                ),
            })

    return result


# ============================================================================
# PHASE 3: CROSS-REFERENCE VALIDATION
# ============================================================================

def validate_cross_references(squad_path: Path) -> Dict[str, Any]:
    """Validate cross-references between workflows, agents, and tasks."""
    result: Dict[str, Any] = {
        "passed": True,
        "checks": [],
        "blocking_issues": [],
        "warnings": [],
        "references": {},
    }

    agents_dir = squad_path / "agents"
    tasks_dir = squad_path / "tasks"
    workflows_dir = squad_path / "workflows"
    templates_dir = squad_path / "templates"

    # Collect known agents
    known_agents = set()
    if agents_dir.exists():
        for f in agents_dir.glob("*.md"):
            known_agents.add(f.stem)
    result["references"]["known_agents"] = sorted(known_agents)

    # Collect known tasks
    known_tasks = set()
    if tasks_dir.exists():
        for f in tasks_dir.glob("*.md"):
            if f.name.lower() not in ("readme.md", "changelog.md"):
                known_tasks.add(f.stem)
    result["references"]["known_tasks"] = sorted(known_tasks)

    # Collect known templates
    known_templates = set()
    if templates_dir.exists():
        for f in templates_dir.glob("*"):
            if f.is_file():
                known_templates.add(f.name)
    result["references"]["known_templates"] = sorted(known_templates)

    # Scan workflows for agent references (@agent-name)
    referenced_agents: set = set()
    referenced_templates: set = set()
    workflow_issues: List[str] = []

    if workflows_dir.exists():
        for wf_file in sorted(workflows_dir.glob("*.yaml")):
            content = read_file_text(wf_file)
            if content is None:
                continue

            # Find @agent-name references
            agent_refs = re.findall(r"@([a-z0-9_-]+)", content, re.IGNORECASE)
            for ref in agent_refs:
                referenced_agents.add(ref)

            # Find template references
            tmpl_refs = re.findall(
                r"templates?/([a-z0-9_.-]+)", content, re.IGNORECASE
            )
            for ref in tmpl_refs:
                referenced_templates.add(ref)

    result["references"]["workflow_agent_refs"] = sorted(referenced_agents)
    result["references"]["workflow_template_refs"] = sorted(referenced_templates)

    # Check that referenced agents exist
    missing_agents = referenced_agents - known_agents
    if missing_agents:
        result["checks"].append({
            "id": "T3-XREF-AGT",
            "status": "warn",
            "message": (
                f"Workflows reference {len(missing_agents)} agents not found in agents/: "
                f"{', '.join(sorted(missing_agents))}"
            ),
        })
        result["warnings"].append(
            f"Agent refs not found: {', '.join(sorted(missing_agents))}"
        )
    else:
        result["checks"].append({
            "id": "T3-XREF-AGT",
            "status": "pass",
            "message": (
                f"All {len(referenced_agents)} workflow agent references resolve correctly"
            ),
        })

    # Check that referenced templates exist
    missing_templates = referenced_templates - known_templates
    if missing_templates:
        result["checks"].append({
            "id": "T3-XREF-TMPL",
            "status": "warn",
            "message": (
                f"Workflows reference {len(missing_templates)} templates not found: "
                f"{', '.join(sorted(missing_templates))}"
            ),
        })
        result["warnings"].append(
            f"Template refs not found: {', '.join(sorted(missing_templates))}"
        )
    else:
        result["checks"].append({
            "id": "T3-XREF-TMPL",
            "status": "pass",
            "message": (
                f"All {len(referenced_templates)} template references resolve correctly"
            ),
        })

    # Check for orphan tasks (tasks not referenced anywhere)
    referenced_tasks: set = set()
    for md_file in squad_path.rglob("*.md"):
        if md_file.parent.name == "tasks":
            continue
        content = read_file_text(md_file)
        if content is None:
            continue
        for task_name in known_tasks:
            if task_name in content:
                referenced_tasks.add(task_name)

    for yaml_file in squad_path.rglob("*.yaml"):
        content = read_file_text(yaml_file)
        if content is None:
            continue
        for task_name in known_tasks:
            if task_name in content:
                referenced_tasks.add(task_name)

    orphan_tasks = known_tasks - referenced_tasks
    if orphan_tasks:
        result["checks"].append({
            "id": "T3-XREF-ORPHAN",
            "status": "warn",
            "message": (
                f"Found {len(orphan_tasks)} potentially orphan tasks: "
                f"{', '.join(sorted(orphan_tasks))}"
            ),
        })
        result["warnings"].append(
            f"Potentially orphan tasks: {', '.join(sorted(orphan_tasks))}"
        )
    else:
        result["checks"].append({
            "id": "T3-XREF-ORPHAN",
            "status": "pass",
            "message": f"All {len(known_tasks)} tasks are referenced somewhere",
        })

    # Check config.yaml heuristics are referenced in workflows
    config_path = squad_path / "config.yaml"
    config_data, _ = read_yaml_safe(config_path)
    if config_data and "heuristics" in config_data:
        heuristic_ids = {
            h.get("id", "") for h in config_data["heuristics"] if isinstance(h, dict)
        }
        referenced_heuristics: set = set()
        if workflows_dir.exists():
            for wf_file in workflows_dir.glob("*.yaml"):
                content = read_file_text(wf_file)
                if content:
                    for h_id in heuristic_ids:
                        if h_id and h_id in content:
                            referenced_heuristics.add(h_id)

        unreferenced = heuristic_ids - referenced_heuristics
        if unreferenced:
            result["checks"].append({
                "id": "T3-XREF-HEUR",
                "status": "warn",
                "message": (
                    f"{len(unreferenced)} config heuristics not referenced in workflows: "
                    f"{', '.join(sorted(unreferenced))}"
                ),
            })
            result["warnings"].append(
                f"Unreferenced heuristics: {', '.join(sorted(unreferenced))}"
            )
        else:
            result["checks"].append({
                "id": "T3-XREF-HEUR",
                "status": "pass",
                "message": f"All {len(heuristic_ids)} heuristics referenced in workflows",
            })

    return result


# ============================================================================
# MAIN ORCHESTRATION
# ============================================================================

def validate_squad(verbose: bool = False) -> Dict[str, Any]:
    """Run all validation phases on the video-creation squad."""
    try:
        squad_path = find_squad_root()
    except FileNotFoundError as e:
        return {"error": str(e)}

    results: Dict[str, Any] = {
        "squad_name": SQUAD_NAME,
        "squad_path": str(squad_path),
        "timestamp": datetime.now().isoformat(),
        "validator": "validate-squad-structure.py (Worker - EXEC-W-001)",
        "phases": {},
    }

    # Phase 0: Type Detection
    results["phases"]["phase_0_type_detection"] = detect_squad_type(squad_path)

    # Phase 1: Structure Validation
    results["phases"]["phase_1_structure"] = validate_structure(squad_path)

    # Phase 2: Agent Architecture
    results["phases"]["phase_2_agent_architecture"] = validate_agent_levels(squad_path)

    # Phase 3: Cross-References
    results["phases"]["phase_3_cross_references"] = validate_cross_references(squad_path)

    # Summary
    all_passed = all(
        p.get("passed", True)
        for p in results["phases"].values()
        if isinstance(p, dict)
    )
    total_blocking = sum(
        len(p.get("blocking_issues", []))
        for p in results["phases"].values()
        if isinstance(p, dict)
    )
    total_warnings = sum(
        len(p.get("warnings", []))
        for p in results["phases"].values()
        if isinstance(p, dict)
    )
    total_checks = sum(
        len(p.get("checks", []))
        for p in results["phases"].values()
        if isinstance(p, dict)
    )
    passed_checks = sum(
        sum(1 for c in p.get("checks", []) if c.get("status") == "pass")
        for p in results["phases"].values()
        if isinstance(p, dict)
    )

    results["summary"] = {
        "all_phases_passed": all_passed,
        "total_checks": total_checks,
        "passed_checks": passed_checks,
        "blocking_issues": total_blocking,
        "warnings": total_warnings,
        "detected_type": results["phases"]["phase_0_type_detection"]["detected_type"],
        "recommendation": (
            "PASS - Squad structure is valid"
            if all_passed
            else "FAIL - Fix blocking issues before proceeding"
        ),
    }

    return results


def print_report(results: Dict[str, Any]) -> None:
    """Print a human-readable validation report."""
    if "error" in results:
        print(f"ERROR: {results['error']}")
        return

    print()
    print("=" * 70)
    print(f"  VALIDATE-SQUAD-STRUCTURE: {results['squad_name']}")
    print("=" * 70)
    print(f"  Path:      {results['squad_path']}")
    print(f"  Validator: {results['validator']}")
    print(f"  Timestamp: {results['timestamp']}")
    print()

    # Phase 0
    p0 = results["phases"]["phase_0_type_detection"]
    print(f"  PHASE 0: Type Detection")
    print(f"    Detected: {p0['detected_type']} (confidence: {p0['confidence']}/10)")
    print(
        f"    Signals:  agents={p0['signals'].get('agent_count', 0)}, "
        f"tasks={p0['signals'].get('task_count', 0)}, "
        f"workflows={p0['signals'].get('workflow_count', 0)}"
    )
    print()

    # Phase 1
    p1 = results["phases"]["phase_1_structure"]
    status1 = "PASS" if p1["passed"] else "FAIL"
    print(f"  PHASE 1: Structure Validation [{status1}]")
    for check in p1["checks"]:
        icon = {"pass": "[OK]", "warn": "[!!]", "fail": "[XX]"}.get(
            check["status"], "[??]"
        )
        print(f"    {icon} [{check['id']}] {check['message']}")
    if p1["blocking_issues"]:
        for issue in p1["blocking_issues"]:
            print(f"    >>> BLOCKING: {issue}")
    print()

    # Phase 2
    p2 = results["phases"]["phase_2_agent_architecture"]
    status2 = "PASS" if p2["passed"] else "FAIL"
    print(f"  PHASE 2: Agent Architecture [{status2}]")
    for check in p2["checks"]:
        icon = {"pass": "[OK]", "warn": "[!!]", "fail": "[XX]"}.get(
            check["status"], "[??]"
        )
        print(f"    {icon} [{check['id']}] {check['message']}")
    print()

    # Phase 3
    p3 = results["phases"]["phase_3_cross_references"]
    status3 = "PASS" if p3["passed"] else "FAIL"
    print(f"  PHASE 3: Cross-Reference Validation [{status3}]")
    for check in p3["checks"]:
        icon = {"pass": "[OK]", "warn": "[!!]", "fail": "[XX]"}.get(
            check["status"], "[??]"
        )
        print(f"    {icon} [{check['id']}] {check['message']}")
    print()

    # Summary
    summary = results["summary"]
    status_final = "PASS" if summary["all_phases_passed"] else "FAIL"
    print("=" * 70)
    print(f"  RESULT: {status_final}")
    print(f"    Checks:          {summary['passed_checks']}/{summary['total_checks']} passed")
    print(f"    Blocking issues: {summary['blocking_issues']}")
    print(f"    Warnings:        {summary['warnings']}")
    print(f"    Type:            {summary['detected_type']}")
    print(f"    Recommendation:  {summary['recommendation']}")
    print("=" * 70)
    print()


def main() -> None:
    """Entry point."""
    parser = argparse.ArgumentParser(
        description=(
            "Validate video-creation squad structure - "
            "Worker script (EXEC-W-001, deterministic, zero LLM tokens)"
        )
    )
    parser.add_argument(
        "--output", "-o",
        choices=["text", "json"],
        default="text",
        help="Output format (default: text)",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Enable verbose output",
    )

    args = parser.parse_args()

    results = validate_squad(verbose=args.verbose)

    if args.output == "json":
        print(json.dumps(results, indent=2, ensure_ascii=False))
    else:
        print_report(results)

    # Exit codes: 0=pass, 1=fail, 2=error
    if "error" in results:
        sys.exit(2)
    elif not results["summary"]["all_phases_passed"]:
        sys.exit(1)
    else:
        sys.exit(0)


if __name__ == "__main__":
    main()
