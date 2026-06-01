// ocrUploadApi — LOKALER fetch-Wrapper fuer den OCRexpert-Datei-Upload.
//
// Bewusst NICHT lib/api.ts / lib/types.ts nutzen (Konfliktvermeidung —
// anderer Agent arbeitet parallel an lib/*). Dieser Wrapper ist self-contained.
//
// Backend-Endpoint: POST /api/v1/ocrexpert/upload (multipart/form-data)
//   Felder: file (Pflicht), profile, output, language, inline_pdfa (optional)
// Antwort-Schema (siehe backend/moag/routes_ocr_upload.py):
//   ok=true  → { ok, status:"ok",    upstream_status, result, filename, duration_ms }
//   ok=false → { ok, status:"error", upstream_status?, error, upstream?, ... }

/** Verarbeitungs-Parameter fuer OCRexpert. */
export interface OcrUploadParams {
  /** Doctype-Profil, z.B. "generic" | "rechnung". */
  profile?: string;
  /** Ausgabeformat: "raw" (nur Text) | "pdfa" (durchsuchbares PDF/A). */
  output?: "raw" | "pdfa";
  /** Tesseract-Sprachpaket, z.B. "deu+eng". */
  language?: string;
  /** Bei output=pdfa: PDF/A als base64 inline statt URL. */
  inlinePdfa?: boolean;
}

/** OCRexpert-Quality-Gate-Objekt (Teil der result-Payload). */
export interface OcrQuality {
  passed: boolean;
  score: number;
  avg_confidence: number;
  reason: string;
}

/** Die eigentliche OCRexpert-Process-Antwort (1:1 durchgereicht im result-Feld). */
export interface OcrProcessResult {
  status: string; // "ok" | "quality_gate_failed"
  job_id?: string;
  text?: string | null;
  text_len?: number;
  pages?: number;
  quality?: OcrQuality;
  pdfa_url?: string | null;
  pdfa_base64?: string | null;
  duration_ms?: number;
}

/** Strukturierte MOAG-Antwort des Upload-Endpoints. */
export interface OcrUploadResponse {
  ok: boolean;
  status: "ok" | "error";
  upstream_status?: number | null;
  /** Bei Erfolg: die OCRexpert-Antwort. */
  result?: OcrProcessResult;
  /** Bei Fehler: Klartext-Fehlermeldung. */
  error?: string;
  /** Bei Fehler: rohe OCRexpert-Fehler-Payload. */
  upstream?: unknown;
  filename?: string;
  duration_ms?: number;
  fetched_at?: string;
}

/** Endpoint-Pfad — als Konstante fuer Tooltip-Datenquelle wiederverwendbar. */
export const OCR_UPLOAD_ENDPOINT = "/api/v1/ocrexpert/upload";

/**
 * Laedt eine Datei per multipart/form-data an das MOAG-Backend hoch, das sie an
 * OCRexpert weiterleitet. Wirft nur bei Netzwerk-/Transport-Fehlern — fachliche
 * OCRexpert-Fehler kommen als { ok:false, ... } zurueck (Backend faengt sie ab).
 */
export async function uploadForOcr(
  file: File,
  params: OcrUploadParams = {},
): Promise<OcrUploadResponse> {
  const form = new FormData();
  form.append("file", file);
  if (params.profile !== undefined) form.append("profile", params.profile);
  if (params.output !== undefined) form.append("output", params.output);
  if (params.language !== undefined) form.append("language", params.language);
  if (params.inlinePdfa !== undefined) {
    form.append("inline_pdfa", String(params.inlinePdfa));
  }

  let resp: Response;
  try {
    resp = await fetch(OCR_UPLOAD_ENDPOINT, { method: "POST", body: form });
  } catch (e) {
    // Netzwerk-Ebene (Backend nicht erreichbar) — deterministisches Fehler-Objekt
    return {
      ok: false,
      status: "error",
      error: `Verbindung zum MOAG-Backend fehlgeschlagen: ${
        e instanceof Error ? e.message : String(e)
      }`,
      upstream_status: null,
    };
  }

  // Backend liefert auch bei OCRexpert-Fehlern HTTP 200 mit ok:false,
  // ausser bei Validierungs-Fehlern (HTTP 400 mit { detail }).
  let body: unknown;
  try {
    body = await resp.json();
  } catch {
    body = null;
  }

  if (resp.status === 400 && body && typeof body === "object" && "detail" in body) {
    return {
      ok: false,
      status: "error",
      error: String((body as { detail: unknown }).detail),
      upstream_status: 400,
    };
  }

  if (body && typeof body === "object" && "ok" in body) {
    return body as OcrUploadResponse;
  }

  // Unerwartetes Schema → defensiv
  return {
    ok: false,
    status: "error",
    error: `Unerwartete Antwort (HTTP ${resp.status})`,
    upstream_status: resp.status,
  };
}
