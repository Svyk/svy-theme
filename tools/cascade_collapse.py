#!/usr/bin/env python3
"""Collapse upstream's four-copy light/dark cascade in src/css/00-upstream-base.css.

OFFLINE TOOL. It is never run by `npm run build` — the build stays a dumb concat of
src/css/*.css. Its output is committed; this file exists so the transform is auditable
and repeatable, not so it runs on every build.

WHAT UPSTREAM SHIPS
    Every themed selector exists four times in source order:

        <sel>                               { light values }
        .bp3-light <sel>                    { light values }   (byte-equal restatement)
        .bp3-dark  <sel>                    { dark values  }
        @media (prefers-color-scheme: dark) { <sel> { dark values } }

    Dark therefore arrives only under `.bp3-dark` or an UNGUARDED OS-dark media query.
    Under `body.bt-theme-dark`, `.rm-dark-theme` and `body.roam-body.dark` the theme
    renders light; and with an OS-dark laptop running a LIGHT Roam the media copies
    paint dark over a light app.

WHAT THIS EMITS
    One rule at the base rule's original position, each mode-varying declaration read
    through a token, plus three token blocks at the top of the sheet:

        <sel> { color: var(--svy-b12-color, #182026); }

        :root { --svy-b12-color: #182026; }
        :root.bp3-dark, body.bt-theme-dark, .rm-dark-theme,
        body.roam-body.dark { --svy-b12-color: #f5f8fa; }
        @media (prefers-color-scheme: dark) {
          :root:not(.bp3-light) { --svy-b12-color: #f5f8fa; }
        }

    All five dark signals now drive the same tokens, and the OS-dark arm yields to an
    explicit `.bp3-light` stamp (src/dm-toggle.js stamps it in auto mode when Roam's
    rendered background measures light).

CLASSIFICATION (per four-copy run)
    collapse-strict     every dark declaration maps onto a base declaration with the
                        same property and the same !important flag, and every differing
                        value pair differs ONLY in its colour literals (identical
                        skeleton once colours are blanked). Tokenised; the light, dark
                        and media copies are deleted.
    collapse-identical  same mapping, zero differing values: the dark copy restates the
                        base verbatim. No token; the three copies are deleted.
    collapse-partial    a dark declaration has no base counterpart, so it cannot be
                        tokenised (an undefined var() with no fallback is invalid at
                        computed-value time, which is NOT the same as an absent
                        declaration). Base keeps its literals, and the dark-only
                        declarations are re-emitted under the full five-signal pattern.
    keep                a differing pair is structural, not colour-only (box-shadow
                        layer counts, gradient angles). All four copies stay; only the
                        media copy is guarded.
    keep-hazard         collapsing would lower the dark-mode specificity below a later
                        rule that sets the same property. See scan_specificity_hazards.

CORRECTNESS ANCHOR
    tools/cssnodes.py parses to a tree in which every byte belongs to exactly one node,
    so serialize(parse(css)) == css. `--check` asserts that round-trip on the current
    sheet before any transform runs, and the emitted sheet is re-parsed and re-serialised
    before it is written.
"""

import argparse
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from cssnodes import (  # noqa: E402
    AtBlock,
    Raw,
    Rule,
    parse,
    parse_declarations,
    serialize,
    split_selector,
    walk_rules,
)

REPOSITORY = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(REPOSITORY, "src", "css", "00-upstream-base.css")
REPORT = os.path.join(REPOSITORY, "docs", "absorption", "cascade-collapse-report.json")
LAYER_DIRECTORY = os.path.join(REPOSITORY, "src", "css")

DARK_MEDIA = "@media (prefers-color-scheme: dark)"

# The five dark signals every other layer in this theme already uses. Four are selectors;
# the fifth is the OS preference, guarded so an explicit .bp3-light always wins.
DARK_SIGNAL_PREFIXES = (":root.bp3-dark", "body.bt-theme-dark", ".rm-dark-theme", "body.roam-body.dark")
MEDIA_GUARD_PREFIX = ":root:not(.bp3-light)"
# Zero-specificity guard for rules we are NOT collapsing: it changes the match set only
# by excluding an explicit .bp3-light stamp, and leaves specificity and source order
# exactly as upstream shipped them.
MEDIA_GUARD_WHERE = ":where(:root:not(.bp3-light))"

TOKEN_PREFIX = "--svy-b"

NAMED_COLORS = (
    r"transparent|currentcolor|black|white|red|green|blue|gray|grey|silver|maroon|olive|"
    r"lime|aqua|teal|navy|fuchsia|purple|orange|gold|ivory|beige|azure|coral|crimson|cyan|"
    r"indigo|khaki|lavender|magenta|plum|salmon|tan|tomato|violet|wheat|brown|pink"
)
COLOR_TOKEN = re.compile(
    r"(#[0-9a-fA-F]{3,8}\b)"
    r"|((?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^()]*(?:\([^()]*\)[^()]*)*\))"
    r"|(\b(?:" + NAMED_COLORS + r")\b)",
    re.I,
)


def normalize(text):
    return re.sub(r"\s+", " ", text).strip()


def color_skeleton(value):
    """The value with every colour literal blanked out."""
    return normalize(COLOR_TOKEN.sub("\x00", value))


def differs_only_in_color(light_value, dark_value):
    return (
        color_skeleton(light_value) == color_skeleton(dark_value)
        and COLOR_TOKEN.search(light_value) is not None
    )


# --------------------------------------------------------------------------- specificity


PSEUDO_ELEMENT = re.compile(r"::[\w-]+")
FUNCTIONAL = re.compile(r":(not|is|matches|any|has|where)\(", re.I)
SIMPLE = re.compile(
    r"(#[\w-]+)"                      # id
    r"|(\.[\w-]+)"                    # class
    r"|(\[[^\]]*\])"                  # attribute
    r"|(::[\w-]+)"                    # pseudo-element
    r"|(:[\w-]+)"                     # pseudo-class
    r"|([a-zA-Z][\w-]*)"              # type
)


def specificity(selector):
    """(id, class, type) specificity of one selector, per Selectors Level 4."""
    ids = classes = types = 0
    index = 0
    text = selector
    while index < len(text):
        match = FUNCTIONAL.search(text, index)
        if not match:
            break
        name = match.group(1).lower()
        depth = 1
        cursor = match.end()
        while cursor < len(text) and depth:
            if text[cursor] == "(":
                depth += 1
            elif text[cursor] == ")":
                depth -= 1
            cursor += 1
        inner = text[match.end():cursor - 1]
        if name != "where":
            candidates = [specificity(part) for part in split_selector(inner)] or [(0, 0, 0)]
            best = max(candidates)
            ids += best[0]
            classes += best[1]
            types += best[2]
        text = text[:match.start()] + " " * (cursor - match.start()) + text[cursor:]
        index = match.start()
    for token in SIMPLE.finditer(text):
        identifier, klass, attribute, element, pseudo, type_selector = token.groups()
        if identifier:
            ids += 1
        elif klass or attribute or pseudo:
            classes += 1
        elif element:
            types += 1
        elif type_selector:
            if type_selector.lower() not in ("and", "or", "not", "n", "even", "odd"):
                types += 1
    return (ids, classes, types)


COMBINATOR = re.compile(r"\s*[>+~]\s*|\s+")


def rightmost_compound(selector):
    """The set of ids/classes/types in the selector's rightmost compound."""
    pieces = [piece for piece in COMBINATOR.split(selector.strip()) if piece]
    if not pieces:
        return frozenset()
    last = PSEUDO_ELEMENT.sub("", pieces[-1])
    last = FUNCTIONAL.sub(" ", last)
    keys = set()
    for token in SIMPLE.finditer(last):
        identifier, klass, attribute, _element, _pseudo, type_selector = token.groups()
        if identifier:
            keys.add(identifier)
        elif klass:
            keys.add(klass)
        elif attribute:
            keys.add(re.split(r"[~^|$*=\]]", attribute[1:])[0].strip())
        elif type_selector:
            keys.add(type_selector.lower())
    return frozenset(keys)


def property_family(prop):
    """Conservative shorthand/longhand bucket used by the hazard scan."""
    return prop.split("-")[0].lower()


# --------------------------------------------------------------------------- run finding


def strip_class_prefix(parts, class_name):
    """Remove a leading `.class ` descendant prefix from every selector part."""
    stripped = []
    pattern = re.compile(r"^\." + re.escape(class_name) + r"\s+(.*)$")
    for part in parts:
        match = pattern.match(part)
        if not match:
            return None
        stripped.append(match.group(1).strip())
    return stripped


def copy_kind(node):
    """('base'|'light'|'dark', family key) for a top-level style rule."""
    if node.kind != "rule" or node.at_rule:
        return None, None
    parts = split_selector(node.selector)
    dark = strip_class_prefix(parts, "bp3-dark")
    if dark:
        return "dark", normalize(", ".join(dark))
    light = strip_class_prefix(parts, "bp3-light")
    if light:
        return "light", normalize(", ".join(light))
    return "base", normalize(node.selector)


def find_runs(nodes):
    """Locate base/light/dark/media quadruples that are consecutive in source order.

    Adjacency is required, not merely a matching key: deleting three copies must not
    reorder the base rule relative to any other rule in the sheet.
    """
    significant = [(index, node) for index, node in enumerate(nodes)
                   if node.kind in ("rule", "at", "statement")]
    runs = []
    cursor = 0
    while cursor < len(significant):
        _, node = significant[cursor]
        kind, key = copy_kind(node)
        if kind == "base" and cursor + 3 < len(significant):
            light_kind, light_key = copy_kind(significant[cursor + 1][1])
            dark_kind, dark_key = copy_kind(significant[cursor + 2][1])
            media_block = significant[cursor + 3][1]
            media_rules = (
                [child for child in media_block.children if child.kind == "rule"]
                if media_block.kind == "at" and media_block.condition == DARK_MEDIA
                else []
            )
            if (
                light_kind == "light" and light_key == key
                and dark_kind == "dark" and dark_key == key
                and len(media_rules) == 1
                and normalize(media_rules[0].selector) == key
            ):
                runs.append({
                    "key": key,
                    "base_index": significant[cursor][0],
                    "light_index": significant[cursor + 1][0],
                    "dark_index": significant[cursor + 2][0],
                    "media_index": significant[cursor + 3][0],
                    "base": node,
                    "light": significant[cursor + 1][1],
                    "dark": significant[cursor + 2][1],
                    "media_block": media_block,
                    "media": media_rules[0],
                })
                cursor += 4
                continue
        cursor += 1
    return runs


# --------------------------------------------------------------------------- classify


def classify_run(run):
    """Return (classification, mapping, unmapped, reason)."""
    base = parse_declarations(run["base"].body)
    light = parse_declarations(run["light"].body)
    dark = parse_declarations(run["dark"].body)
    media = parse_declarations(run["media"].body)
    if None in (base, light, dark, media):
        return "keep", [], [], "nested block in a declaration body"
    if light != base:
        return "keep", [], [], "the .bp3-light copy is not a restatement of the base rule"
    if dark != media:
        return "keep", [], [], "the .bp3-dark copy and the media copy disagree"

    base_props = [declaration.prop for declaration in base]
    dark_props = [declaration.prop for declaration in dark]
    if len(set(base_props)) != len(base_props) or len(set(dark_props)) != len(dark_props):
        return "keep", [], [], "a property is declared more than once"

    by_property = {declaration.prop: declaration for declaration in base}
    mapping, unmapped = [], []
    for declaration in dark:
        candidate = by_property.get(declaration.prop)
        if candidate is not None and candidate.important == declaration.important:
            mapping.append((candidate, declaration))
        else:
            unmapped.append(declaration)

    differing = [pair for pair in mapping if pair[0].value != pair[1].value]
    structural = [pair for pair in differing
                  if not differs_only_in_color(pair[0].value, pair[1].value)]
    if structural:
        properties = sorted({pair[0].prop for pair in structural})
        return "keep", mapping, unmapped, f"non-colour difference in {', '.join(properties)}"
    if unmapped:
        return "collapse-partial", mapping, unmapped, ""
    if differing:
        return "collapse-strict", mapping, unmapped, ""
    return "collapse-identical", mapping, unmapped, ""


# --------------------------------------------------------------------- hazard scanning


def sheet_rules_in_cascade_order(base_nodes):
    """Every rule of the built stylesheet, in the order the browser sees them.

    Layer 00 is read from ``base_nodes`` (the same tree the runs were found in) so a
    family's own copies can be excluded by object identity rather than by selector text.
    Rules inside the OS-dark media query are skipped: they are irrelevant to the mode the
    scan is about (`.bp3-dark` stamped, OS light), and in OS-dark they keep their existing
    order relative to the base rule, which does not move.
    """
    entries = []

    def add(layer, nodes):
        for rule, context in walk_rules(nodes):
            if rule.at_rule or DARK_MEDIA in context:
                continue
            declarations = parse_declarations(rule.body) or []
            entries.append({
                "layer": layer,
                "order": len(entries),
                "rule": rule,
                "parts": split_selector(rule.selector),
                "families": {property_family(declaration.prop) for declaration in declarations},
            })

    for filename in sorted(os.listdir(LAYER_DIRECTORY)):
        if not filename.endswith(".css"):
            continue
        if filename == os.path.basename(SOURCE):
            add(filename, base_nodes)
            continue
        css = open(os.path.join(LAYER_DIRECTORY, filename), encoding="utf-8").read()
        add(filename, parse(css))
    return entries


def scan_specificity_hazards(base_nodes, runs, classifications):
    """Find collapses that would lose a dark-mode cascade fight they win today.

    `.bp3-dark <sel>` carries one class more than `<sel>`. Collapsing moves the dark
    values into `<sel>` itself, so any LATER rule whose specificity sits in
    [spec(<sel>), spec(.bp3-dark <sel>)) and that sets the same property would start
    winning in dark mode where the `.bp3-dark` copy wins today. Same ids, same classes and
    at least as many type selectors is exactly that half-open interval.
    """
    entries = sheet_rules_in_cascade_order(base_nodes)
    position_of = {id(entry["rule"]): entry["order"] for entry in entries}

    # A later rule cannot flip the outcome if it carries its own dark twin: today its
    # `.bp3-dark` copy beats this family's `.bp3-dark` copy by source order, and after the
    # collapse its base still beats this family's base by source order. Only later rules
    # with NO dark counterpart for the property in question can change hands.
    twinned = {}
    for run in runs:
        dark_declarations = parse_declarations(run["dark"].body) or []
        twinned.setdefault(id(run["base"]), set()).update(
            property_family(declaration.prop) for declaration in dark_declarations
        )

    hazards = {}
    for index, run in enumerate(runs):
        if not classifications[index]["classification"].startswith("collapse"):
            continue
        touched = {property_family(pair[0].prop)
                   for pair in classifications[index]["mapping"]}
        if not touched:
            continue
        position = position_of.get(id(run["base"]))
        if position is None:
            continue
        own = {id(run["light"]), id(run["dark"]), id(run["media"])}
        found = None
        for part in split_selector(run["base"].selector):
            base_specificity = specificity(part)
            base_keys = rightmost_compound(part)
            if not base_keys:
                continue
            for entry in entries:
                if entry["order"] <= position or id(entry["rule"]) in own:
                    continue
                contested = entry["families"] & touched
                if not contested:
                    continue
                if contested <= twinned.get(id(entry["rule"]), set()):
                    continue
                for other in entry["parts"]:
                    # A .bp3-light copy never matches while a dark signal is stamped.
                    if ".bp3-light" in other or ".bp3-dark" in other:
                        continue
                    other_specificity = specificity(other)
                    if other_specificity[0] != base_specificity[0]:
                        continue
                    if other_specificity[1] != base_specificity[1]:
                        continue
                    if other_specificity[2] < base_specificity[2]:
                        continue
                    if not (rightmost_compound(other) & base_keys):
                        continue
                    found = {"layer": entry["layer"], "selector": other, "base": part}
                    break
                if found:
                    break
            if found:
                break
        if found:
            hazards[index] = found
    return hazards


# ------------------------------------------------------------------------------ emit


def token_name(group, prop):
    return f"{TOKEN_PREFIX}{group}-{prop}"


def render_declarations(declarations, indent):
    return "".join(
        f"{indent}{declaration.prop}: {declaration.value}"
        f"{' !important' if declaration.important else ''};\n"
        for declaration in declarations
    )


def splice_values(body, edits):
    """Replace value spans in ``body``; everything else stays byte-for-byte."""
    result = body
    for start, end, replacement in sorted(edits, key=lambda edit: edit[0], reverse=True):
        result = result[:start] + replacement + result[end:]
    return result


def dark_signal_selector(selector_parts):
    """`sel` under the four class-based dark signals, formatted like 10-fixes-dark.css."""
    groups = [", ".join(f"{prefix} {part}" for part in selector_parts)
              for prefix in DARK_SIGNAL_PREFIXES]
    return ", ".join(groups[:-1]) + ",\n" + groups[-1]


def guarded_media_selector(selector_parts):
    return ", ".join(f"{MEDIA_GUARD_PREFIX} {part}" for part in selector_parts)


def guard_media_rule_selector(selector):
    """Add the zero-specificity `.bp3-light` opt-out to an unguarded media rule."""
    parts = split_selector(selector)
    guarded = []
    changed = False
    for part in parts:
        head = part.split()[0] if part.split() else part
        if "bp3-light" in part:
            guarded.append(part)
            continue
        if head.startswith(("html", ":root", "*")):
            # Already anchored at the root element, so intersect instead of nesting —
            # still through :where(), because a bare :not() would add a class to the
            # specificity and let `html` start beating `:root` rules it loses to today.
            guarded.append(re.sub(r"^(html|:root|\*)", r"\1:where(:not(.bp3-light))",
                                  part, count=1))
        else:
            guarded.append(f"{MEDIA_GUARD_WHERE} {part}")
        changed = True
    return (", ".join(guarded) if changed else selector), changed


def build_token_header(tokens):
    """The three token blocks that carry every collapsed light/dark pair."""
    light = "".join(f"  {name}: {light_value};\n" for name, light_value, _ in tokens)
    dark = "".join(f"  {name}: {dark_value};\n" for name, _, dark_value in tokens)
    media = "".join(f"    {name}: {dark_value};\n" for name, _, dark_value in tokens)
    return (
        "\n/* === CASCADE COLLAPSE ===============================================\n"
        " * Generated by tools/cascade_collapse.py — do not hand-edit this block.\n"
        " *\n"
        f" * {len(tokens)} tokens replace upstream's four-copy light/dark cascade. Each base rule\n"
        " * below reads its mode-varying declarations through `var(--svy-b<group>-<prop>,\n"
        " * <light literal>)`, so the sheet still renders light with this block removed.\n"
        " *\n"
        " * Dark is redefined under all four class signals plus the OS-preference arm. The\n"
        " * OS arm is guarded by :not(.bp3-light): src/dm-toggle.js measures Roam's rendered\n"
        " * background in auto mode and stamps .bp3-light when Roam is actually light, so an\n"
        " * OS-dark machine running a light Roam is not painted dark.\n"
        " */\n"
        ":root {\n" + light + "}\n\n"
        ":root.bp3-dark, body.bt-theme-dark, .rm-dark-theme,\n"
        "body.roam-body.dark {\n" + dark + "}\n\n"
        "@media (prefers-color-scheme: dark) {\n"
        "  " + MEDIA_GUARD_PREFIX + " {\n" + media + "  }\n}\n"
        "/* === END CASCADE COLLAPSE =========================================== */\n"
    )


# ------------------------------------------------------------------ equivalence oracle

# Modes the collapse must leave bit-identical. `.bp3-light`+OS-dark and the three
# non-Blueprint dark signals are the two states it deliberately changes, and are checked
# separately by expect_intended_changes.
INVARIANT_MODES = (
    ("light", False, False, False),          # nothing stamped, OS light
    ("forced-light", False, True, False),    # .bp3-light, OS light
    ("forced-dark", True, False, False),     # .bp3-dark, OS light
    ("auto-dark", False, False, True),       # nothing stamped, OS dark
    ("forced-dark+os-dark", True, False, True),
)

VAR_CALL = re.compile(r"^var\((--[\w-]+),\s*(.*)\)$", re.S)


def _resolve(value, token_values):
    match = VAR_CALL.match(value.strip())
    if not match:
        return value
    name, fallback = match.group(1), match.group(2)
    return token_values.get(name, fallback)


def _cascade_winner(applicable, token_values):
    """Winning value per property among one family's rules, in cascade order."""
    winners = {}
    for rank, order, declarations in sorted(applicable, key=lambda item: (item[0], item[1])):
        for declaration in declarations:
            previous = winners.get(declaration.prop)
            if previous and previous[0] and not declaration.important:
                continue
            winners[declaration.prop] = (declaration.important,
                                         _resolve(declaration.value, token_values))
    return {prop: value for prop, (_important, value) in winners.items()}


def _family_state(base, light, dark, media, mode, token_values):
    # The five invariant modes never combine .bp3-light with OS-dark, which is the only
    # state the media guard changes, so the guard does not enter this comparison.
    _name, is_dark_class, is_light_class, is_os_dark = mode
    applicable = [(0, 0, base)] if base is not None else []
    if light is not None and is_light_class:
        applicable.append((1, 1, light))
    if dark is not None and is_dark_class:
        applicable.append((1, 2, dark))
    if media is not None and is_os_dark:
        applicable.append((0, 3, media))
    return _cascade_winner(applicable, token_values)


def parse_token_blocks(header):
    """Read the emitted header back and return (light map, dark map, media map)."""
    maps = []
    for rule, _context in walk_rules(parse(header)):
        declarations = parse_declarations(rule.body) or []
        maps.append({declaration.prop: declaration.value for declaration in declarations})
    if len(maps) != 3:
        raise SystemExit(f"token header should hold exactly three rules, found {len(maps)}")
    return maps


def verify_family_equivalence(runs, classifications, replacements, deletions, header):
    """Prove every four-copy family resolves identically in the five invariant modes.

    Old and new are compared from the actual emitted declaration text, so the check
    covers the bytes that get written rather than the transform's intent.
    """
    light_tokens, dark_tokens, media_tokens = parse_token_blocks(header)
    if set(light_tokens) != set(dark_tokens) or dark_tokens != media_tokens:
        raise SystemExit("token blocks disagree on their token set or dark values")

    failures = []
    for index, (run, verdict) in enumerate(zip(runs, classifications)):
        old = {
            "base": parse_declarations(run["base"].body),
            "light": parse_declarations(run["light"].body),
            "dark": parse_declarations(run["dark"].body),
            "media": parse_declarations(run["media"].body),
        }
        if any(value is None for value in old.values()):
            continue

        collapsed = verdict["classification"].startswith("collapse")
        emitted_base = replacements.get(run["base_index"], run["base"])
        new = {
            "base": parse_declarations(emitted_base.body),
            "light": None if collapsed else old["light"],
            "dark": None if collapsed else old["dark"],
            "media": None if collapsed else parse_declarations(run["media"].body),
        }
        for mode in INVARIANT_MODES:
            _name, is_dark_class, _is_light_class, is_os_dark = mode
            active = dark_tokens if (is_dark_class or is_os_dark) else light_tokens
            before = _family_state(old["base"], old["light"], old["dark"], old["media"],
                                   mode, {})
            after = _family_state(new["base"], new["light"], new["dark"], new["media"],
                                  mode, active)
            if before != after:
                failures.append({
                    "group": index + 1,
                    "selector": run["key"],
                    "mode": mode[0],
                    "before": {k: v for k, v in before.items() if after.get(k) != v},
                    "after": {k: v for k, v in after.items() if before.get(k) != v},
                })
    return failures


def collapse(css):
    nodes = parse(css)
    if serialize(nodes) != css:
        raise SystemExit("parser round-trip failed on the input sheet; refusing to transform")

    runs = find_runs(nodes)
    classifications = []
    for run in runs:
        classification, mapping, unmapped, reason = classify_run(run)
        classifications.append({
            "classification": classification,
            "mapping": mapping,
            "unmapped": unmapped,
            "reason": reason,
        })

    hazards = scan_specificity_hazards(nodes, runs, classifications)
    for index, hazard in hazards.items():
        classifications[index]["classification"] = "keep-hazard"
        classifications[index]["reason"] = (
            f"later rule `{hazard['selector']}` in {hazard['layer']} sits between the base "
            "and .bp3-dark specificities"
        )

    tokens = []
    replacements = {}
    deletions = set()
    insertions = {}
    report_entries = []

    for group, (run, verdict) in enumerate(zip(runs, classifications), start=1):
        classification = verdict["classification"]
        entry = {
            "group": group,
            "selector": run["key"],
            "classification": classification,
            "tokens": [],
        }
        if verdict["reason"]:
            entry["reason"] = verdict["reason"]

        if not classification.startswith("collapse"):
            report_entries.append(entry)
            continue

        edits = []
        for base_declaration, dark_declaration in verdict["mapping"]:
            if base_declaration.value == dark_declaration.value:
                continue
            name = token_name(group, base_declaration.prop)
            tokens.append((name, base_declaration.value, dark_declaration.value))
            edits.append((
                base_declaration.value_start,
                base_declaration.value_end,
                f"var({name}, {base_declaration.value})",
            ))
            entry["tokens"].append({
                "name": name,
                "property": base_declaration.prop,
                "light": base_declaration.value,
                "dark": dark_declaration.value,
            })

        if edits:
            replacements[run["base_index"]] = Rule(
                run["base"].prelude,
                run["base"].open_brace,
                splice_values(run["base"].body, edits),
                run["base"].close_brace,
            )
        deletions.update({run["light_index"], run["dark_index"], run["media_index"]})

        if classification == "collapse-partial":
            parts = split_selector(run["base"].selector)
            residual = render_declarations(verdict["unmapped"], "  ")
            residual_media = render_declarations(verdict["unmapped"], "    ")
            insertions[run["media_index"]] = [
                Rule("\n" + dark_signal_selector(parts) + " ", "{", "\n" + residual, "}"),
                AtBlock(
                    "\n" + DARK_MEDIA + " ",
                    "{",
                    [Rule("\n  " + guarded_media_selector(parts) + " ", "{",
                          "\n" + residual_media + "  ", "}"),
                     Raw("\n")],
                    "}",
                ),
            ]
            entry["residual_declarations"] = [declaration.prop for declaration in verdict["unmapped"]]

        report_entries.append(entry)

    # Every dark media rule we did not delete gets the .bp3-light opt-out, so a single
    # stamp suppresses OS-dark everywhere rather than only in the collapsed rules.
    guarded_media = 0
    for index, node in enumerate(nodes):
        if index in deletions or node.kind != "at" or node.condition != DARK_MEDIA:
            continue
        for child in node.children:
            if child.kind != "rule" or child.at_rule:
                continue
            guarded, changed = guard_media_rule_selector(child.selector)
            if not changed:
                continue
            before = [specificity(part) for part in split_selector(child.selector)]
            after = [specificity(part) for part in split_selector(guarded)]
            if before != after:
                raise SystemExit(
                    f"guarding changed specificity: {child.selector!r} {before} -> {after}"
                )
            child.set_selector(guarded)
            guarded_media += 1

    header = build_token_header(tokens)
    failures = verify_family_equivalence(runs, classifications, replacements, deletions, header)
    if failures:
        raise SystemExit(
            "cascade equivalence failed in "
            f"{len(failures)} family/mode pairs, first: {json.dumps(failures[0], indent=2)}"
        )

    output = []
    for index, node in enumerate(nodes):
        if index in deletions:
            output.extend(insertions.get(index, []))
            continue
        output.append(replacements.get(index, node))

    for position, node in enumerate(output):
        if node.kind == "statement" and node.text.strip().startswith("@charset"):
            output.insert(position + 1, Raw(header))
            break
    else:
        output.insert(0, Raw(header.lstrip("\n")))

    result = serialize(output)
    if serialize(parse(result)) != result:
        raise SystemExit("the emitted sheet does not round-trip; refusing to write")
    return result, runs, classifications, tokens, report_entries, guarded_media


def rule_count(css):
    return sum(1 for rule, _ in walk_rules(parse(css)) if not rule.at_rule)


def selector_part_count(css):
    return sum(len(split_selector(rule.selector))
               for rule, _ in walk_rules(parse(css)) if not rule.at_rule)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true",
                        help="verify the parser round-trips every layer, then exit")
    parser.add_argument("--dry-run", action="store_true",
                        help="run the transform and print the report without writing")
    parser.add_argument("--source", default=SOURCE)
    parser.add_argument("--report", default=REPORT)
    arguments = parser.parse_args()

    if arguments.check:
        failures = []
        for filename in sorted(os.listdir(LAYER_DIRECTORY)):
            if not filename.endswith(".css"):
                continue
            path = os.path.join(LAYER_DIRECTORY, filename)
            css = open(path, encoding="utf-8").read()
            if serialize(parse(css)) != css:
                failures.append(filename)
        if failures:
            raise SystemExit("round-trip failed: " + ", ".join(failures))
        print("round-trip exact on every src/css layer")
        return

    css = open(arguments.source, encoding="utf-8").read()
    result, runs, classifications, tokens, entries, guarded_media = collapse(css)

    counts = {}
    for verdict in classifications:
        counts[verdict["classification"]] = counts.get(verdict["classification"], 0) + 1

    report = {
        "generator": "tools/cascade_collapse.py",
        "source": os.path.relpath(arguments.source, REPOSITORY),
        "four_copy_runs": len(runs),
        "distinct_selector_keys": len({run["key"] for run in runs}),
        "classification_counts": counts,
        "tokens": len(tokens),
        "guarded_media_rules": guarded_media,
        "before": {
            "bytes": len(css.encode("utf-8")),
            "rules": rule_count(css),
            "selector_parts": selector_part_count(css),
        },
        "after": {
            "bytes": len(result.encode("utf-8")),
            "rules": rule_count(result),
            "selector_parts": selector_part_count(result),
        },
        "groups": entries,
    }

    if arguments.dry_run:
        summary = dict(report)
        summary.pop("groups")
        print(json.dumps(summary, indent=2))
        return

    with open(arguments.source, "w", encoding="utf-8") as handle:
        handle.write(result)
    os.makedirs(os.path.dirname(arguments.report), exist_ok=True)
    with open(arguments.report, "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)
        handle.write("\n")
    summary = dict(report)
    summary.pop("groups")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
