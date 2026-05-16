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
      <main className="flex-1 overflow-auto">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
      <ToastHost />
    </div>
  );
}

export default Layout;
