// uploadOperations.ts — Frontend-Operations-Registry für den Upload-Hub.
// Exakt nach docs/UPLOAD_SCHEMA.md (verbindlich). Nicht selbst erweitern.

export interface UploadOperation {
  id:
    | "ocr.standard"
    | "ocr.shadow"
    | "ocr.direct"
    | "llm.text"
    | "llm.vision"
    | "llm.plan"
    | "audio.transcribe"
    | "dsgvo.redact"
    | "dsgvo.visual-redact"
    | "pii.scan"
    | "pdf.split";
  name: string;
  system: "ocrexpert" | "oberon" | "octoboss";
  description: string;
  accepted_mimes: string[];
  requires_prompt: boolean;
  requires_engine_choice?: string[];
  estimated_duration_s: number;
  category: "ocr" | "llm" | "audio" | "dsgvo" | "pdf";
}

export const UPLOAD_OPERATIONS: UploadOperation[] = [
  {
    id: "ocr.standard",
    name: "OCR (Standard)",
    system: "ocrexpert",
    description:
      "Vollständige Texterkennung mit Doctype-Klassifizierung und PII-Scan. Unterstützt PDF, Bilder und alle gängigen Scan-Formate.",
    accepted_mimes: [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/tiff",
      "image/bmp",
      "image/webp",
    ],
    requires_prompt: false,
    estimated_duration_s: 15,
    category: "ocr",
  },
  {
    id: "ocr.shadow",
    name: "PDF/A-Shadow",
    system: "ocrexpert",
    description:
      "Erstellt eine durchsuchbare PDF/A-Schattenkopie mit eingebettetem OCR-Text. Input bleibt unverändert, Output ist eine neue PDF-Datei.",
    accepted_mimes: ["application/pdf"],
    requires_prompt: false,
    estimated_duration_s: 20,
    category: "ocr",
  },
  {
    id: "ocr.direct",
    name: "OCR (Engine-Auswahl)",
    system: "octoboss",
    description:
      "OCR direkt auf einer bestimmten Engine (Tesseract, Surya, PaddleOCR, EasyOCR). Nützlich für Engine-Vergleiche oder wenn eine Engine besonders gut abschneidet.",
    accepted_mimes: [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/tiff",
    ],
    requires_prompt: false,
    requires_engine_choice: ["tesseract", "surya", "paddle", "easyocr"],
    estimated_duration_s: 10,
    category: "ocr",
  },
  {
    id: "llm.text",
    name: "LLM-Textanalyse",
    system: "oberon",
    description:
      "LLM-gestützte Analyse von Text oder PDF-Inhalt via Oberon DSGVO-Proxy. Eigener Prompt — z.B. Zusammenfassung, Extraktion, Klassifizierung.",
    accepted_mimes: [
      "application/pdf",
      "text/plain",
      "text/markdown",
      "text/html",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/rtf",
    ],
    requires_prompt: true,
    estimated_duration_s: 30,
    category: "llm",
  },
  {
    id: "llm.vision",
    name: "LLM-Vision",
    system: "oberon",
    description:
      "Oberon Vision-Modell analysiert ein Bild basierend auf deinem Prompt. Für Screenshot-Auswertung, Bild-Klassifizierung, handschriftliche Notizen.",
    accepted_mimes: ["image/png", "image/jpeg", "image/webp"],
    requires_prompt: true,
    estimated_duration_s: 25,
    category: "llm",
  },
  {
    id: "llm.plan",
    name: "Bauplan-Analyse",
    system: "oberon",
    description:
      "DIN 277 + WoFlV konforme Bauplan-Analyse. Erkennt Raumtypen, berechnet Flächen, klassifiziert nach Nutzungsart.",
    accepted_mimes: ["application/pdf", "image/png", "image/jpeg"],
    requires_prompt: false,
    estimated_duration_s: 45,
    category: "llm",
  },
  {
    id: "audio.transcribe",
    name: "Audio-Transkription",
    system: "oberon",
    description:
      "Whisper-basierte Transkription mit DSGVO-Scan. Unterstützt alle gängigen Audio-Formate. Output ist ein strukturiertes Transkript auf Deutsch.",
    accepted_mimes: [
      "audio/wav",
      "audio/mpeg",
      "audio/mp4",
      "audio/ogg",
      "audio/flac",
      "audio/aac",
    ],
    requires_prompt: false,
    estimated_duration_s: 60,
    category: "audio",
  },
  {
    id: "dsgvo.redact",
    name: "DSGVO-Schwärzung",
    system: "oberon",
    description:
      "Erkennt und schwärzt personenbezogene Daten (PII) in PDF oder Bild. Output ist die anonymisierte Datei als Download.",
    accepted_mimes: [
      "application/pdf",
      "image/png",
      "image/jpeg",
    ],
    requires_prompt: false,
    estimated_duration_s: 20,
    category: "dsgvo",
  },
  {
    id: "dsgvo.visual-redact",
    name: "DSGVO Visual-Redact (PDF)",
    system: "oberon",
    description:
      "Schwärzt personenbezogene Daten (PII) visuell in einer PDF-Datei. " +
      "Oberon analysiert das Dokument asynchron und liefert eine anonymisierte PDF zum Download. " +
      "Nur PDF-Dateien werden akzeptiert. Verarbeitungsdauer ca. 30–90 Sekunden.",
    accepted_mimes: ["application/pdf"],
    requires_prompt: false,
    estimated_duration_s: 60,
    category: "dsgvo",
  },
  {
    id: "pii.scan",
    name: "PII-Scan",
    system: "oberon",
    description:
      "Scannt Text oder PDF auf personenbezogene Daten (IBAN, E-Mail, Name, Adresse, ...) und liefert strukturierten Findings-Report.",
    accepted_mimes: [
      "application/pdf",
      "text/plain",
      "text/markdown",
    ],
    requires_prompt: false,
    estimated_duration_s: 10,
    category: "dsgvo",
  },
  {
    id: "pdf.split",
    name: "PDF-Split",
    system: "ocrexpert",
    description:
      "Zerlegt eine mehrseitige PDF in Einzelseiten als ZIP-Paket. Nützlich für Stapel-Scan oder seitenweise Weiterverarbeitung.",
    accepted_mimes: ["application/pdf"],
    requires_prompt: false,
    estimated_duration_s: 5,
    category: "pdf",
  },
];

/** Gibt alle Operationen zurück, die das angegebene MIME akzeptieren. */
export function compatibleOperations(mime: string): UploadOperation[] {
  // Normalisierung: manche Browser liefern z.B. "image/jpg" statt "image/jpeg"
  const normalized = mime === "image/jpg" ? "image/jpeg" : mime;
  return UPLOAD_OPERATIONS.filter((op) =>
    op.accepted_mimes.includes(normalized),
  );
}

/**
 * Erkennt das MIME-Type einer Datei anhand der Endung als Fallback.
 * Browser liefern file.type oft korrekt — wir nutzen die Endung nur als Absicherung.
 */
export function detectMime(file: File): string {
  if (file.type && file.type !== "application/octet-stream") {
    return file.type;
  }
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const extMap: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    tif: "image/tiff",
    tiff: "image/tiff",
    bmp: "image/bmp",
    webp: "image/webp",
    gif: "image/gif",
    heic: "image/heic",
    svg: "image/svg+xml",
    txt: "text/plain",
    md: "text/markdown",
    html: "text/html",
    csv: "text/csv",
    json: "application/json",
    xml: "application/xml",
    yaml: "application/x-yaml",
    yml: "application/x-yaml",
    log: "text/x-log",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    rtf: "application/rtf",
    wav: "audio/wav",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    ogg: "audio/ogg",
    flac: "audio/flac",
    aac: "audio/aac",
  };
  return extMap[ext] ?? "application/octet-stream";
}

/** Formatiert Bytes in lesbares Format (B, KB, MB). */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Baut den accept-String für ein <input accept="...">-Attribut. */
export function acceptString(op: UploadOperation): string {
  return op.accepted_mimes.join(",");
}
