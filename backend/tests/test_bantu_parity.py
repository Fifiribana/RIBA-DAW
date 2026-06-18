"""
Parity test between backend `_build_bantu_grid` (server.py) and frontend
`computeBantuGrid` (bantuGrid.js). Markers shown on the Timeline MUST
align byte-for-byte with the timestamps the backend will quantize MIDI
notes to, otherwise the user sees one position visually but the snap
target is different.

Strategy:
 - For each style x (density, bars) combo we ask both implementations
   for the array of positions, then assert element-wise within 1e-4.
 - JS is invoked via node -e and prints JSON; Python is called directly.
"""
import json
import math
import subprocess
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))
from server import _build_bantu_grid  # noqa: E402

JS_FILE = (
    BACKEND_DIR.parent
    / "frontend"
    / "src"
    / "lib"
    / "bantuGrid.js"
)

STYLES = [
    "asiko_wisdom",
    "makossa_roots",
    "bikutsi_44",
    "bikutsi_68",
    "bikutsi_1224",
]

# Cover variety: typical UI defaults + edge cases
CASES = [
    (16, 4),    # default in BantuGridModal
    (16, 1),    # what BantuTeaser uses
    (32, 8),    # dense long pattern
    (8, 2),     # short small grid
    (24, 6),    # 6/8 multiple
]


def _run_js(style: str, density: int, bars: float):
    """Invoke node to compute the JS grid and return list[float]."""
    script = (
        f"import('{JS_FILE.as_posix()}').then(m => {{"
        f"  const out = m.computeBantuGrid('{style}', {density}, {bars});"
        f"  process.stdout.write(JSON.stringify(out));"
        f"}}).catch(e => {{ console.error(e); process.exit(1); }});"
    )
    res = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        capture_output=True,
        text=True,
        timeout=15,
        check=False,
    )
    if res.returncode != 0:
        raise RuntimeError(f"node failed: {res.stderr}")
    return json.loads(res.stdout)


@pytest.mark.parametrize("style", STYLES)
@pytest.mark.parametrize("density,bars", CASES)
def test_bantu_grid_parity(style, density, bars):
    py_out, _ = _build_bantu_grid(style, density, bars)
    js_out = _run_js(style, density, bars)

    assert py_out is not None, f"backend returned None for {style}"
    assert len(py_out) == len(js_out), (
        f"length mismatch for {style} d={density} bars={bars}: "
        f"py={len(py_out)} js={len(js_out)}"
    )
    for i, (p, j) in enumerate(zip(py_out, js_out)):
        assert math.isclose(p, j, abs_tol=1e-4), (
            f"{style} d={density} bars={bars} pos[{i}]: "
            f"py={p} js={j} delta={abs(p - j)}"
        )


def test_js_module_resolves():
    """Sanity: confirm node can find the JS module."""
    out = _run_js("asiko_wisdom", 4, 1)
    assert isinstance(out, list)
    assert len(out) == 4
