"""Small text helpers shared by the summary and the note previews."""


def shorten(text: str, limit: int) -> str:
    """Collapse whitespace and cut to at most `limit` characters, at a word, with an ellipsis."""
    text = " ".join(text.split())
    if len(text) <= limit:
        return text
    return text[:limit].rsplit(" ", 1)[0].rstrip(".,;:") + "…"
