import { useEffect, useRef, useCallback } from "react";

// FIX: Vite proxy use කරන්න — directly 8000 ට connect නොකර
// ws://localhost:5173/ws → Vite proxy → ws://localhost:8000/ws
function getWsUrl() {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host; // localhost:5173
  return `${proto}//${host}/ws`;     // ws://localhost:5173/ws — Vite proxy handles it!
}

export function useWebSocket(token, onMessage) {
  const ws = useRef(null);
  const reconnectTimer = useRef(null);
  const intentionalClose = useRef(false);
  const reconnectDelay = useRef(1000);

  const onMessageRef = useRef(onMessage);
  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);

  const connect = useCallback(() => {
    if (!token) return;
    intentionalClose.current = false;

    const url = `${getWsUrl()}?token=${token}`;
    console.log("[WS] Connecting to:", url);

    let socket;
    try {
      socket = new WebSocket(url);
    } catch (e) {
      console.error("[WS] Failed to create WebSocket:", e);
      return;
    }
    ws.current = socket;

    socket.onopen = () => {
      console.log("[WS] Connected ✅");
      reconnectDelay.current = 1000;
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("[WS RECV]", data);
        onMessageRef.current(data);
      } catch (e) {
        console.error("[WS] Parse error", e);
      }
    };

    socket.onclose = (e) => {
      if (intentionalClose.current) return;
      console.log(`[WS] Disconnected (code=${e.code}), reconnecting in ${reconnectDelay.current}ms...`);
      reconnectTimer.current = setTimeout(connect, reconnectDelay.current);
      reconnectDelay.current = Math.min(reconnectDelay.current * 2, 10000);
    };

    socket.onerror = (err) => {
      console.error("[WS] Error", err);
    };
  }, [token]);

  useEffect(() => {
    connect();
    return () => {
      intentionalClose.current = true;
      clearTimeout(reconnectTimer.current);
      ws.current?.close();
    };
  }, [connect]);

  const send = useCallback((data) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(data));
      return true;
    } else {
      console.warn("[WS] Cannot send — not connected. ReadyState:", ws.current?.readyState);
      return false;
    }
  }, []);

  return { send };
}
