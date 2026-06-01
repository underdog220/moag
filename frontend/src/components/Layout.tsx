// Haupt-Layout: TopBar (sticky) + NavBar + Outlet + Toast.
// PageBadge wird von den einzelnen Pages gesetzt (route-spezifische ID).

import { Outlet } from "react-router-dom";
import { TopBar } from "./TopBar";
import { NavBar } from "./NavBar";
import { ErrorBoundary } from "./ErrorBoundary";
import { ToastHost } from "./Toast";

export function Layout() {
  return (
    <div className="flex h-full flex-col bg-bg text-fg">
      <TopBar />
      <NavBar />
      {/* Content auf Ultrawide zentriert + gecappt (~2200px); TopBar/NavBar
          bleiben voll breit (sticky). Verhindert Extrem-Strecken auf 21:9/32:9. */}
      <main className="flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-[2200px]">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>
      <ToastHost />
    </div>
  );
}

export default Layout;
