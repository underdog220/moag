// Tests fuer HubListEditor — Add/Delete/Default-Switch + URL-Validation.

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { HubListEditor, isValidHubUrl } from "./HubListEditor";
import type { HubConfig } from "../../lib/types";

const HUBS: HubConfig[] = [
  { id: "vdr", name: "VDR", url: "http://192.168.200.71:18765" },
  { id: "nas", name: "NAS", url: "http://192.168.200.169:8765" },
];

describe("isValidHubUrl", () => {
  it("akzeptiert http:// und https://", () => {
    expect(isValidHubUrl("http://1.2.3.4:1234")).toBe(true);
    expect(isValidHubUrl("https://hub.example/")).toBe(true);
  });
  it("lehnt fehlende Schemes oder leere Strings ab", () => {
    expect(isValidHubUrl("")).toBe(false);
    expect(isValidHubUrl("1.2.3.4:8765")).toBe(false);
    expect(isValidHubUrl("ftp://x")).toBe(false);
  });
});

describe("HubListEditor", () => {
  it("rendert alle Hubs mit Default-Radio + Test-Buttons", () => {
    render(
      <HubListEditor
        hubs={HUBS}
        defaultHubId="vdr"
        onChangeHubs={() => {}}
        onChangeDefault={() => {}}
      />
    );
    expect(screen.getByTestId("hub-row-vdr")).toBeInTheDocument();
    expect(screen.getByTestId("hub-row-nas")).toBeInTheDocument();
    // Default-Radio fuer vdr ist gesetzt
    const radio = screen.getByLabelText("Hub vdr als Default") as HTMLInputElement;
    expect(radio.checked).toBe(true);
  });

  it("ruft onChangeDefault beim Default-Radio-Klick", () => {
    const cb = vi.fn();
    render(
      <HubListEditor
        hubs={HUBS}
        defaultHubId="vdr"
        onChangeHubs={() => {}}
        onChangeDefault={cb}
      />
    );
    fireEvent.click(screen.getByLabelText("Hub nas als Default"));
    expect(cb).toHaveBeenCalledWith("nas");
  });

  it("loescht einen Hub (wenn nicht der letzte)", () => {
    const cb = vi.fn();
    render(
      <HubListEditor
        hubs={HUBS}
        defaultHubId="vdr"
        onChangeHubs={cb}
        onChangeDefault={() => {}}
      />
    );
    fireEvent.click(screen.getByLabelText("Hub nas entfernen"));
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0]).toEqual([HUBS[0]]);
  });

  it("verhindert Loeschen des letzten Hubs (Button disabled)", () => {
    const cb = vi.fn();
    render(
      <HubListEditor
        hubs={[HUBS[0]]}
        defaultHubId="vdr"
        onChangeHubs={cb}
        onChangeDefault={() => {}}
      />
    );
    const btn = screen.getByLabelText("Hub vdr entfernen") as HTMLButtonElement;
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(cb).not.toHaveBeenCalled();
  });

  it("zeigt Add-Form, validiert Pflichtfelder + URL", () => {
    const cb = vi.fn();
    render(
      <HubListEditor
        hubs={HUBS}
        defaultHubId="vdr"
        onChangeHubs={cb}
        onChangeDefault={() => {}}
      />
    );
    fireEvent.click(screen.getByText("+ Hub hinzufuegen"));
    expect(screen.getByTestId("hub-add-form")).toBeInTheDocument();
    // Klick ohne Eingaben -> Fehler
    fireEvent.click(screen.getByText("Hub anlegen"));
    expect(screen.getByTestId("hub-add-error").textContent).toContain("Pflichtfelder");
    expect(cb).not.toHaveBeenCalled();
  });

  it("akzeptiert vollstaendigen Eintrag und ruft onChangeHubs", () => {
    const cb = vi.fn();
    render(
      <HubListEditor
        hubs={HUBS}
        defaultHubId="vdr"
        onChangeHubs={cb}
        onChangeDefault={() => {}}
      />
    );
    fireEvent.click(screen.getByText("+ Hub hinzufuegen"));
    fireEvent.change(screen.getByPlaceholderText("z.B. lab"), { target: { value: "lab" } });
    fireEvent.change(screen.getByPlaceholderText("z.B. Lab-Hub"), { target: { value: "Lab" } });
    fireEvent.change(screen.getByPlaceholderText("http://192.168.x.x:8765"), {
      target: { value: "http://10.0.0.5:8765" },
    });
    fireEvent.click(screen.getByText("Hub anlegen"));
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0]).toHaveLength(3);
    expect(cb.mock.calls[0][0][2]).toEqual({
      id: "lab",
      name: "Lab",
      url: "http://10.0.0.5:8765",
    });
  });

  it("lehnt ungueltige URL im Add-Form ab", () => {
    const cb = vi.fn();
    render(
      <HubListEditor
        hubs={HUBS}
        defaultHubId="vdr"
        onChangeHubs={cb}
        onChangeDefault={() => {}}
      />
    );
    fireEvent.click(screen.getByText("+ Hub hinzufuegen"));
    fireEvent.change(screen.getByPlaceholderText("z.B. lab"), { target: { value: "lab" } });
    fireEvent.change(screen.getByPlaceholderText("z.B. Lab-Hub"), { target: { value: "Lab" } });
    fireEvent.change(screen.getByPlaceholderText("http://192.168.x.x:8765"), {
      target: { value: "10.0.0.5:8765" },
    });
    fireEvent.click(screen.getByText("Hub anlegen"));
    expect(screen.getByTestId("hub-add-error").textContent).toContain("http://");
    expect(cb).not.toHaveBeenCalled();
  });
});
