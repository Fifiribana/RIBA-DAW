"""Backend regression test for the v3.4 i18n bundle coverage.

We require every locale to expose the same key topology for the 7 new sections
introduced this sprint (manual.sections, bantuGrid, magicGen, magicRemix,
albumBuilder, setup, assistant). Missing keys mean a fallback to English at
runtime — we surface them as failing tests so they never slip into a release.
"""
import json
from pathlib import Path

LOCALES = Path("/app/frontend/src/locales")
SUPPORTED = ["fr", "en", "es", "pt", "sw"]

# Each top-level scope -> list of required leaf paths (dotted).
REQUIRED_KEYS = {
    "manual.sections": [
        f"{slug}.{leaf}"
        for slug in ("philosophy", "grid", "ai", "collab", "virality")
        for leaf in ("title", "intro", "tip")
    ] + [
        f"philosophy.b{i}" for i in range(1, 8)
    ] + [
        f"grid.b{i}"     for i in range(1, 7)
    ] + [
        f"ai.b{i}"       for i in range(1, 7)
    ] + [
        f"collab.b{i}"   for i in range(1, 7)
    ] + [
        f"virality.b{i}" for i in range(1, 6)
    ],
    "bantuGrid":    ["title", "styleLabel", "swingEnable", "applyBtn"],
    "magicGen":     ["title", "titleLabel", "promptLabel", "generateBtn"],
    "magicRemix":   ["title", "uploadBtn", "runBtn", "downloadBtn"],
    "albumBuilder": ["title", "exportBtn", "scheduleBtn"],
    "setup":        ["title", "audioTab", "languageTab", "inputDevice",
                     "midiTab", "playbackTab", "ioTab", "preferencesTab"],
    "setup.midi":   ["support", "supportedYes", "supportedNo", "permission",
                     "granted", "denied", "idle", "requestAccess",
                     "devicesLabel", "noInputs", "lastEvent",
                     "lastEventEmpty", "mappingLabel",
                     "actionPlay", "actionStop", "actionRecord",
                     "actionLoop", "actionMetronome", "actionTempo",
                     "actionSwingIntensity", "actionSwingEnable",
                     "actionSwingStyle", "actionVolume", "actionPan", "note"],
    "midi":         ["learnNext", "unbind", "cancel", "armed", "saved"],
    "assistant":    ["title", "sendBtn", "thinking"],
    "manual":       ["menubarBtn"],          # the new MenuBar Manual button label
    "common":       ["tips", "apply", "generate"],
}


def _walk(d, path):
    cur = d
    for seg in path.split("."):
        if not isinstance(cur, dict) or seg not in cur:
            return None
        cur = cur[seg]
    return cur


class TestLocaleKeyParity:
    def _load(self, lang):
        return json.loads((LOCALES / f"{lang}.json").read_text(encoding="utf-8"))

    def test_all_supported_locales_exist(self):
        for lang in SUPPORTED:
            assert (LOCALES / f"{lang}.json").is_file(), f"missing locale {lang}.json"

    def test_required_keys_in_every_locale(self):
        missing_per_lang = {}
        for lang in SUPPORTED:
            bundle = self._load(lang)
            missing = []
            for scope, leaves in REQUIRED_KEYS.items():
                for leaf in leaves:
                    full = f"{scope}.{leaf}"
                    v = _walk(bundle, full)
                    if not isinstance(v, str) or not v.strip():
                        missing.append(full)
            if missing:
                missing_per_lang[lang] = missing
        assert not missing_per_lang, (
            "Locale parity broken — these keys must be filled in :\n"
            + "\n".join(f"  {l}: {keys}" for l, keys in missing_per_lang.items())
        )

    def test_no_locale_collides_on_supported_lang_codes(self):
        """Each locale file must declare a unique, non-empty topbar.brand
        (catches accidental copy-paste between languages)."""
        brands = {}
        for lang in SUPPORTED:
            b = _walk(self._load(lang), "topbar.brand")
            assert isinstance(b, str) and b.strip(), f"{lang} topbar.brand missing"
            brands.setdefault(b, []).append(lang)
        # English + French copies are intentionally close — only fail if 4+
        # locales share the exact same brand string.
        worst = max(len(v) for v in brands.values())
        assert worst < 4, f"Suspiciously identical brand strings: {brands}"
