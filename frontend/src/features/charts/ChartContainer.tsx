// Wrapper um recharts-Charts: vereinheitlicht Hoehe + Test-Mode.
// Im Test-Mode (jsdom) verwenden wir feste Breite, damit ResponsiveContainer
// nicht ueber width=0 wegen ResizeObserver-Stub haengt.

import type { ReactElement } from "react";
import { ResponsiveContainer } from "recharts";

export interface ChartContainerProps {
  height?: number;
  /** Genau ein recharts-Chart-Element (LineChart/BarChart/PieChart/AreaChart). */
  children: ReactElement;
}

const IS_TEST =
  typeof process !== "undefined" &&
  (process.env?.NODE_ENV === "test" || process.env?.VITEST === "true");

export function ChartContainer({ height = 240, children }: ChartContainerProps) {
  if (IS_TEST) {
    // jsdom hat keinen Layout-Engine; ResponsiveContainer wuerde width/height=0 melden.
    return (
      <div data-testid="chart-container" style={{ width: 600, height }}>
        {/* Klone das Chart-Element mit fixer Width/Height fuer Tests */}
        {/* recharts-Charts akzeptieren width/height-Props */}
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {Object.assign({}, children, {
          props: { ...(children.props as any), width: 600, height },
        }) as ReactElement}
      </div>
    );
  }
  return (
    <div data-testid="chart-container" style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

export default ChartContainer;
