import { useState, useEffect, useMemo } from "react";
import { Link, useSearch } from "wouter";
import {
  useGetCampaignNextLead,
  useStartCall,
  useUpdateCall,
  useEndCall,
  useGetScript,
  useGetCampaign,
  useListCampaigns,
  useGetTwilioStatus,
  holdCall,
  unholdCall,
  transferCall,
  leaveCall,
  getGetCampaignNextLeadQueryKey,
  getGetCampaignQueryKey,
  getGetScriptQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTwilioDevice } from "@/lib/twilio-device";
import { useAgentPresence } from "@/lib/agent-presence";

const DISPOSITIONS: Record<string, string> = {
  "1": "INTERESTED",
  "2": "NOT_INTERESTED",
  "3": "CALLBACK",
  "4": "WRONG_NUMBER",
  "5": "NO_ANSWER",
};

export default function Dialer() {
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const urlCampaignId = Number(searchParams.get("campaignId"));

  const { data: campaignList } = useListCampaigns();
  const fallbackCampaignId =
    campaignList?.find((c) => c.status === "active")?.id ??
    campaignList?.[0]?.id ??
    0;
  const campaignId = urlCampaignId || fallbackCampaignId;

  const queryClient = useQueryClient();

  // Voice / Twilio status
  const { data: twilioStatus } = useGetTwilioStatus();
  const browserAudioEnabled = !!twilioStatus?.voiceConnected;

  // Campaign & Script Context
  const { data: campaign, isLoading: campLoading } = useGetCampaign(campaignId, {
    query: { enabled: !!campaignId, queryKey: getGetCampaignQueryKey(campaignId) },
  });
  const scriptId = campaign?.scriptId;
  const { data: script, isLoading: scriptLoading } = useGetScript(scriptId || 0, {
    query: { enabled: !!scriptId, queryKey: getGetScriptQueryKey(scriptId || 0) },
  });

  // Dialer State
  const [systemStatus, setSystemStatus] = useState<
    "READY" | "DIALING" | "LIVE" | "WRAPUP"
  >("READY");
  const [callId, setCallId] = useState<number | null>(null);
  const [callStart, setCallStart] = useState<number | null>(null);
  const [timer, setTimer] = useState("00:00");
  const [onHold, setOnHold] = useState(false);
  const [muted, setMuted] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  // Script Navigation State
  const [currentNodeId, setCurrentNodeId] = useState<number | null>(null);
  const [scriptLog, setScriptLog] = useState<{ nodeId: number; text: string }[]>([]);

  // Agent identity & presence
  const { self, online, renameSelf } = useAgentPresence({
    status: systemStatus === "LIVE" ? "on_call" : "available",
    currentCallId: callId,
  });

  // Twilio Device (browser softphone) — only init when voice is configured
  const device = useTwilioDevice(self.identity);

  // API Hooks
  const {
    data: nextLeadData,
    isLoading: peekLoading,
    refetch: refetchNextLead,
  } = useGetCampaignNextLead(campaignId, {
    query: {
      enabled: !!campaignId && systemStatus === "READY",
      queryKey: getGetCampaignNextLeadQueryKey(campaignId),
    },
  });

  const startCall = useStartCall();
  const updateCall = useUpdateCall();
  const endCall = useEndCall();

  const nextLead = nextLeadData?.lead;
  const queueRemaining = nextLeadData?.remaining || 0;

  // Timer Effect
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (callStart && systemStatus === "LIVE") {
      interval = setInterval(() => {
        const diff = Math.floor((Date.now() - callStart) / 1000);
        const m = String(Math.floor(diff / 60)).padStart(2, "0");
        const s = String(diff % 60).padStart(2, "0");
        setTimer(`${m}:${s}`);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [callStart, systemStatus]);

  // Auto-dismiss action toast
  useEffect(() => {
    if (!actionMsg) return;
    const t = setTimeout(() => setActionMsg(null), 3500);
    return () => clearTimeout(t);
  }, [actionMsg]);

  // Derived Script helpers
  const currentNode = script?.nodes?.find((n) => n.id === currentNodeId);
  const rootNode =
    script?.nodes?.find((n) => n.id === script.rootNodeId) || script?.nodes?.[0];

  const advanceToNode = (id: number) => {
    setCurrentNodeId(id);
    const n = script?.nodes?.find((n) => n.id === id);
    if (n) {
      setScriptLog((prev) => [...prev, { nodeId: n.id, text: n.message }]);
    }
  };

  const handleStartCall = () => {
    if (!nextLead || !scriptId) return;
    setSystemStatus("DIALING");

    startCall.mutate(
      {
        data: {
          leadId: nextLead.id,
          scriptId,
          campaignId,
          agentIdentity: self.identity,
          useBrowserAudio: browserAudioEnabled,
        },
      },
      {
        onSuccess: async (call) => {
          setCallId(call.id);
          setCallStart(Date.now());
          setSystemStatus("LIVE");
          if (rootNode) {
            advanceToNode(rootNode.id);
          }

          if (browserAudioEnabled) {
            try {
              await device.connect({ callId: String(call.id) });
            } catch (err) {
              setActionMsg(
                "Browser audio failed: " +
                  (err instanceof Error ? err.message : String(err)),
              );
            }
          }
        },
        onError: () => {
          setSystemStatus("READY");
          setActionMsg("Failed to start call");
        },
      },
    );
  };

  const resetCallUiState = () => {
    setSystemStatus("READY");
    setCallId(null);
    setCallStart(null);
    setTimer("00:00");
    setCurrentNodeId(null);
    setScriptLog([]);
    setOnHold(false);
    setMuted(false);
    queryClient.invalidateQueries({
      queryKey: getGetCampaignNextLeadQueryKey(campaignId),
    });
    refetchNextLead();
  };

  const handleSaveDisposition = (dispo: string) => {
    if (!callId) return;
    setSystemStatus("WRAPUP");

    const pathStr = scriptLog.map((l) => l.nodeId).join(" -> ");

    updateCall.mutate(
      {
        callId,
        data: { status: "COMPLETED", disposition: dispo, pathTaken: pathStr },
      },
      {
        onSuccess: () => {
          // Drop the agent's browser leg so the conference truly ends.
          try {
            device.disconnect();
          } catch {
            /* noop */
          }
          endCall.mutate(
            { callId },
            {
              onSettled: () => {
                resetCallUiState();
              },
            },
          );
        },
      },
    );
  };

  const handleHold = async () => {
    if (!callId) return;
    try {
      const fn = onHold ? unholdCall : holdCall;
      const r = await fn({ callId });
      if (r.ok) {
        setOnHold(!onHold);
        setActionMsg(onHold ? "Lead resumed" : "Lead on hold (music playing)");
      } else {
        setActionMsg(r.message ?? "Hold failed");
      }
    } catch (err) {
      setActionMsg(
        "Hold failed: " + (err instanceof Error ? err.message : String(err)),
      );
    }
  };

  const handleMute = () => {
    const next = !muted;
    device.muteSelf(next);
    setMuted(next);
    setActionMsg(next ? "Mic muted" : "Mic unmuted");
  };

  const handleTransfer = async (targetIdentity: string, mode: "blind" | "warm") => {
    if (!callId) return;
    setTransferOpen(false);
    try {
      const r = await transferCall({ callId, targetIdentity, mode });
      if (r.ok) {
        setActionMsg(r.message ?? "Transferring...");
        if (mode === "blind") {
          // Our leg gets dropped — clean up local state.
          try {
            device.disconnect();
          } catch {
            /* noop */
          }
          // Mark wrap so the disposition still gets logged
          setSystemStatus("WRAPUP");
          updateCall.mutate(
            {
              callId,
              data: {
                status: "TRANSFERRED",
                disposition: `TRANSFERRED_TO_${targetIdentity}`,
              },
            },
            { onSettled: resetCallUiState },
          );
        }
      } else {
        setActionMsg(r.message ?? "Transfer failed");
      }
    } catch (err) {
      setActionMsg(
        "Transfer failed: " + (err instanceof Error ? err.message : String(err)),
      );
    }
  };

  const handleLeave = async () => {
    if (!callId) return;
    try {
      await leaveCall({ callId });
      try {
        device.disconnect();
      } catch {
        /* noop */
      }
      setActionMsg("You left the call (lead remains)");
      resetCallUiState();
    } catch (err) {
      setActionMsg(
        "Leave failed: " + (err instanceof Error ? err.message : String(err)),
      );
    }
  };

  // Online agents excluding self
  const otherAgents = useMemo(
    () => online.filter((a) => a.identity !== self.identity),
    [online, self.identity],
  );

  // Keyboard Controls
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      // Don't intercept while typing in an input
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (key === " ") e.preventDefault();

      if (systemStatus === "READY" && (key === " " || key === "enter")) {
        handleStartCall();
        return;
      }

      if (systemStatus !== "LIVE") return;

      // Softphone hotkeys
      if (key === "h") {
        handleHold();
        return;
      }
      if (key === "m") {
        handleMute();
        return;
      }
      if (key === "t") {
        setTransferOpen(true);
        return;
      }
      if (key === "c") {
        handleSaveDisposition("ABANDONED");
        return;
      }

      if (!currentNode) return;

      if (["1", "2", "3", "4", "5", "6", "7", "8", "9"].includes(key)) {
        const opt = currentNode.options?.find((o) => o.key === key);
        if (opt) {
          if (opt.nextNodeId) {
            advanceToNode(opt.nextNodeId);
          } else if (opt.disposition) {
            handleSaveDisposition(opt.disposition);
          }
        } else if (!currentNode.options?.length && DISPOSITIONS[key]) {
          handleSaveDisposition(DISPOSITIONS[key]);
        }
      }

      if (
        key === " " &&
        currentNode.options?.length === 1 &&
        currentNode.options[0].nextNodeId
      ) {
        advanceToNode(currentNode.options[0].nextNodeId);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systemStatus, currentNode, callId, nextLead, scriptId, campaignId, onHold, muted]);

  if (!campaignId) {
    return (
      <div className="p-6 font-mono text-primary space-y-3">
        <div className="text-secondary">// NO CAMPAIGN AVAILABLE</div>
        <div className="text-muted-foreground text-sm">
          Create a campaign first, then come back to the dialer.
        </div>
        <Link
          href="/campaigns"
          className="inline-block border border-primary px-3 py-2 text-primary hover:bg-primary hover:text-background"
        >
          [+] CREATE CAMPAIGN
        </Link>
      </div>
    );
  }

  if (campLoading || scriptLoading || (systemStatus === "READY" && peekLoading)) {
    return (
      <div className="flex h-full items-center justify-center bg-black text-primary font-mono animate-pulse">
        [ INITIALIZING COMMAND DECK... ]
      </div>
    );
  }

  const deviceLabel = browserAudioEnabled
    ? device.status === "ready"
      ? "MIC READY"
      : device.status === "in_call"
      ? "ON AIR"
      : device.status === "connecting"
      ? "CONNECTING"
      : device.status === "initializing" || device.status === "registering"
      ? "REGISTERING"
      : device.status === "error"
      ? "MIC ERROR"
      : "OFFLINE"
    : "PSTN ONLY";

  return (
    <div className="h-full bg-[#0a0e0a] text-primary p-4 font-mono flex flex-col relative overflow-hidden select-none">
      {/* Action toast */}
      {actionMsg && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 border border-secondary bg-black/90 text-secondary px-4 py-2 text-xs tracking-widest">
          {actionMsg}
        </div>
      )}

      {/* HUD HEADER */}
      <div className="flex justify-between items-center mb-4 border-b border-primary/30 pb-2">
        <div className="flex items-center space-x-4">
          <div className="text-xl font-bold tracking-widest flex items-center">
            {systemStatus === "LIVE" && (
              <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse mr-2 shadow-[0_0_8px_#ff0000]"></span>
            )}
            {systemStatus === "READY" && (
              <span className="w-3 h-3 bg-primary rounded-full mr-2"></span>
            )}
            {systemStatus === "WRAPUP" && (
              <span className="w-3 h-3 bg-secondary rounded-full mr-2"></span>
            )}
            STATUS: {systemStatus}
          </div>
          <Badge variant="outline" className="border-primary/50 text-primary/70 rounded-none">
            CMP: {campaign?.name}
          </Badge>
          <Badge variant="outline" className="border-primary/50 text-primary/70 rounded-none">
            Q: {queueRemaining}
          </Badge>
          <Badge
            variant="outline"
            className={`rounded-none ${
              device.status === "ready" || device.status === "in_call"
                ? "border-primary text-primary"
                : device.status === "error"
                ? "border-destructive text-destructive"
                : "border-secondary text-secondary"
            }`}
            title={device.error ?? deviceLabel}
          >
            ◉ {deviceLabel}
          </Badge>
          <input
            value={self.displayName}
            onChange={(e) => renameSelf(e.target.value.toUpperCase().slice(0, 24))}
            className="bg-black/60 border border-primary/40 px-2 py-1 text-xs text-primary w-32"
            title="Your agent name (visible to other agents for transfers)"
          />
        </div>
        <div className="text-2xl font-bold tracking-widest">{timer}</div>
      </div>

      {systemStatus === "READY" ? (
        <div className="flex-1 flex flex-col items-center justify-center border border-primary/20 bg-primary/5 shadow-[inset_0_0_50px_rgba(0,255,0,0.05)] relative">
          <div className="scanline"></div>
          {nextLead ? (
            <div className="text-center z-10">
              <div className="text-sm text-primary/60 mb-2">TARGET IDENTIFIED</div>
              <div className="text-4xl font-bold mb-8 text-white terminal-glow">
                {nextLead.name}
              </div>
              <div className="text-xl animate-pulse">
                PRESS [SPACE] TO INITIATE SEQUENCE
              </div>
              {browserAudioEnabled && device.status !== "ready" && (
                <div className="mt-6 text-xs text-secondary terminal-glow-amber">
                  // mic: {device.status}
                  {device.error ? ` — ${device.error}` : ""}
                </div>
              )}
              {!browserAudioEnabled && (
                <div className="mt-6 text-xs text-secondary terminal-glow-amber max-w-md">
                  // browser softphone disabled. Configure
                  TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, TWILIO_TWIML_APP_SID
                  to enable in-browser audio + hold + transfer.
                </div>
              )}
            </div>
          ) : (
            <div className="text-center z-10 text-secondary terminal-glow-amber">
              <div className="text-2xl font-bold mb-2">QUEUE DEPLETED</div>
              <div className="text-sm">CAMPAIGN CONCLUDED OR NO MATCHING LEADS.</div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-3 gap-6 min-h-0">
          {/* LEFT: TARGET INTEL + SOFTPHONE CONTROLS */}
          <div className="col-span-1 flex flex-col space-y-4 min-h-0">
            <Card className="bg-black/50 border-primary/50 rounded-none flex-1 overflow-auto">
              <CardContent className="p-6 space-y-6">
                <div className="border-b border-primary/30 pb-2 mb-4">
                  <div className="text-xs text-primary/50 mb-1">TARGET IDENTITY</div>
                  <h2 className="text-2xl font-bold text-white tracking-wide">
                    {nextLead?.name}
                  </h2>
                </div>

                <div className="space-y-4">
                  <div>
                    <div className="text-[10px] text-primary/50">COMM CHANNEL</div>
                    <div className="text-xl text-accent terminal-glow">
                      {nextLead?.phone || "UNKNOWN"}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] text-primary/50">GEO-COORDS</div>
                    <div className="text-sm text-primary/80 uppercase">
                      {nextLead?.address?.split(",")[0]}
                      <br />
                      {nextLead?.address?.split(",").slice(1).join(",")}
                    </div>
                  </div>

                  {nextLead?.lastDisposition && (
                    <div>
                      <div className="text-[10px] text-primary/50">
                        HISTORICAL OUTCOME
                      </div>
                      <div className="text-sm text-secondary uppercase font-bold terminal-glow-amber">
                        {nextLead.lastDisposition}
                      </div>
                    </div>
                  )}
                </div>

                {/* Softphone control panel */}
                {browserAudioEnabled && (
                  <div className="border-t border-primary/30 pt-4 space-y-3">
                    <div className="text-[10px] text-primary/50 tracking-widest">
                      SOFTPHONE CONTROLS
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={handleHold}
                        className={`border px-3 py-2 text-xs font-bold tracking-widest ${
                          onHold
                            ? "border-secondary bg-secondary text-black terminal-glow-amber"
                            : "border-primary text-primary hover:bg-primary hover:text-black"
                        }`}
                      >
                        [H] {onHold ? "RESUME" : "HOLD"}
                      </button>
                      <button
                        onClick={handleMute}
                        className={`border px-3 py-2 text-xs font-bold tracking-widest ${
                          muted
                            ? "border-destructive bg-destructive text-black"
                            : "border-primary text-primary hover:bg-primary hover:text-black"
                        }`}
                      >
                        [M] {muted ? "UNMUTE" : "MUTE"}
                      </button>
                      <button
                        onClick={() => setTransferOpen(true)}
                        className="border border-accent text-accent hover:bg-accent hover:text-black px-3 py-2 text-xs font-bold tracking-widest"
                      >
                        [T] TRANSFER
                      </button>
                      <button
                        onClick={handleLeave}
                        className="border border-secondary text-secondary hover:bg-secondary hover:text-black px-3 py-2 text-xs font-bold tracking-widest"
                      >
                        LEAVE LEG
                      </button>
                    </div>
                    <div className="text-[10px] text-primary/40 leading-relaxed">
                      {onHold
                        ? "// LEAD HEARS HOLD MUSIC. RESUME TO TALK."
                        : "// LIVE — LEAD HEARS YOU."}
                    </div>
                  </div>
                )}

                {/* Online agents */}
                <div className="border-t border-primary/30 pt-4 space-y-2">
                  <div className="text-[10px] text-primary/50 tracking-widest">
                    AGENTS ONLINE ({online.length})
                  </div>
                  <div className="space-y-1 text-xs">
                    {online.map((a) => (
                      <div
                        key={a.identity}
                        className={`flex justify-between ${
                          a.identity === self.identity
                            ? "text-primary"
                            : "text-primary/60"
                        }`}
                      >
                        <span>
                          {a.identity === self.identity ? "▸ " : "  "}
                          {a.displayName}
                        </span>
                        <span className="text-[9px] uppercase opacity-70">
                          {a.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* RIGHT: TRANSCRIPT & OPTIONS */}
          <Card className="col-span-2 bg-black/50 border-primary/50 rounded-none flex flex-col relative">
            <div className="absolute top-0 right-0 bg-primary/20 border-b border-l border-primary/50 px-3 py-1 text-[10px] font-bold">
              SCRIPT: {script?.name}
            </div>
            <CardContent className="p-6 flex-1 overflow-auto flex flex-col space-y-6">
              <div className="flex-1 space-y-4 pr-4 pb-20">
                {scriptLog.map((log, i) => {
                  const isCurrent = i === scriptLog.length - 1;
                  return (
                    <div
                      key={i}
                      className={`transition-all duration-300 ${
                        isCurrent ? "opacity-100" : "opacity-40 text-sm"
                      }`}
                    >
                      <div className="flex">
                        <span className="mr-4 text-primary/50">
                          {isCurrent ? ">" : " "}
                        </span>
                        <span
                          className={`whitespace-pre-wrap leading-relaxed ${
                            isCurrent ? "text-white font-bold tracking-wide" : ""
                          }`}
                        >
                          {log.text}
                          {isCurrent && (
                            <span className="inline-block w-2 h-4 bg-white ml-1 animate-pulse align-middle"></span>
                          )}
                        </span>
                      </div>

                      {isCurrent &&
                        currentNode?.options &&
                        currentNode.options.length > 0 && (
                          <div className="mt-6 ml-6 grid grid-cols-2 gap-3">
                            {currentNode.options.map((opt) => (
                              <div
                                key={opt.key}
                                className="border border-secondary/50 bg-secondary/10 p-2 flex items-center text-secondary terminal-glow-amber"
                              >
                                <div className="bg-secondary text-black font-bold px-2 py-1 mr-3 min-w-[30px] text-center">
                                  {opt.key}
                                </div>
                                <div className="text-sm font-bold uppercase tracking-wider">
                                  {opt.label}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* FOOTER HOTKEYS */}
      <div className="mt-4 border-t border-primary/30 pt-3 flex justify-between text-xs text-primary/60 tracking-widest">
        <div className="flex space-x-6">
          <span>
            <span className="text-primary font-bold border border-primary/50 px-1 mr-1">
              SPACE
            </span>{" "}
            ADVANCE / DIAL
          </span>
          {systemStatus === "LIVE" && browserAudioEnabled && (
            <>
              <span>
                <span className="text-primary font-bold border border-primary/50 px-1 mr-1">
                  H
                </span>{" "}
                HOLD
              </span>
              <span>
                <span className="text-primary font-bold border border-primary/50 px-1 mr-1">
                  M
                </span>{" "}
                MUTE
              </span>
              <span>
                <span className="text-accent font-bold border border-accent/50 px-1 mr-1">
                  T
                </span>{" "}
                TRANSFER
              </span>
            </>
          )}
          {systemStatus === "LIVE" && !currentNode?.options?.length && (
            <span>
              <span className="text-secondary font-bold border border-secondary/50 px-1 mr-1">
                1-9
              </span>{" "}
              QUICK DISPO
            </span>
          )}
        </div>
        <div>
          <span>
            <span className="text-destructive font-bold border border-destructive/50 px-1 mr-1">
              C
            </span>{" "}
            END CALL
          </span>
        </div>
      </div>

      {/* Transfer Dialog */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="bg-black border-primary text-primary font-mono rounded-none max-w-md">
          <DialogHeader>
            <DialogTitle className="text-primary terminal-glow tracking-widest">
              TRANSFER CALL
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-primary/60">
              SELECT TARGET AGENT (ONLINE):
            </div>
            {otherAgents.length === 0 ? (
              <div className="text-secondary text-sm py-4 text-center border border-secondary/30">
                NO OTHER AGENTS ONLINE
                <div className="text-[10px] mt-2 text-primary/50">
                  Open the dialer in another browser/window with a different
                  agent name to enable transfers.
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {otherAgents.map((a) => (
                  <div
                    key={a.identity}
                    className="border border-primary/40 p-3 flex justify-between items-center"
                  >
                    <div>
                      <div className="font-bold">{a.displayName}</div>
                      <div className="text-[10px] text-primary/50 uppercase">
                        {a.status} · {a.identity.slice(-8)}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleTransfer(a.identity, "warm")}
                        className="border border-accent text-accent px-2 py-1 text-[10px] hover:bg-accent hover:text-black"
                      >
                        WARM
                      </button>
                      <button
                        onClick={() => handleTransfer(a.identity, "blind")}
                        className="border border-secondary text-secondary px-2 py-1 text-[10px] hover:bg-secondary hover:text-black"
                      >
                        BLIND
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="text-[10px] text-primary/40 pt-2 border-t border-primary/30">
              WARM = both agents on the line. BLIND = drops you, target picks up.
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
