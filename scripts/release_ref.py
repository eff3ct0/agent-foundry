"""Validation shared by the release bootstrap harness and reporter."""
import re


TAG_PATTERN = re.compile(r"[A-Za-z0-9][A-Za-z0-9._/+@-]{0,119}")


def validate_tag(tag):
    if not isinstance(tag, str):
        raise ValueError("tag must be a safe non-empty Git ref")
    tag = tag.strip()
    components = tag.split("/")
    if (not TAG_PATTERN.fullmatch(tag) or tag == "@" or ".." in tag or "//" in tag or "@{" in tag or
            tag.endswith((".", "/", ".lock")) or any(component.startswith(".") or component.endswith(".")
                                                       for component in components)):
        raise ValueError("tag must be a safe non-empty Git ref")
    return tag
