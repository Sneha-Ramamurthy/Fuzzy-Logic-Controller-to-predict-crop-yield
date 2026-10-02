import { useEffect, useState } from "react";

const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8000/ws/simulated";

/**
 * Opens a native WebSocket to the FastAPI backend and keeps a rolling buffer
 * of the most recent simulated readings for the selected crop.
 * Reconnects automatically if the connection drops.
 */
export function useLiveSimulation(crop, maxPoints = 25) {
  const [readings, setReadings] = useState([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let ws;
    let retry;
    let closed = false;

    const connect = () => {
      ws = new WebSocket(WS_URL);
      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!closed) retry = setTimeout(connect, 2000);
      };
      ws.onmessage = (event) => {
        const payload = JSON.parse(event.data);
        if (payload.crop !== crop) return; // only show the selected crop's feed
        setReadings((prev) => [...prev.slice(-(maxPoints - 1)), payload]);
      };
    };
    connect();

    return () => {
      closed = true;
      clearTimeout(retry);
      ws && ws.close();
    };
  }, [crop, maxPoints]);

  return { readings, connected };
}
