// Default-Settings fuer "Reset auf Defaults" — Hubs aus
// docs/ARCHITEKTUR_GUI.md §7 Initial-Hub-Liste.

import type { Settings } from "../../lib/types";

// M2 (2026-05-15): VDR ist Ziel-Hub (Production). NAS bleibt als Legacy-Fallback.
export const DEFAULT_SETTINGS: Settings = {
  hubs: [
    { id: "vdr",      name: "VDR-Production", url: "http://192.168.200.71:18765" },
    { id: "nas",      name: "NAS-Legacy",     url: "http://192.168.200.169:8765" },
    { id: "nas-test", name: "NAS-Test",       url: "http://192.168.200.169:8766" },
  ],
  default_hub_id: "vdr",
  cluster_enabled: true,
  voting_engines: ["tesseract", "easyocr", "paddleocr", "surya"],
  voting_strategy: "consensus",
  fallback_to_local: true,
  api_token: null,
  pipeline_log_enabled: false,
  doctype_text_gewicht: 0.7,
  doctype_layout_gewicht: 0.3,
};

/** Bekannte Engines fuer Multi-Select. Erweiterbar bei neuen Engines. */
export const KNOWN_ENGINES = [
  "tesseract",
  "easyocr",
  "paddleocr",
  "surya",
] as const;
