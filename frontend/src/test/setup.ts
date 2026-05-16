// Vitest-Setup — wird vor allen Tests einmal ausgefuehrt.
import "@testing-library/jest-dom/vitest";

// jsdom-Polyfills fuer Browser-APIs die jsdom nicht implementiert:

// ResizeObserver: von recharts/ResponsiveContainer benoetigt
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = ResizeObserverStub;

// scrollIntoView: jsdom implementiert es nicht
if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = function () {};
}
