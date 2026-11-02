"""Generate Summarevent logo concepts (black first, per the logo-design skill).

A  e-Sobek   : lowercase e built from a ticket – the aperture is a ticket notch,
               the crossbar is a tear (perforation) line.
B  Tiket S   : a ticket card whose two opposed notches carve an S.
C  Denah e   : a lowercase e laid out as a seat map; one seat is "yours".

Wordmark "summarevent" is outlined from Plus Jakarta Sans (SIL OFL) at weight 760.
"""
import math, os, sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

OUT = os.path.dirname(os.path.abspath(__file__))
FONT = sys.argv[1]
INK = "#111111"


def f(n):
    return f"{n:.2f}".rstrip("0").rstrip(".")


def svg(viewbox, body, title):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}" role="img" aria-labelledby="title">'
        f'<title id="title">{title}</title>{body}</svg>\n'
    )


def circle_intersections(c0, r0, c1, r1):
    (x0, y0), (x1, y1) = c0, c1
    d = math.hypot(x1 - x0, y1 - y0)
    a = (r0 * r0 - r1 * r1 + d * d) / (2 * d)
    h = math.sqrt(max(0.0, r0 * r0 - a * a))
    xm, ym = x0 + a * (x1 - x0) / d, y0 + a * (y1 - y0) / d
    p1 = (xm + h * (y1 - y0) / d, ym - h * (x1 - x0) / d)
    p2 = (xm - h * (y1 - y0) / d, ym + h * (x1 - x0) / d)
    return p1, p2


# ---------------------------------------------------------------- A: e-Sobek
def concept_a(fill_ring=INK, fill_bar=INK):
    C = (128.0, 128.0)
    R, r = 108.0, 62.0          # ring: stroke 46
    bar_h = 30.0                # crossbar thickness
    # notch (ticket bite) on the lower right, just under the crossbar
    # the bite must cut through the whole ring: centre distance - rb < r and + rb > R
    ang = math.radians(38)
    B = (C[0] + 100 * math.cos(ang), C[1] + 100 * math.sin(ang))
    rb = 46.0
    assert 100 - rb < r and 100 + rb > R
    o1, o2 = circle_intersections(C, R, B, rb)
    i1, i2 = circle_intersections(C, r, B, rb)
    # order: the "upper" point has smaller y
    o_top, o_bot = sorted([o1, o2], key=lambda p: p[1])
    i_top, i_bot = sorted([i1, i2], key=lambda p: p[1])
    # Ring minus bite: outer arc from o_top the long way (counter-clockwise on screen) to o_bot,
    # notch arc to i_bot, inner arc back the long way to i_top, notch arc to o_top.
    d = (
        f"M{f(o_top[0])} {f(o_top[1])}"
        f"A{f(R)} {f(R)} 0 1 0 {f(o_bot[0])} {f(o_bot[1])}"
        f"A{f(rb)} {f(rb)} 0 0 0 {f(i_bot[0])} {f(i_bot[1])}"
        f"A{f(r)} {f(r)} 0 1 1 {f(i_top[0])} {f(i_top[1])}"
        f"A{f(rb)} {f(rb)} 0 0 0 {f(o_top[0])} {f(o_top[1])}Z"
    )
    # crossbar = perforation: a dotted tear line of 5 holes-as-dots across the counter
    y = C[1]
    n, dot = 5, 22.0
    span = 2 * r - 20
    step = (span - dot) / (n - 1)
    x_first = C[0] - span / 2 + dot / 2
    dots = "".join(f'<circle cx="{f(x_first + k * step)}" cy="{f(y)}" r="{f(dot / 2)}"/>' for k in range(n))
    return f'<path fill="{fill_ring}" d="{d}"/><g fill="{fill_bar}">{dots}</g>'


# ---------------------------------------------------------------- B: Tiket S
def concept_b(fill=INK):
    assert True
    """Ticket card; two slots that start as ticket notches carve an S (upper-right, lower-left)."""
    x0, x1, y0, y1, rc = 32.0, 224.0, 16.0, 240.0, 40.0
    h = 48.0                 # slot height (= notch diameter)
    rh = h / 2
    spine = 56.0             # stroke of the S
    ya, yb = 82.0, 174.0     # slot centres
    xa_end = x0 + spine + rh  # right slot runs from the right edge to here (round end)
    xb_end = x1 - spine - rh  # left slot runs from the left edge to here
    d = (
        f"M{f(x0 + rc)} {f(y0)}H{f(x1 - rc)}A{f(rc)} {f(rc)} 0 0 1 {f(x1)} {f(y0 + rc)}"
        f"V{f(ya - rh)}H{f(xa_end)}A{f(rh)} {f(rh)} 0 0 0 {f(xa_end)} {f(ya + rh)}H{f(x1)}"
        f"V{f(y1 - rc)}A{f(rc)} {f(rc)} 0 0 1 {f(x1 - rc)} {f(y1)}"
        f"H{f(x0 + rc)}A{f(rc)} {f(rc)} 0 0 1 {f(x0)} {f(y1 - rc)}"
        f"V{f(yb + rh)}H{f(xb_end)}A{f(rh)} {f(rh)} 0 0 0 {f(xb_end)} {f(yb - rh)}H{f(x0)}"
        f"V{f(y0 + rc)}A{f(rc)} {f(rc)} 0 0 1 {f(x0 + rc)} {f(y0)}Z"
    )
    return f'<path fill="{fill}" d="{d}"/>'


# ---------------------------------------------------------------- C: Denah e
def concept_c(fill=INK, accent=INK):
    grid = [
        ".XXX.",
        "X...X",
        "XXXXX",
        "X....",
        ".XXXA",
    ]
    s, pitch, off = 40.0, 48.0, 12.0
    seats, acc = [], ""
    for ry, row in enumerate(grid):
        for cx, ch in enumerate(row):
            if ch == ".":
                continue
            x, y = off + cx * pitch, off + ry * pitch
            rect = f'<rect x="{f(x)}" y="{f(y)}" width="{f(s)}" height="{f(s)}" rx="12"/>'
            if ch == "A":
                acc = rect
            else:
                seats.append(rect)
    return f'<g fill="{fill}">{"".join(seats)}</g><g fill="{accent}">{acc}</g>'


# ---------------------------------------------------------------- wordmark
def wordmark(font_path, text="summarevent", weight=760, cap=140.0, shared_index=6, fill=INK, shared_fill=INK, tracking=-6):
    font = TTFont(font_path)
    inst = instancer.instantiateVariableFont(font, {"wght": weight})
    gs = inst.getGlyphSet()
    cmap = inst.getBestCmap()
    upm = inst["head"].unitsPerEm
    x_height = inst["OS/2"].sxHeight or 0.52 * upm
    scale = cap / x_height  # lowercase x-height maps to `cap` units
    hmtx = inst["hmtx"]
    asc = x_height
    x = 0.0
    paths_main, paths_shared = [], []
    for i, ch in enumerate(text):
        gname = cmap[ord(ch)]
        pen = SVGPathPen(gs)
        tpen = TransformPen(pen, (scale, 0, 0, -scale, x, asc * scale))
        gs[gname].draw(tpen)
        (paths_shared if i == shared_index else paths_main).append(pen.getCommands())
        x += hmtx[gname][0] * scale + tracking
    width = x - tracking
    return paths_main, paths_shared, width, asc * scale


def write(name, viewbox, body, title):
    with open(os.path.join(OUT, name), "w") as fh:
        fh.write(svg(viewbox, body, title))


if __name__ == "__main__":
    write("a-symbol.svg", "0 0 256 256", concept_a(), "Summarevent – konsep A e-Sobek")
    write("b-symbol.svg", "0 0 256 256", concept_b(), "Summarevent – konsep B Tiket S")
    write("c-symbol.svg", "0 0 256 256", concept_c(), "Summarevent – konsep C Denah e")

    main, shared, w, xh = wordmark(FONT)
    # lockup: symbol 256 tall, wordmark x-height ~ 0.55 of symbol, baseline aligned to optical centre
    gap = 56.0
    wm_y = 128 + xh / 2  # baseline so the x-height is vertically centred on the symbol
    def wm_group(fill, shared_fill):
        return (
            f'<g transform="translate({f(256 + gap)} {f(wm_y - xh)})">'
            f'<path fill="{fill}" d="{"".join(main)}"/><path fill="{shared_fill}" d="{"".join(shared)}"/></g>'
        )
    total_w = 256 + gap + w + 8
    for key, fn in (("a", concept_a), ("b", concept_b), ("c", concept_c)):
        write(f"{key}-lockup.svg", f"0 0 {f(total_w)} 256", fn() + wm_group(INK, INK), f"Summarevent lockup {key}")
    write("wordmark.svg", f"0 0 {f(w + 8)} {f(xh * 1.62)}", f'<g transform="translate(0 {f(xh * 0.32)})"><path d="{"".join(main)}"/><path d="{"".join(shared)}"/></g>', "summarevent")
    import json
    GREEN, ORANGE, YELLOW, WHITE = "#006426", "#F26F22", "#FEDC01", "#FFFFFF"
    final = os.path.join(OUT, "final"); os.makedirs(final, exist_ok=True)
    def wfinal(name, vb, body, title):
        with open(os.path.join(final, name), "w") as fh: fh.write(svg(vb, body, title))
    wfinal("summarevent-symbol.svg", "0 0 256 256", concept_b(GREEN), "Summarevent")
    wfinal("summarevent-symbol-white.svg", "0 0 256 256", concept_b(WHITE), "Summarevent")
    wfinal("summarevent-lockup.svg", f"0 0 {f(total_w)} 256", concept_b(GREEN) + wm_group(GREEN, ORANGE), "Summarevent")
    wfinal("summarevent-lockup-white.svg", f"0 0 {f(total_w)} 256", concept_b(WHITE) + wm_group(WHITE, YELLOW), "Summarevent")
    wfinal("summarevent-wordmark.svg", f"0 0 {f(w + 8)} {f(xh * 1.62)}", f'<g transform="translate(0 {f(xh * 0.32)})"><path fill="{GREEN}" d="{"".join(main)}"/><path fill="{ORANGE}" d="{"".join(shared)}"/></g>', "summarevent")
    print("ok", round(w), round(xh))
