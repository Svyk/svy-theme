"""Guard every OS-dark media rule in the base layer against an explicit .bp3-light stamp.

src/css/00-upstream-base.css ships ~650 rules inside ``@media (prefers-color-scheme:
dark)`` blocks that fire on an OS-dark machine even when the user (or src/dm-toggle.js's
auto-mode measurement) has stamped ``.bp3-light`` on documentElement — an OS-dark +
forced-light leak. This tool rewrites each such rule's selector with a zero-specificity
opt-out so the explicit stamp always wins:

    <sel>            ->  :where(:root:not(.bp3-light)) <sel>
    html <sel>       ->  html:where(:not(.bp3-light)) <sel>     (same for :root / *)

``:where()`` contributes nothing to specificity, so every guarded rule keeps the exact
weight upstream shipped; the tool asserts that per selector part and refuses to write
otherwise. Selectors that already mention ``bp3-light`` (pre-guarded, or this tool's own
output on a re-run) are left untouched, which is also what makes the tool byte-idempotent.

Usage: python3 tools/guard_media.py [--check]

Correctness anchors (ported from tools/cascade_collapse.py, experiment branch
cascade-collapse-d54bbe5):
  * tools/cssnodes.py round-trip — serialize(parse(css)) == css before and after.
  * Per-part specificity equality, asserted before any write.
"""

import argparse
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from cssnodes import parse, serialize, split_selector, walk_rules  # noqa: E402

REPOSITORY = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(REPOSITORY, "src", "css", "00-upstream-base.css")

DARK_MEDIA = "@media (prefers-color-scheme: dark)"

# Zero-specificity guard: it changes the match set only by excluding an explicit
# .bp3-light stamp, and leaves specificity and source order exactly as upstream shipped.
MEDIA_GUARD_WHERE = ":where(:root:not(.bp3-light))"

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
    text = selector
    index = 0
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


def guard(css):
    """Guard every dark-media rule in ``css``. Returns (result, report_dict)."""
    nodes = parse(css)
    if serialize(nodes) != css:
        raise SystemExit("parser round-trip failed on the input sheet; refusing to transform")

    media_blocks = 0
    media_rules = 0
    guarded_rules = 0
    guarded_parts = 0
    skipped_parts = 0

    for node in nodes:
        if node.kind != "at" or node.condition != DARK_MEDIA:
            continue
        media_blocks += 1
        for child in node.children:
            if child.kind != "rule" or child.at_rule:
                continue
            media_rules += 1
            guarded, changed = guard_media_rule_selector(child.selector)
            if not changed:
                skipped_parts += len(split_selector(child.selector))
                continue
            before = [specificity(part) for part in split_selector(child.selector)]
            after = [specificity(part) for part in split_selector(guarded)]
            if before != after:
                raise SystemExit(
                    f"guarding changed specificity: {child.selector!r} {before} -> {after}"
                )
            child.set_selector(guarded)
            guarded_rules += 1
            guarded_parts += sum(1 for part in split_selector(guarded) if "bp3-light" in part)

    result = serialize(nodes)
    if serialize(parse(result)) != result:
        raise SystemExit("the guarded sheet does not round-trip; refusing to write")

    # Post-condition: no unguarded selector part may remain in any dark media block.
    for rule, context in walk_rules(parse(result)):
        if rule.at_rule or DARK_MEDIA not in context:
            continue
        for part in split_selector(rule.selector):
            if "bp3-light" not in part:
                raise SystemExit(f"unguarded dark media selector survived: {part!r}")

    report = {
        "media_blocks": media_blocks,
        "media_rules": media_rules,
        "guarded_rules": guarded_rules,
        "guarded_parts": guarded_parts,
        "already_guarded_parts": skipped_parts,
        "specificity_preserved": True,
    }
    return result, report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true",
                        help="verify the sheet is fully guarded without writing")
    arguments = parser.parse_args()

    with open(SOURCE, encoding="utf-8") as handle:
        css = handle.read()

    result, report = guard(css)
    report["changed"] = result != css
    print(json.dumps(report, indent=2))

    if arguments.check:
        if result != css:
            raise SystemExit("dark media rules are not fully guarded; run tools/guard_media.py")
        return
    if result != css:
        with open(SOURCE, "w", encoding="utf-8") as handle:
            handle.write(result)


if __name__ == "__main__":
    main()
