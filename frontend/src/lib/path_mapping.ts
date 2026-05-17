// UNC-Pfad → Linux-Mount-Pfad-Mapper.
// Wird in der OCRexpert-Jobs-Seite genutzt, damit der User
// Windows-UNC-Pfade eingeben kann ohne den Linux-Mount-Pfad kennen zu muessen.
//
// Default-Mappings entsprechen dem CIFS-Mount des OCRexpert-Containers auf VDR.

const DEFAULT_MAPPINGS: [string, string][] = [
  [
    "\\\\192.168.200.169\\Public\\Dokumente_pdfa\\",
    "/mnt/qnap_public/Dokumente_pdfa/",
  ],
  [
    "\\\\192.168.200.169\\Public\\Dokumente\\",
    "/mnt/qnap_public/Dokumente/",
  ],
  // Kurzform-Varianten ohne trailing Backslash
  [
    "\\\\192.168.200.169\\Public\\Dokumente_pdfa",
    "/mnt/qnap_public/Dokumente_pdfa",
  ],
  [
    "\\\\192.168.200.169\\Public\\Dokumente",
    "/mnt/qnap_public/Dokumente",
  ],
];

/**
 * Konvertiert einen Windows-UNC-Pfad in einen Linux-Mount-Pfad.
 *
 * Wenn der Input kein erkanntes UNC-Praefix hat, wird er unveraendert
 * zurueckgegeben (damit direkte Linux-Pfade unveraendert durchkommen).
 *
 * Backslashes im Restpfad werden zu Forward-Slashes umgewandelt.
 *
 * @example
 * uncToLinux("\\\\192.168.200.169\\Public\\Dokumente\\test.pdf")
 * // → "/mnt/qnap_public/Dokumente/test.pdf"
 *
 * @example
 * uncToLinux("/mnt/qnap_public/Dokumente/test.pdf")
 * // → "/mnt/qnap_public/Dokumente/test.pdf"  (unveraendert)
 */
export function uncToLinux(input: string): string {
  const normalized = input.trim();

  for (const [uncPrefix, linuxPrefix] of DEFAULT_MAPPINGS) {
    if (normalized.toLowerCase().startsWith(uncPrefix.toLowerCase())) {
      const rest = normalized.slice(uncPrefix.length);
      // Backslashes im Rest zu Forward-Slashes
      const restLinux = rest.replace(/\\/g, "/");
      // Doppelte Slashes vermeiden
      return linuxPrefix.endsWith("/") && restLinux.startsWith("/")
        ? linuxPrefix + restLinux.slice(1)
        : linuxPrefix + restLinux;
    }
  }

  // Keine UNC-Erkennung — nur Backslash-Normalisierung falls Unix-Pfad
  // mit versehentlichen Backslashes eingegeben wurde
  if (!normalized.startsWith("\\\\") && normalized.includes("\\")) {
    return normalized.replace(/\\/g, "/");
  }

  return normalized;
}

/**
 * Prueft ob ein String wie ein Windows-UNC-Pfad aussieht.
 * Wird genutzt um dem User den UNC-Hinweis anzuzeigen.
 */
export function isUncPath(input: string): boolean {
  return input.trim().startsWith("\\\\");
}
