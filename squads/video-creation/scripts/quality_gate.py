#!/usr/bin/env python3
"""
Quality Gate - Worker Script (Deterministic)

Runs quantitative quality checks on the video-creation squad.
Scoring system: 0-10 scale with pass threshold at 7.0.

Categories:
  - Structure (25%): directory layout, required files, file counts
  - Coverage  (25%): knowledge base completeness, checklist coverage
  - Quality   (25%): agent line counts, workflow depth, template presence
  - Documentation (25%): README presence, inline docs, changelog

Usage:
    python scripts/quality_gate.py
    python scripts/quality_gate.py --output json
    python scripts/quality_gate.py --strict

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

PASS_THRESHOLD = 7.0
STRICT_THRESHOLD = 8.5

CATEGORY_WEIGHTS = {
    "structure": 0.25,
    "coverage": 0.25,
    "quality": 0.25,
    "documentation": 0.25,
}

THRESHOLDS = {
    "agent_min_lines": 300,
    "task_min_lines": 50,
    "workflow_min_lines": 100,
    "min_agents": 3,
    "min_tasks": 2,
    "min_workflows": 1,
    "min_templates": 1,
    "min_checklists": 1,
    "min_data_files": 1,
    "kb_min_lines": 100,
}

REQUIRED_DIRS = ["agents", "tasks", "workflows", "templates", "checklists", "data"]
REQUIRED_FILES = ["config.yaml", "README.md"]
RECOMMENDED_FILES = ["CHANGELOG.md"]


# ============================================================================
# UTILITIES
# ============================================================================

def find_squad_root() -> Path:
    """Find the video-creation squad directory."""
    script_dir = Path(__file__).parent
    candidate = script_dir.parent
    if candidate.name == SQUAD_NAME and (candidate / "config.yaml").exists():
        return candidate

    if (candidate.parent / SQUAD_NAME).exists():
        return candidate.parent / SQUAD_NAME

    cwd = Path.cwd()
    if cwd.name == SQUAD_NAME:
        return cwd
    if (cwd / SQUAD_NAME).exists():
        return cwd / SQUAD_NAME
    if (cwd / "squads" / SQUAD_NAME).exists():
        return cwd / "squads" / SQUAD_NAME

    raise FileNotFoundError(
        f"Could not find {SQUAD_NAME}/ squad directory."
    )


def count_lines(file_path: Path) -> int:
    """Count lines in a file."""
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return sum(1 for _ in f)
    except Exception:
        return 0


def count_files_in_dir(directory: Path, patterns: Optional[List[str]] = None) -> int:
    """Count files matching patterns in directory."""
    if patterns is None:
        patterns = ["*.md", "*.yaml", "*.yml"]
    if not directory.exists():
        return 0
    count = 0
    for pattern in patterns:
        count += len(list(directory.glob(pattern)))
    return count


def read_file_text(file_path: Path) -> Optional[str]:
    """Read file contents as text."""
    if not file_path.exists():
        return None
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception:
        return None


def read_yaml_safe(file_path: Path) -> Optional[Dict]:
    """Read and parse a YAML file."""
    if not file_path.exists():
        return None
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f)
    except Exception:
        return None


# ============================================================================
# CATEGORY: STRUCTURE (25%)
# ============================================================================

def score_structure(squad_path: Path) -> Dict[str, Any]:
    """Score the structural completeness of the squad."""
    checks: List[Dict[str, Any]] = []
    points = 0.0
    max_points = 0.0

    # Check required directories (4 points max)
    for dir_name in REQUIRED_DIRS:
        max_points += 1.0
        dir_path = squad_path / dir_name
        if dir_path.exists() and dir_path.is_dir():
            has_files = count_files_in_dir(dir_path) > 0
            if has_files:
                points += 1.0
                checks.append({
                    "check": f"dir:{dir_name}",
                    "status": "pass",
                    "message": f"Directory '{dir_name}/' exists with files",
                })
            else:
                points += 0.5
                checks.append({
                    "check": f"dir:{dir_name}",
                    "status": "warn",
                    "message": f"Directory '{dir_name}/' exists but is empty",
                })
        else:
            checks.append({
                "check": f"dir:{dir_name}",
                "status": "fail",
                "message": f"Required directory '{dir_name}/' missing",
            })

    # Check required files (2 points max)
    for file_name in REQUIRED_FILES:
        max_points += 1.0
        file_path = squad_path / file_name
        if file_path.exists():
            points += 1.0
            checks.append({
                "check": f"file:{file_name}",
                "status": "pass",
                "message": f"Required file '{file_name}' exists",
            })
        else:
            checks.append({
                "check": f"file:{file_name}",
                "status": "fail",
                "message": f"Required file '{file_name}' missing",
            })

    # File count thresholds (2 points max)
    agents_dir = squad_path / "agents"
    agent_count = count_files_in_dir(agents_dir, ["*.md"])
    max_points += 1.0
    if agent_count >= THRESHOLDS["min_agents"]:
        points += 1.0
        checks.append({
            "check": "count:agents",
            "status": "pass",
            "message": f"Agent count: {agent_count} (min: {THRESHOLDS['min_agents']})",
        })
    else:
        frac = agent_count / THRESHOLDS["min_agents"] if THRESHOLDS["min_agents"] > 0 else 0
        points += min(frac, 1.0) * 0.5
        checks.append({
            "check": "count:agents",
            "status": "fail",
            "message": f"Agent count: {agent_count} (min: {THRESHOLDS['min_agents']})",
        })

    tasks_dir = squad_path / "tasks"
    task_count = count_files_in_dir(tasks_dir, ["*.md"])
    max_points += 1.0
    if task_count >= THRESHOLDS["min_tasks"]:
        points += 1.0
        checks.append({
            "check": "count:tasks",
            "status": "pass",
            "message": f"Task count: {task_count} (min: {THRESHOLDS['min_tasks']})",
        })
    else:
        checks.append({
            "check": "count:tasks",
            "status": "fail",
            "message": f"Task count: {task_count} (min: {THRESHOLDS['min_tasks']})",
        })

    # Normalize to 0-10
    raw_score = (points / max_points * 10.0) if max_points > 0 else 0.0

    return {
        "category": "Structure",
        "weight": CATEGORY_WEIGHTS["structure"],
        "raw_score": round(raw_score, 2),
        "weighted_score": round(raw_score * CATEGORY_WEIGHTS["structure"], 2),
        "checks": checks,
        "points": round(points, 1),
        "max_points": round(max_points, 1),
    }


# ============================================================================
# CATEGORY: COVERAGE (25%)
# ============================================================================

def score_coverage(squad_path: Path) -> Dict[str, Any]:
    """Score knowledge base completeness and checklist coverage."""
    checks: List[Dict[str, Any]] = []
    points = 0.0
    max_points = 0.0

    # Knowledge base presence and depth (3 points)
    data_dir = squad_path / "data"
    max_points += 3.0
    kb_files = list(data_dir.glob("*-kb.md")) if data_dir.exists() else []
    if not kb_files:
        kb_files = list(data_dir.glob("*.md")) if data_dir.exists() else []

    if kb_files:
        total_kb_lines = sum(count_lines(f) for f in kb_files)
        if total_kb_lines >= THRESHOLDS["kb_min_lines"]:
            points += 3.0
            checks.append({
                "check": "kb:completeness",
                "status": "pass",
                "message": (
                    f"Knowledge base: {len(kb_files)} file(s), "
                    f"{total_kb_lines} lines (min: {THRESHOLDS['kb_min_lines']})"
                ),
            })
        else:
            frac = total_kb_lines / THRESHOLDS["kb_min_lines"]
            points += min(frac, 1.0) * 2.0
            checks.append({
                "check": "kb:completeness",
                "status": "warn",
                "message": (
                    f"Knowledge base: {total_kb_lines} lines "
                    f"(min: {THRESHOLDS['kb_min_lines']})"
                ),
            })
    else:
        checks.append({
            "check": "kb:completeness",
            "status": "fail",
            "message": "No knowledge base files found in data/",
        })

    # Checklist coverage (3 points)
    checklists_dir = squad_path / "checklists"
    max_points += 3.0
    checklist_count = count_files_in_dir(checklists_dir, ["*.md"])
    if checklist_count >= THRESHOLDS["min_checklists"]:
        points += 2.0
        checks.append({
            "check": "checklists:count",
            "status": "pass",
            "message": f"Checklists: {checklist_count} (min: {THRESHOLDS['min_checklists']})",
        })

        # Check that checklists have actual checkbox items
        has_checkboxes = False
        for cl_file in checklists_dir.glob("*.md"):
            content = read_file_text(cl_file)
            if content and re.search(r"- \[[ x]\]", content):
                has_checkboxes = True
                break
        if has_checkboxes:
            points += 1.0
            checks.append({
                "check": "checklists:format",
                "status": "pass",
                "message": "Checklists contain checkbox items",
            })
        else:
            checks.append({
                "check": "checklists:format",
                "status": "warn",
                "message": "Checklists lack standard checkbox format (- [ ])",
            })
    else:
        checks.append({
            "check": "checklists:count",
            "status": "fail",
            "message": f"Checklists: {checklist_count} (min: {THRESHOLDS['min_checklists']})",
        })

    # Template coverage (2 points)
    templates_dir = squad_path / "templates"
    max_points += 2.0
    template_count = count_files_in_dir(templates_dir, ["*.md", "*.yaml", "*.yml"])
    if template_count >= THRESHOLDS["min_templates"]:
        points += 2.0
        checks.append({
            "check": "templates:count",
            "status": "pass",
            "message": f"Templates: {template_count} (min: {THRESHOLDS['min_templates']})",
        })
    else:
        checks.append({
            "check": "templates:count",
            "status": "fail",
            "message": f"Templates: {template_count} (min: {THRESHOLDS['min_templates']})",
        })

    # Workflow coverage (2 points)
    workflows_dir = squad_path / "workflows"
    max_points += 2.0
    workflow_count = count_files_in_dir(workflows_dir, ["*.yaml", "*.yml"])
    if workflow_count >= THRESHOLDS["min_workflows"]:
        points += 2.0
        checks.append({
            "check": "workflows:count",
            "status": "pass",
            "message": f"Workflows: {workflow_count} (min: {THRESHOLDS['min_workflows']})",
        })
    else:
        checks.append({
            "check": "workflows:count",
            "status": "fail",
            "message": f"Workflows: {workflow_count} (min: {THRESHOLDS['min_workflows']})",
        })

    raw_score = (points / max_points * 10.0) if max_points > 0 else 0.0

    return {
        "category": "Coverage",
        "weight": CATEGORY_WEIGHTS["coverage"],
        "raw_score": round(raw_score, 2),
        "weighted_score": round(raw_score * CATEGORY_WEIGHTS["coverage"], 2),
        "checks": checks,
        "points": round(points, 1),
        "max_points": round(max_points, 1),
    }


# ============================================================================
# CATEGORY: QUALITY (25%)
# ============================================================================

def score_quality(squad_path: Path) -> Dict[str, Any]:
    """Score agent depth, workflow complexity, and content quality."""
    checks: List[Dict[str, Any]] = []
    points = 0.0
    max_points = 0.0

    # Agent line count quality (4 points)
    agents_dir = squad_path / "agents"
    if agents_dir.exists():
        agent_files = sorted(agents_dir.glob("*.md"))
        agents_above_threshold = 0
        total_agents = len(agent_files)

        for agent_file in agent_files:
            lines = count_lines(agent_file)
            if lines >= THRESHOLDS["agent_min_lines"]:
                agents_above_threshold += 1

        max_points += 4.0
        if total_agents > 0:
            ratio = agents_above_threshold / total_agents
            agent_score = ratio * 4.0
            points += agent_score

            if ratio >= 0.8:
                status = "pass"
            elif ratio >= 0.5:
                status = "warn"
            else:
                status = "fail"

            checks.append({
                "check": "agents:line_depth",
                "status": status,
                "message": (
                    f"{agents_above_threshold}/{total_agents} agents above "
                    f"{THRESHOLDS['agent_min_lines']} lines ({ratio:.0%})"
                ),
            })
        else:
            checks.append({
                "check": "agents:line_depth",
                "status": "fail",
                "message": "No agent files to evaluate",
            })
    else:
        max_points += 4.0
        checks.append({
            "check": "agents:line_depth",
            "status": "fail",
            "message": "agents/ directory not found",
        })

    # Workflow depth (3 points)
    workflows_dir = squad_path / "workflows"
    max_points += 3.0
    if workflows_dir.exists():
        wf_files = sorted(workflows_dir.glob("*.yaml"))
        deep_workflows = 0
        total_workflows = len(wf_files)

        for wf_file in wf_files:
            lines = count_lines(wf_file)
            if lines >= THRESHOLDS["workflow_min_lines"]:
                deep_workflows += 1

        if total_workflows > 0:
            ratio = deep_workflows / total_workflows
            wf_score = ratio * 3.0
            points += wf_score

            checks.append({
                "check": "workflows:depth",
                "status": "pass" if ratio >= 0.5 else "warn",
                "message": (
                    f"{deep_workflows}/{total_workflows} workflows above "
                    f"{THRESHOLDS['workflow_min_lines']} lines"
                ),
            })
        else:
            checks.append({
                "check": "workflows:depth",
                "status": "fail",
                "message": "No workflow YAML files to evaluate",
            })
    else:
        checks.append({
            "check": "workflows:depth",
            "status": "fail",
            "message": "workflows/ directory not found",
        })

    # Config quality (2 points)
    config_path = squad_path / "config.yaml"
    max_points += 2.0
    config_data = read_yaml_safe(config_path)
    if config_data:
        config_fields_present = 0
        expected_fields = [
            "name", "version", "description", "author", "slashPrefix",
            "tools", "heuristics", "metadata",
        ]
        for field in expected_fields:
            if field in config_data:
                config_fields_present += 1

        ratio = config_fields_present / len(expected_fields)
        points += ratio * 2.0

        checks.append({
            "check": "config:richness",
            "status": "pass" if ratio >= 0.7 else "warn",
            "message": (
                f"config.yaml has {config_fields_present}/{len(expected_fields)} "
                f"expected fields ({ratio:.0%})"
            ),
        })
    else:
        checks.append({
            "check": "config:richness",
            "status": "fail",
            "message": "config.yaml not found or invalid",
        })

    # YAML validity across all files (1 point)
    max_points += 1.0
    yaml_errors = 0
    yaml_total = 0
    for yaml_file in squad_path.rglob("*.yaml"):
        yaml_total += 1
        try:
            with open(yaml_file, "r", encoding="utf-8") as f:
                yaml.safe_load(f)
        except Exception:
            yaml_errors += 1

    if yaml_total > 0:
        if yaml_errors == 0:
            points += 1.0
            checks.append({
                "check": "yaml:validity",
                "status": "pass",
                "message": f"All {yaml_total} YAML files are syntactically valid",
            })
        else:
            checks.append({
                "check": "yaml:validity",
                "status": "fail",
                "message": f"{yaml_errors}/{yaml_total} YAML files have syntax errors",
            })
    else:
        checks.append({
            "check": "yaml:validity",
            "status": "warn",
            "message": "No YAML files found to validate",
        })

    raw_score = (points / max_points * 10.0) if max_points > 0 else 0.0

    return {
        "category": "Quality",
        "weight": CATEGORY_WEIGHTS["quality"],
        "raw_score": round(raw_score, 2),
        "weighted_score": round(raw_score * CATEGORY_WEIGHTS["quality"], 2),
        "checks": checks,
        "points": round(points, 1),
        "max_points": round(max_points, 1),
    }


# ============================================================================
# CATEGORY: DOCUMENTATION (25%)
# ============================================================================

def score_documentation(squad_path: Path) -> Dict[str, Any]:
    """Score documentation presence and quality."""
    checks: List[Dict[str, Any]] = []
    points = 0.0
    max_points = 0.0

    # README.md quality (3 points)
    readme_path = squad_path / "README.md"
    max_points += 3.0
    if readme_path.exists():
        readme_lines = count_lines(readme_path)
        readme_content = read_file_text(readme_path)

        if readme_lines >= 50:
            points += 1.5
            checks.append({
                "check": "readme:length",
                "status": "pass",
                "message": f"README.md has {readme_lines} lines (good depth)",
            })
        elif readme_lines >= 20:
            points += 0.75
            checks.append({
                "check": "readme:length",
                "status": "warn",
                "message": f"README.md has {readme_lines} lines (could be deeper)",
            })
        else:
            checks.append({
                "check": "readme:length",
                "status": "fail",
                "message": f"README.md has only {readme_lines} lines",
            })

        # Check for key sections in README
        if readme_content:
            key_sections = ["#", "agent", "workflow", "usage", "comfyui"]
            found_sections = sum(
                1 for s in key_sections
                if s.lower() in readme_content.lower()
            )
            section_ratio = found_sections / len(key_sections)
            points += section_ratio * 1.5
            checks.append({
                "check": "readme:sections",
                "status": "pass" if section_ratio >= 0.6 else "warn",
                "message": (
                    f"README covers {found_sections}/{len(key_sections)} "
                    f"expected topic areas"
                ),
            })
    else:
        checks.append({
            "check": "readme:presence",
            "status": "fail",
            "message": "README.md not found",
        })

    # CHANGELOG presence (1 point)
    max_points += 1.0
    changelog_path = squad_path / "CHANGELOG.md"
    if changelog_path.exists():
        points += 1.0
        checks.append({
            "check": "changelog:presence",
            "status": "pass",
            "message": "CHANGELOG.md exists",
        })
    else:
        checks.append({
            "check": "changelog:presence",
            "status": "warn",
            "message": "CHANGELOG.md not found (recommended)",
        })

    # Inline documentation in config.yaml (2 points)
    config_path = squad_path / "config.yaml"
    max_points += 2.0
    config_content = read_file_text(config_path)
    if config_content:
        comment_lines = sum(
            1 for line in config_content.split("\n")
            if line.strip().startswith("#")
        )
        total_lines = len(config_content.split("\n"))
        comment_ratio = comment_lines / total_lines if total_lines > 0 else 0

        if comment_ratio >= 0.05:
            points += 1.0
        if "description" in config_content.lower():
            points += 1.0

        checks.append({
            "check": "config:documentation",
            "status": "pass" if comment_ratio >= 0.05 else "warn",
            "message": (
                f"config.yaml has {comment_lines} comment lines "
                f"({comment_ratio:.0%} of file)"
            ),
        })
    else:
        checks.append({
            "check": "config:documentation",
            "status": "fail",
            "message": "config.yaml not readable",
        })

    # Agent file documentation (2 points)
    agents_dir = squad_path / "agents"
    max_points += 2.0
    if agents_dir.exists():
        agent_files = list(agents_dir.glob("*.md"))
        documented_agents = 0
        for agent_file in agent_files:
            content = read_file_text(agent_file)
            if content:
                # Check for heading + some structured content
                has_heading = bool(re.search(r"^#\s+", content, re.MULTILINE))
                has_yaml_block = "```yaml" in content or "```yml" in content
                if has_heading and has_yaml_block:
                    documented_agents += 1

        if agent_files:
            ratio = documented_agents / len(agent_files)
            points += ratio * 2.0
            checks.append({
                "check": "agents:documentation",
                "status": "pass" if ratio >= 0.8 else "warn",
                "message": (
                    f"{documented_agents}/{len(agent_files)} agents have proper "
                    f"heading + YAML documentation"
                ),
            })
        else:
            checks.append({
                "check": "agents:documentation",
                "status": "fail",
                "message": "No agent files found",
            })
    else:
        checks.append({
            "check": "agents:documentation",
            "status": "fail",
            "message": "agents/ directory not found",
        })

    # Scripts documentation (2 points)
    scripts_dir = squad_path / "scripts"
    max_points += 2.0
    scripts_readme = scripts_dir / "README.md" if scripts_dir.exists() else None
    if scripts_readme and scripts_readme.exists():
        points += 2.0
        checks.append({
            "check": "scripts:readme",
            "status": "pass",
            "message": "scripts/README.md exists",
        })
    else:
        py_scripts = list(scripts_dir.glob("*.py")) if scripts_dir and scripts_dir.exists() else []
        if py_scripts:
            # At least check if scripts have docstrings
            documented = 0
            for script in py_scripts:
                content = read_file_text(script)
                if content and '"""' in content:
                    documented += 1
            if documented == len(py_scripts):
                points += 1.0
            checks.append({
                "check": "scripts:readme",
                "status": "warn",
                "message": (
                    f"scripts/README.md not found "
                    f"({documented}/{len(py_scripts)} scripts have docstrings)"
                ),
            })
        else:
            checks.append({
                "check": "scripts:readme",
                "status": "warn",
                "message": "No scripts directory or README",
            })

    raw_score = (points / max_points * 10.0) if max_points > 0 else 0.0

    return {
        "category": "Documentation",
        "weight": CATEGORY_WEIGHTS["documentation"],
        "raw_score": round(raw_score, 2),
        "weighted_score": round(raw_score * CATEGORY_WEIGHTS["documentation"], 2),
        "checks": checks,
        "points": round(points, 1),
        "max_points": round(max_points, 1),
    }


# ============================================================================
# MAIN ORCHESTRATION
# ============================================================================

def run_quality_gate(strict: bool = False) -> Dict[str, Any]:
    """Run all quality gate checks and compute final score."""
    try:
        squad_path = find_squad_root()
    except FileNotFoundError as e:
        return {"error": str(e)}

    threshold = STRICT_THRESHOLD if strict else PASS_THRESHOLD

    results: Dict[str, Any] = {
        "squad_name": SQUAD_NAME,
        "squad_path": str(squad_path),
        "timestamp": datetime.now().isoformat(),
        "gate": "quality_gate.py (Worker - EXEC-W-001)",
        "mode": "strict" if strict else "standard",
        "threshold": threshold,
        "categories": {},
    }

    # Run all category scorers
    categories = {
        "structure": score_structure(squad_path),
        "coverage": score_coverage(squad_path),
        "quality": score_quality(squad_path),
        "documentation": score_documentation(squad_path),
    }
    results["categories"] = categories

    # Compute final weighted score
    final_score = sum(cat["weighted_score"] for cat in categories.values())

    # Determine pass/fail
    passed = final_score >= threshold

    results["summary"] = {
        "final_score": round(final_score, 2),
        "threshold": threshold,
        "passed": passed,
        "verdict": "PASS" if passed else "FAIL",
        "breakdown": {
            name: {
                "raw": cat["raw_score"],
                "weighted": cat["weighted_score"],
                "weight": f"{cat['weight']:.0%}",
            }
            for name, cat in categories.items()
        },
    }

    return results


def print_report(results: Dict[str, Any]) -> None:
    """Print a human-readable quality gate report."""
    if "error" in results:
        print(f"ERROR: {results['error']}")
        return

    print()
    print("=" * 70)
    print(f"  QUALITY GATE: {results['squad_name']}")
    print("=" * 70)
    print(f"  Path:      {results['squad_path']}")
    print(f"  Gate:      {results['gate']}")
    print(f"  Mode:      {results['mode']}")
    print(f"  Threshold: {results['threshold']}/10")
    print()

    for cat_name, cat_data in results["categories"].items():
        weight_pct = f"{cat_data['weight']:.0%}"
        print(f"  --- {cat_data['category']} ({weight_pct}) ---")
        print(f"      Raw: {cat_data['raw_score']}/10  |  "
              f"Weighted: {cat_data['weighted_score']:.2f}  |  "
              f"Points: {cat_data['points']}/{cat_data['max_points']}")
        for check in cat_data["checks"]:
            icon = {"pass": "[OK]", "warn": "[!!]", "fail": "[XX]"}.get(
                check["status"], "[??]"
            )
            print(f"      {icon} {check['message']}")
        print()

    summary = results["summary"]
    verdict = summary["verdict"]
    score = summary["final_score"]
    threshold = summary["threshold"]

    print("=" * 70)
    bar_len = 40
    filled = int(score / 10 * bar_len)
    bar = "#" * filled + "-" * (bar_len - filled)
    print(f"  SCORE: [{bar}] {score:.1f}/10")
    print(f"  THRESHOLD: {threshold}/10")
    print(f"  VERDICT: {verdict}")
    print()
    print("  Breakdown:")
    for name, data in summary["breakdown"].items():
        print(f"    {name:15s}  raw={data['raw']:.1f}  weighted={data['weighted']:.2f}  ({data['weight']})")
    print("=" * 70)
    print()


def main() -> None:
    """Entry point."""
    parser = argparse.ArgumentParser(
        description=(
            "Quality gate for video-creation squad - "
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
        "--strict",
        action="store_true",
        help=f"Use strict threshold ({STRICT_THRESHOLD}/10 instead of {PASS_THRESHOLD}/10)",
    )

    args = parser.parse_args()

    results = run_quality_gate(strict=args.strict)

    if args.output == "json":
        print(json.dumps(results, indent=2, ensure_ascii=False))
    else:
        print_report(results)

    # Exit codes: 0=pass, 1=fail, 2=error
    if "error" in results:
        sys.exit(2)
    elif not results["summary"]["passed"]:
        sys.exit(1)
    else:
        sys.exit(0)


if __name__ == "__main__":
    main()
