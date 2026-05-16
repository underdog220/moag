// WebSocket-Hook mit Auto-Reconnect (exponentielles Backoff).
// Im Mock-Modus simulieren wir Events alle 2s aus dem Mock-Loader.

import { useEffect, useRef, useState } from "react";
import type { WsEvent } from "./types";
import { isMockMode } from "./env";
import { mockWsEvents } from "../mocks/loader";

export type WsStatus = "connecting" | "open" | "closed" | "error" | "mock";

export interface UseWebSocketOptions {
  /** WS-URL relativ (z.B. "/ws/events") oder absolut. Default `/ws/events`. */
  url?: string;
  /** Wenn false, wird nicht verbunden (z.B. bevor Settings geladen sind). */
  enabled?: boolean;
  /** Initial backoff in ms. */
  initialBackoffMs?: number;
  /** Max backoff in ms. */
  maxBackoffMs?: number;
  /** Callback fuer parsed events. */
  onEvent?: (ev: WsEvent) => void;
}

export interface UseWebSocketResult {
  status: WsStatus;
  lastEvent: WsEvent | null;
  reconnectAttempt: number;
  /** Manuelles Reconnect erzwingen. */
  reconnect: () => void;
}

function buildWsUrl(rel: string): string {
  if (rel.startsWith("ws://") || rel.startsWith("wss://")) return rel;
  if (typeof window === "undefined") return rel;
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  const path = rel.startsWith("/") ? rel : "/" + rel;
  return `${proto}//${host}${path}`;
}

/**
 * useWebSocket — verwaltet eine WS-Verbindung mit Auto-Reconnect.
 * Cleanup beim Unmount; KEIN Reconnect waehrend StrictMode-Doppel-Mount.
 */
export function useWebSocket(opts: UseWebSocketOptions = {}): UseWebSocketResult {
  const {
    url = "/ws/events",
    enabled = true,
    initialBackoffMs = 500,
    maxBackoffMs = 15_000,
    onEvent,
  } = opts;

  const [status, setStatus] = useState<WsStatus>("connecting");
  const [lastEvent, setLastEvent] = useState<WsEvent | null>(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedRef = useRef(false);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const reconnectRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (!enabled) {
      setStatus("closed");
      return;
    }

    // --- Mock-Modus: Events alle 2s simuliert ---
    if (isMockMode()) {
      setStatus("mock");
      let i = 0;
      const events = mockWsEvents();
      if (events.length === 0) {
        return () => undefined;
      }
      const id = setInterval(() => {
        const ev = events[i % events.length] as WsEvent;
        setLastEvent(ev);
        onEventRef.current?.(ev);
        i++;
      }, 2_000);
      return () => clearInterval(id);
    }

    closedRef.current = false;
    let attempt = 0;

    const connect = () => {
      if (closedRef.current) return;
      setStatus("connecting");
      const fullUrl = buildWsUrl(url);
      let ws: WebSocket;
      try {
        ws = new WebSocket(fullUrl);
      } catch {
        setStatus("error");
        scheduleReconnect();
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        attempt = 0;
        setReconnectAttempt(0);
        setStatus("open");
      };

      ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data) as WsEvent;
          setLastEvent(data);
          onEventRef.current?.(data);
        } catch {
          // Server schickt ggf. Heartbeat als Plain-Text — ignorieren
        }
      };

      ws.onerror = () => {
        setStatus("error");
      };

      ws.onclose = () => {
        if (closedRef.current) {
          setStatus("closed");
          return;
        }
        scheduleReconnect();
      };
    };

    const scheduleReconnect = () => {
      attempt += 1;
      setReconnectAttempt(attempt);
      const delay = Math.min(initialBackoffMs * 2 ** (attempt - 1), maxBackoffMs);
      timerRef.current = setTimeout(connect, delay);
    };

    reconnectRef.current = () => {
      try {
        wsRef.current?.close();
      } catch {
        // ignore
      }
      if (timerRef.current) clearTimeout(timerRef.current);
      attempt = 0;
      setReconnectAttempt(0);
      connect();
    };

    connect();

    return () => {
      closedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      try {
        wsRef.current?.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
    };
  }, [enabled, url, initialBackoffMs, maxBackoffMs]);

  return {
    status,
    lastEvent,
    reconnectAttempt,
    reconnect: () => reconnectRef.current(),
  };
}
