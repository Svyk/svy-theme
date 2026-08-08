"""Offset-exact CSS tree.

Every byte of the source belongs to exactly one node, so ``serialize(parse(css))``
reproduces the input byte-for-byte. That round-trip is the correctness anchor for
tools/cascade_collapse.py: a transform is only trusted once the untouched parse
round-trips exactly.

Modelled on the parser used for the read-only cascade characterization (offset-exact,
validated 2,646/2,646 against Chrome DevTools coverage byte offsets).
"""

import re

# At-rules whose block contains further rules (as opposed to declarations or
# opaque keyframe selectors, which stay raw).
NESTING_AT_RULES = re.compile(
    r"@(?:media|supports|document|-moz-document|layer|scope|container)\b", re.I
)


class Raw:
    """Whitespace, comments, or any span we do not interpret."""

    kind = "raw"

    def __init__(self, text):
        self.text = text

    def render(self):
        return self.text


def leading_trivia_length(prelude):
    """Length of the whitespace-and-comment prefix in a prelude.

    A prelude runs from the previous rule's ``}`` to this rule's ``{``, so it carries any
    comment that sits above the rule. Those comments must not be read as part of the
    selector — a commented-out block of CSS would otherwise inject braces and commas into
    the selector text and make the rule unrecognisable.
    """
    index = 0
    length = len(prelude)
    while index < length:
        if prelude[index].isspace():
            index += 1
            continue
        if prelude.startswith("/*", index):
            end = prelude.find("*/", index + 2)
            if end == -1:
                return length
            index = end + 2
            continue
        break
    return index


class Rule:
    """A style rule (or an opaque at-rule block such as @font-face/@keyframes)."""

    kind = "rule"

    def __init__(self, prelude, open_brace, body, close_brace, at_rule=False):
        self.prelude = prelude          # raw text before "{", leading trivia included
        self.open_brace = open_brace    # always "{"
        self.body = body                # raw text between the braces
        self.close_brace = close_brace  # "}" or "" when the source truncated
        self.at_rule = at_rule

    @property
    def selector(self):
        return self.prelude[leading_trivia_length(self.prelude):].strip()

    def set_selector(self, selector):
        """Rewrite the selector, preserving the leading trivia and the space before `{`."""
        lead = leading_trivia_length(self.prelude)
        raw = self.prelude[lead:]
        trailing = raw[len(raw.rstrip()):]
        self.prelude = self.prelude[:lead] + selector + trailing

    def render(self):
        return self.prelude + self.open_brace + self.body + self.close_brace


class AtBlock:
    """A nesting at-rule: prelude { children }."""

    kind = "at"

    def __init__(self, prelude, open_brace, children, close_brace):
        self.prelude = prelude
        self.open_brace = open_brace
        self.children = children
        self.close_brace = close_brace

    @property
    def condition(self):
        return self.prelude[leading_trivia_length(self.prelude):].strip()

    def render(self):
        return (
            self.prelude
            + self.open_brace
            + "".join(child.render() for child in self.children)
            + self.close_brace
        )


class Statement:
    """A semicolon-terminated at-statement such as @charset or @import."""

    kind = "statement"

    def __init__(self, text):
        self.text = text

    def render(self):
        return self.text


def _skip_string(text, index):
    """Return the index just past the string literal starting at ``index``."""
    quote = text[index]
    index += 1
    length = len(text)
    while index < length:
        char = text[index]
        if char == "\\":
            index += 2
            continue
        index += 1
        if char == quote:
            break
    return index


def _skip_comment(text, index):
    end = text.find("*/", index + 2)
    return len(text) if end == -1 else end + 2


def parse(css):
    """Parse ``css`` into a node list covering every byte."""
    nodes, _ = _parse_block(css, 0, top_level=True)
    return nodes


def _parse_block(css, index, top_level):
    """Parse nodes until the matching ``}`` (or end of input at top level)."""
    nodes = []
    length = len(css)
    prelude_start = index
    while index < length:
        char = css[index]
        if char == "/" and css.startswith("/*", index):
            index = _skip_comment(css, index)
            continue
        if char in "\"'":
            index = _skip_string(css, index)
            continue
        if char == ";":
            prelude = css[prelude_start:index + 1]
            if prelude.strip():
                nodes.append(Statement(prelude))
            else:
                nodes.append(Raw(prelude))
            index += 1
            prelude_start = index
            continue
        if char == "}":
            if top_level:
                # Stray brace: keep it verbatim so the round-trip still holds.
                nodes.append(Raw(css[prelude_start:index + 1]))
                index += 1
                prelude_start = index
                continue
            trailing = css[prelude_start:index]
            if trailing:
                nodes.append(Raw(trailing))
            return nodes, index
        if char == "{":
            prelude = css[prelude_start:index]
            stripped = prelude[leading_trivia_length(prelude):].strip()
            if stripped.startswith("@") and NESTING_AT_RULES.match(stripped):
                children, close_index = _parse_block(css, index + 1, top_level=False)
                close = "}" if close_index < length else ""
                nodes.append(AtBlock(prelude, "{", children, close))
                index = close_index + 1
                prelude_start = index
                continue
            body_end = _scan_to_close(css, index + 1)
            body = css[index + 1:body_end]
            close = "}" if body_end < length else ""
            nodes.append(Rule(prelude, "{", body, close, at_rule=stripped.startswith("@")))
            index = body_end + 1
            prelude_start = index
            continue
        index += 1

    trailing = css[prelude_start:]
    if trailing:
        nodes.append(Raw(trailing))
    return nodes, index


def _scan_to_close(css, index):
    """Index of the ``}`` closing a leaf block that starts at ``index``."""
    depth = 1
    length = len(css)
    while index < length:
        char = css[index]
        if char == "/" and css.startswith("/*", index):
            index = _skip_comment(css, index)
            continue
        if char in "\"'":
            index = _skip_string(css, index)
            continue
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return index
        index += 1
    return length


def serialize(nodes):
    return "".join(node.render() for node in nodes)


def walk_rules(nodes, context=()):
    """Yield ``(rule, context)`` for every leaf rule, context = at-rule preludes."""
    for node in nodes:
        if node.kind == "rule":
            yield node, context
        elif node.kind == "at":
            yield from walk_rules(node.children, context + (node.condition,))


def split_selector(selector):
    """Split a selector list on top-level commas."""
    parts = []
    depth = 0
    start = 0
    index = 0
    length = len(selector)
    while index < length:
        char = selector[index]
        if char in "\"'":
            index = _skip_string(selector, index)
            continue
        if char in "([":
            depth += 1
        elif char in ")]":
            depth -= 1
        elif char == "," and depth == 0:
            parts.append(selector[start:index].strip())
            start = index + 1
        index += 1
    tail = selector[start:].strip()
    if tail:
        parts.append(tail)
    return parts


class Declaration:
    """One declaration plus the exact span its value occupies in the rule body.

    Equality is the (property, value, important) triple, so two rules can be compared
    without their formatting mattering; the span exists so a transform can splice a new
    value into the original body instead of re-rendering it (which would drop comments
    and normalise whitespace).
    """

    __slots__ = ("prop", "value", "important", "value_start", "value_end")

    def __init__(self, prop, value, important, value_start, value_end):
        self.prop = prop
        self.value = value
        self.important = important
        self.value_start = value_start
        self.value_end = value_end

    def triple(self):
        return (self.prop, self.value, self.important)

    def __eq__(self, other):
        if isinstance(other, Declaration):
            return self.triple() == other.triple()
        return self.triple() == other

    def __hash__(self):
        return hash(self.triple())

    def __repr__(self):
        return f"Declaration{self.triple()!r}"


def parse_declarations(body):
    """Split a declaration block into :class:`Declaration` objects.

    Returns ``None`` when the block contains anything we do not model (a nested
    block), so callers can fall back to leaving the rule untouched.
    """
    declarations = []
    depth = 0
    start = 0
    index = 0
    length = len(body)
    while index < length:
        char = body[index]
        if char == "/" and body.startswith("/*", index):
            index = _skip_comment(body, index)
            continue
        if char in "\"'":
            index = _skip_string(body, index)
            continue
        if char in "([":
            depth += 1
        elif char in ")]":
            depth -= 1
        elif char == "{":
            return None
        elif char == ";" and depth == 0:
            declaration = _split_declaration(body, start, index)
            if declaration:
                declarations.append(declaration)
            start = index + 1
        index += 1
    declaration = _split_declaration(body, start, length)
    if declaration:
        declarations.append(declaration)
    return declarations


def _split_declaration(body, start, end):
    segment = body[start:end]
    if not _strip_comments(segment).strip():
        return None
    colon = _top_level_colon(segment)
    if colon is None:
        return None
    prop = _strip_comments(segment[:colon]).strip()
    if not prop:
        return None

    value_start = start + colon + 1
    value_end = end
    important = False
    match = re.search(r"!\s*important\s*$", segment.rstrip(), re.I)
    if match:
        important = True
        value_end = start + match.start()

    while value_start < value_end and body[value_start].isspace():
        value_start += 1
    while value_end > value_start and body[value_end - 1].isspace():
        value_end -= 1
    return Declaration(prop, body[value_start:value_end], important, value_start, value_end)


def _top_level_colon(text):
    depth = 0
    index = 0
    length = len(text)
    while index < length:
        char = text[index]
        if char == "/" and text.startswith("/*", index):
            index = _skip_comment(text, index)
            continue
        if char in "\"'":
            index = _skip_string(text, index)
            continue
        if char in "([":
            depth += 1
        elif char in ")]":
            depth -= 1
        elif char == ":" and depth == 0:
            return index
        index += 1
    return None


def _strip_comments(text):
    out = []
    index = 0
    length = len(text)
    while index < length:
        if text.startswith("/*", index):
            index = _skip_comment(text, index)
            continue
        if text[index] in "\"'":
            end = _skip_string(text, index)
            out.append(text[index:end])
            index = end
            continue
        out.append(text[index])
        index += 1
    return "".join(out)
