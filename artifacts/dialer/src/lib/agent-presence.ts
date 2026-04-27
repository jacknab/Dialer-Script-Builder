import { useEffect, useRef, useState } from "react";
import { agentHeartbeat, listOnlineAgents } from "@workspace/api-client-react";
import type { AgentPresence } from "@workspace/api-client-react";

const ID_KEY = "dialer.agent.identity";
const NAME_KEY = "dialer.agent.displayName";

function randomId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return (
    "agent-" +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

export function getOrCreateAgentIdentity(): { identity: string; displayName: string } {
  let identity = localStorage.getItem(ID_KEY);
  if (!identity) {
    identity = randomId();
    localStorage.setItem(ID_KEY, identity);
  }
  let displayName = localStorage.getItem(NAME_KEY);
  if (!displayName) {
    displayName = `AGENT-${identity.slice(-4).toUpperCase()}`;
    localStorage.setItem(NAME_KEY, displayName);
  }
  return { identity, displayName };
}

export function setAgentDisplayName(name: string) {
  localStorage.setItem(NAME_KEY, name);
}

export function useAgentPresence(opts?: {
  status?: "available" | "on_call" | "away";
  currentCallId?: number | null;
}) {
  const [self, setSelf] = useState(getOrCreateAgentIdentity);
  const [online, setOnline] = useState<AgentPresence[]>([]);
  const lastStatus = useRef(opts?.status ?? "available");
  const lastCallId = useRef(opts?.currentCallId ?? null);

  // Heartbeat ping
  useEffect(() => {
    let stopped = false;
    const ping = async () => {
      try {
        await agentHeartbeat({
          identity: self.identity,
          displayName: self.displayName,
          status: opts?.status ?? "available",
          currentCallId:
            opts?.currentCallId != null ? String(opts.currentCallId) : null,
        });
      } catch {
        // ignore
      }
    };
    ping();
    const interval = setInterval(() => {
      if (!stopped) ping();
    }, 30_000);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [self.identity, self.displayName, opts?.status, opts?.currentCallId]);

  // Track changes so the heartbeat reflects current status
  useEffect(() => {
    lastStatus.current = opts?.status ?? "available";
    lastCallId.current = opts?.currentCallId ?? null;
  }, [opts?.status, opts?.currentCallId]);

  // Poll the online agent list
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const rows = await listOnlineAgents();
        if (!cancelled) setOnline(rows);
      } catch {
        // ignore
      }
    };
    tick();
    const interval = setInterval(tick, 10_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const renameSelf = (name: string) => {
    setAgentDisplayName(name);
    setSelf((s) => ({ ...s, displayName: name }));
  };

  return { self, online, renameSelf };
}
