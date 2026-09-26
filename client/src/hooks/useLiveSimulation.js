import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const SOCKET_BASE = import.meta.env.VITE_SOCKET_BASE || "http://localhost:5000";

/**
 * Connects once to the server's Socket.IO stream and keeps a rolling buffer
 * of the most recent simulated readings for the selected crop.
 */
export function useLiveSimulation(crop, maxPoints = 25) {
  const [readings, setReadings] = useState([]);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    const socket = io(SOCKET_BASE, { transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("simulated-reading", (payload) => {
      if (payload.crop !== crop) return; // this dashboard only shows the selected crop's live feed
      setReadings((prev) => [...prev.slice(-(maxPoints - 1)), payload]);
    });

    return () => socket.disconnect();
  }, [crop, maxPoints]);

  return { readings, connected };
}
