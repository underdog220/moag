import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  it("rendert nicht wenn open=false", () => {
    render(
      <ConfirmDialog
        open={false}
        title="Test"
        message="Nachricht"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument();
  });

  it("rendert wenn open=true mit Titel und Nachricht", () => {
    render(
      <ConfirmDialog
        open={true}
        title="Aktion bestätigen"
        message="Willst du das wirklich?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
    expect(screen.getByText("Aktion bestätigen")).toBeInTheDocument();
    expect(screen.getByText("Willst du das wirklich?")).toBeInTheDocument();
  });

  it("ruft onConfirm auf wenn Confirm-Button geklickt", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        title="Test"
        message="Nachricht"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("confirm-dialog-confirm"));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("ruft onCancel auf wenn Cancel-Button geklickt", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        title="Test"
        message="Nachricht"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByTestId("confirm-dialog-cancel"));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("ruft onCancel auf wenn Backdrop geklickt", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        title="Test"
        message="Nachricht"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByTestId("confirm-dialog-backdrop"));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("ruft onCancel auf bei ESC-Key", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        title="Test"
        message="Nachricht"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("zeigt Danger-Icon wenn danger=true", () => {
    render(
      <ConfirmDialog
        open={true}
        title="Destruktiv"
        message="Nicht rückgängig"
        danger={true}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByTestId("confirm-dialog-danger-icon")).toBeInTheDocument();
  });

  it("zeigt angepasste Button-Labels", () => {
    render(
      <ConfirmDialog
        open={true}
        title="Test"
        message="Nachricht"
        confirmLabel="Ja, ausführen"
        cancelLabel="Nein"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("Ja, ausführen")).toBeInTheDocument();
    expect(screen.getByText("Nein")).toBeInTheDocument();
  });
});
