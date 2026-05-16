// HubHealthDot — kleine wiederverwendbare Komponente, die Reachability + Latenz
// eines Hubs in einen Status-Punkt uebersetzt. Wird sowohl in der Multi-Tabelle
// als auch potentiell von der TopBar genutzt.

import { StatusDot, type StatusKind } from "../../components/StatusDot";

export interface HubHealthDotProps {
  /** Ist der Hub erreichbar? null = unbekannt (z.B. noch keine Pruefung). */
  reachable: boolean | null;
  /** Latenz in ms; >500ms wird als "warn" markiert. */
  latencyMs?: number | null;
  /** Optionale Pulse-Animation bei warn/error. */
  pulse?: boolean;
  /** Tooltip-Text override; sonst aus reachable + latency abgeleitet. */
  label?: string;
  size?: "sm" | "md" | "lg";
}

export function deriveHubStatus(
  reachable: boolean | null,
  latencyMs: number | null | undefined
): { kind: StatusKind; label: string } {
  if (reachable == null) return { kind: "neutral", label: "Pruefung ausstehend" };
  if (!reachable) return { kind: "error", label: "Nicht erreichbar" };
  if (typeof latencyMs === "number" && latencyMs >= 500) {
    return { kind: "warn", label: `Erreichbar, hohe Latenz ${Math.round(latencyMs)} ms` };
  }
  if (typeof latencyMs === "number") {
    return { kind: "ok", label: `Erreichbar, ${Math.round(latencyMs)} ms` };
  }
  return { kind: "ok", label: "Erreichbar" };
}

export function HubHealthDot({
  reachable,
  latencyMs,
  pulse = false,
  label,
  size = "md",
}: HubHealthDotProps) {
  const { kind, label: derivedLabel } = deriveHubStatus(reachable, latencyMs ?? null);
  return (
    <StatusDot
      status={kind}
      pulse={pulse && (kind === "warn" || kind === "error")}
      size={size}
      label={label ?? derivedLabel}
      title={label ?? derivedLabel}
    />
  );
}

export default HubHealthDot;
