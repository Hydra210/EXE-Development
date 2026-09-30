# EXE Development — Open Graph tag injector
#
# Drop this file in next to main.py. It reads a page's HTML off disk and
# injects an OG meta block right before </head> so link previews (Discord,
# Twitter, Slack, iMessage, etc.) render properly. Those crawlers don't run
# JS, so this only works because it's injected into the raw HTML that gets
# served — not added client-side.
#
# To add OG tags to another page later, just add another entry to OG_TAGS
# below and call inject_og(html, "/path-key") in that route.

def _og(title: str, desc: str, path: str) -> str:
    return f"""
<meta property="og:type" content="website" />
<meta property="og:title" content="{title}" />
<meta property="og:description" content="{desc}" />
<meta property="og:image" content="https://exedevelopement.com/static/og-image.png" />
<meta property="og:url" content="https://exedevelopement.com{path}" />
<meta name="theme-color" content="#0a0a0a" />
<meta name="twitter:card" content="summary_large_image" />
""".strip()


HOMEPAGE_OG = """
<meta property="og:type" content="website" />
<meta property="og:title" content="EXE Development" />
<meta property="og:description" content="We build tools you want." />
<meta property="og:image" content="https://exedevelopement.com/static/og-image.png" />
<meta property="og:url" content="https://exedevelopement.com/" />
<meta name="theme-color" content="#0a0a0a" />
<meta name="twitter:card" content="summary_large_image" />
""".strip()

# path -> tag block, so more pages can be added here later
OG_TAGS: dict[str, str] = {
    "/": HOMEPAGE_OG,
    "/sentinel": _og("Sentinel | EXE Development", "Roblox asset moderation that flags problem assets before they reach players.", "/sentinel"),
    "/about": _og("About | EXE Development", "Independent studio building useful tools for Roblox developers.", "/about"),
    "/contact": _og("Contact | EXE Development", "Request a tool or ask about a project.", "/contact"),
}


def inject_og(html: str, path: str) -> str:
    """Insert this path's OG block right before </head>. No-op if the path
    has no entry, or if </head> isn't found (fails safe, page still loads)."""
    tags = OG_TAGS.get(path)
    if not tags or "</head>" not in html:
        return html
    return html.replace("</head>", f"{tags}\n</head>", 1)
