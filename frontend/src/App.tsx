// App — Root-Component, Routing + globale Effects.
// MOAG — Mother of All GUIs

import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { useUiStore } from "./lib/store";

// Top-Level-Features
import Overview from "./features/overview";
import OberonFeature from "./features/oberon";
import OctoBossFeature from "./features/octoboss";
import OCRexpertFeature from "./features/ocrexpert";
import NasDominatorFeature from "./features/nasdominator";
import QnapBackupFeature from "./features/qnapbackup";
import CustosFeature from "./features/custos";
import PanopticorFeature from "./features/panopticor";
import SettingsPage from "./features/settings";

function NotFound() {
  return (
    <div className="p-8 text-center text-fg-muted">
      <h1 className="text-xl font-semibold text-fg">404 — Seite nicht gefunden</h1>
      <p className="mt-2 text-sm">Die angeforderte Route existiert nicht.</p>
    </div>
  );
}

export function App() {
  const theme = useUiStore((s) => s.theme);

  // Theme-Klasse auf <html> synchronisieren
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return (
    <Routes>
      <Route element={<Layout />}>
        {/* Startseite: Cockpit-Übersicht mit 8 Karten */}
        <Route path="/" element={<Overview />} />

        {/* KI-Backbone (SonOfSETI ist ueber /octoboss/* erreichbar) */}
        <Route path="/oberon/*" element={<OberonFeature />} />
        <Route path="/octoboss/*" element={<OctoBossFeature />} />
        <Route path="/ocrexpert/*" element={<OCRexpertFeature />} />
        {/* Legacy: alte /sonofseti-URLs auf octoboss-Drilldown umleiten */}
        <Route path="/sonofseti" element={<Navigate to="/octoboss" replace />} />
        <Route path="/sonofseti/*" element={<Navigate to="/octoboss" replace />} />

        {/* Infrastruktur */}
        <Route path="/nasdominator/*" element={<NasDominatorFeature />} />
        <Route path="/qnapbackup/*" element={<QnapBackupFeature />} />

        {/* Compliance & Test */}
        <Route path="/custos/*" element={<CustosFeature />} />
        <Route path="/panopticor/*" element={<PanopticorFeature />} />

        {/* Settings (Top-Level) */}
        <Route path="/settings" element={<SettingsPage />} />

        {/* Legacy-Routen aus OCRexpert-Prototyp — Redirect auf neue Struktur */}
        <Route path="/dashboard" element={<Navigate to="/octoboss/dashboard" replace />} />
        <Route path="/jobs" element={<Navigate to="/ocrexpert/jobs" replace />} />
        <Route path="/jobs/:jobId" element={<Navigate to="/ocrexpert/jobs" replace />} />
        <Route path="/history" element={<Navigate to="/ocrexpert/history" replace />} />
        <Route path="/charts" element={<Navigate to="/ocrexpert/charts" replace />} />
        <Route path="/cluster" element={<Navigate to="/octoboss/cluster" replace />} />
        <Route path="/llm" element={<Navigate to="/oberon/llm" replace />} />
        <Route path="/cost" element={<Navigate to="/oberon/cost" replace />} />
        <Route path="/audit" element={<Navigate to="/oberon/audit" replace />} />

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

export default App;
