import { useState, useEffect } from "react";
import { Link, useSearch } from "wouter";
import { 
  useGetCampaignNextLead, 
  useStartCall, 
  useUpdateCall, 
  useEndCall,
  useGetScript,
  useGetCampaign,
  getGetCampaignNextLeadQueryKey,
  getGetCampaignQueryKey,
  getGetScriptQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
  const campaignId = Number(searchParams.get("campaignId"));
  
  const queryClient = useQueryClient();

  // Campaign & Script Context
  const { data: campaign, isLoading: campLoading } = useGetCampaign(campaignId, { query: { enabled: !!campaignId, queryKey: getGetCampaignQueryKey(campaignId) } });
  const scriptId = campaign?.scriptId;
  const { data: script, isLoading: scriptLoading } = useGetScript(scriptId || 0, { query: { enabled: !!scriptId, queryKey: getGetScriptQueryKey(scriptId || 0) } });

  // Dialer State
  const [systemStatus, setSystemStatus] = useState<"READY" | "DIALING" | "LIVE" | "WRAPUP">("READY");
  const [callId, setCallId] = useState<number | null>(null);
  const [callStart, setCallStart] = useState<number | null>(null);
  const [timer, setTimer] = useState("00:00");
  
  // Script Navigation State
  const [currentNodeId, setCurrentNodeId] = useState<number | null>(null);
  const [scriptLog, setScriptLog] = useState<{nodeId: number, text: string}[]>([]);

  // API Hooks
  const { data: nextLeadData, isLoading: peekLoading, refetch: refetchNextLead } = useGetCampaignNextLead(campaignId, { 
    query: { enabled: !!campaignId && systemStatus === "READY", queryKey: getGetCampaignNextLeadQueryKey(campaignId) } 
  });
  
  const startCall = useStartCall();
  const updateCall = useUpdateCall();
  const endCall = useEndCall();

  const nextLead = nextLeadData?.lead;
  const queueRemaining = nextLeadData?.remaining || 0;

  // Timer Effect
  useEffect(() => {
    let interval: any;
    if (callStart && systemStatus === "LIVE") {
      interval = setInterval(() => {
        const diff = Math.floor((Date.now() - callStart) / 1000);
        const m = String(Math.floor(diff / 60)).padStart(2, "0");
        const s = String(diff % 60).padStart(2, "0");
        setTimer(`${m}:${s}`);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [callStart, systemStatus]);

  // Derived Script helpers
  const currentNode = script?.nodes?.find(n => n.id === currentNodeId);
  const rootNode = script?.nodes?.find(n => n.id === script.rootNodeId) || script?.nodes?.[0];

  const advanceToNode = (id: number) => {
    setCurrentNodeId(id);
    const n = script?.nodes?.find(n => n.id === id);
    if (n) {
      setScriptLog(prev => [...prev, { nodeId: n.id, text: n.message }]);
    }
  };

  const handleStartCall = () => {
    if (!nextLead || !scriptId) return;
    setSystemStatus("DIALING");
    
    startCall.mutate({
      data: { leadId: nextLead.id, scriptId, campaignId }
    }, {
      onSuccess: (call) => {
        setCallId(call.id);
        setCallStart(Date.now());
        setSystemStatus("LIVE");
        if (rootNode) {
          advanceToNode(rootNode.id);
        }
      },
      onError: () => {
        setSystemStatus("READY");
        alert("Failed to start call");
      }
    });
  };

  const handleSaveDisposition = (dispo: string) => {
    if (!callId) return;
    setSystemStatus("WRAPUP");
    
    // Compute path taken
    const pathStr = scriptLog.map(l => l.nodeId).join(" -> ");
    
    updateCall.mutate({
      callId,
      data: { 
        status: "COMPLETED", 
        disposition: dispo,
        pathTaken: pathStr
      }
    }, {
      onSuccess: () => {
        endCall.mutate({ callId }, {
          onSettled: () => {
            // Reset for next
            setSystemStatus("READY");
            setCallId(null);
            setCallStart(null);
            setTimer("00:00");
            setCurrentNodeId(null);
            setScriptLog([]);
            queryClient.invalidateQueries({ queryKey: getGetCampaignNextLeadQueryKey(campaignId) });
          }
        });
      }
    });
  };

  // Keyboard Controls
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      
      // Prevent default scrolling for space
      if (key === " ") e.preventDefault();

      if (systemStatus === "READY" && (key === " " || key === "enter")) {
        handleStartCall();
        return;
      }

      if (systemStatus !== "LIVE" || !currentNode) return;

      // Handle branching or disposition based on options
      if (['1','2','3','4','5','6','7','8','9'].includes(key)) {
        const opt = currentNode.options?.find(o => o.key === key);
        if (opt) {
          if (opt.nextNodeId) {
            advanceToNode(opt.nextNodeId);
          } else if (opt.disposition) {
            handleSaveDisposition(opt.disposition);
          }
        } else if (!currentNode.options?.length && DISPOSITIONS[key]) {
          // Global hotkeys fallback if no options defined
          handleSaveDisposition(DISPOSITIONS[key]);
        }
      }

      // Space to advance to single child if no explicit key map
      if (key === " " && currentNode.options?.length === 1 && currentNode.options[0].nextNodeId) {
        advanceToNode(currentNode.options[0].nextNodeId);
      }

      // C to end without disposition
      if (key === "c") {
        handleSaveDisposition("ABANDONED");
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [systemStatus, currentNode, callId, nextLead, scriptId, campaignId, startCall, updateCall, endCall, advanceToNode, handleSaveDisposition]);

  if (!campaignId) {
    return <div className="p-6 text-destructive font-mono">ERROR: CAMPAIGN ID REQUIRED</div>;
  }

  if (campLoading || scriptLoading || (systemStatus === "READY" && peekLoading)) {
    return (
      <div className="flex h-full items-center justify-center bg-black text-primary font-mono animate-pulse">
        [ INITIALIZING COMMAND DECK... ]
      </div>
    );
  }

  return (
    <div className="h-full bg-[#0a0e0a] text-primary p-4 font-mono flex flex-col relative overflow-hidden select-none">
      
      {/* HUD HEADER */}
      <div className="flex justify-between items-center mb-4 border-b border-primary/30 pb-2">
        <div className="flex items-center space-x-4">
          <div className="text-xl font-bold tracking-widest flex items-center">
            {systemStatus === "LIVE" && <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse mr-2 shadow-[0_0_8px_#ff0000]"></span>}
            {systemStatus === "READY" && <span className="w-3 h-3 bg-primary rounded-full mr-2"></span>}
            {systemStatus === "WRAPUP" && <span className="w-3 h-3 bg-secondary rounded-full mr-2"></span>}
            STATUS: {systemStatus}
          </div>
          <Badge variant="outline" className="border-primary/50 text-primary/70 rounded-none">
            CMP: {campaign?.name}
          </Badge>
          <Badge variant="outline" className="border-primary/50 text-primary/70 rounded-none">
            Q: {queueRemaining}
          </Badge>
        </div>
        <div className="text-2xl font-bold tracking-widest">{timer}</div>
      </div>

      {systemStatus === "READY" ? (
        <div className="flex-1 flex flex-col items-center justify-center border border-primary/20 bg-primary/5 shadow-[inset_0_0_50px_rgba(0,255,0,0.05)] relative">
          <div className="scanline"></div>
          {nextLead ? (
            <div className="text-center z-10">
              <div className="text-sm text-primary/60 mb-2">TARGET IDENTIFIED</div>
              <div className="text-4xl font-bold mb-8 text-white terminal-glow">{nextLead.name}</div>
              <div className="text-xl animate-pulse">PRESS [SPACE] TO INITIATE SEQUENCE</div>
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
          
          {/* LEFT: TARGET INTEL */}
          <div className="col-span-1 flex flex-col space-y-4">
            <Card className="bg-black/50 border-primary/50 rounded-none flex-1">
              <CardContent className="p-6 space-y-6">
                <div className="border-b border-primary/30 pb-2 mb-4">
                  <div className="text-xs text-primary/50 mb-1">TARGET IDENTITY</div>
                  <h2 className="text-2xl font-bold text-white tracking-wide">{nextLead?.name}</h2>
                </div>

                <div className="space-y-4">
                  <div>
                    <div className="text-[10px] text-primary/50">COMM CHANNEL</div>
                    <div className="text-xl text-accent terminal-glow">{nextLead?.phone || "UNKNOWN"}</div>
                  </div>
                  
                  <div>
                    <div className="text-[10px] text-primary/50">GEO-COORDS</div>
                    <div className="text-sm text-primary/80 uppercase">
                      {nextLead?.address?.split(",")[0]}<br />
                      {nextLead?.address?.split(",").slice(1).join(",")}
                    </div>
                  </div>

                  {nextLead?.lastDisposition && (
                    <div>
                      <div className="text-[10px] text-primary/50">HISTORICAL OUTCOME</div>
                      <div className="text-sm text-secondary uppercase font-bold terminal-glow-amber">
                        {nextLead.lastDisposition}
                      </div>
                    </div>
                  )}

                  {nextLead?.signalTags && (
                    <div>
                      <div className="text-[10px] text-primary/50 mb-1">INTEL SIGNALS</div>
                      <div className="flex flex-wrap gap-2">
                        {nextLead.signalTags.split(',').map((tag: string) => (
                          <span key={tag} className="text-[10px] bg-primary/20 border border-primary/50 px-2 py-1">
                            {tag.trim()}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
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
                    <div key={i} className={`transition-all duration-300 ${isCurrent ? 'opacity-100' : 'opacity-40 text-sm'}`}>
                      <div className="flex">
                        <span className="mr-4 text-primary/50">{isCurrent ? '>' : ' '}</span>
                        <span className={`whitespace-pre-wrap leading-relaxed ${isCurrent ? 'text-white font-bold tracking-wide' : ''}`}>
                          {log.text}
                          {isCurrent && <span className="inline-block w-2 h-4 bg-white ml-1 animate-pulse align-middle"></span>}
                        </span>
                      </div>
                      
                      {isCurrent && currentNode?.options && currentNode.options.length > 0 && (
                        <div className="mt-6 ml-6 grid grid-cols-2 gap-3">
                          {currentNode.options.map(opt => (
                            <div key={opt.key} className="border border-secondary/50 bg-secondary/10 p-2 flex items-center text-secondary terminal-glow-amber">
                              <div className="bg-secondary text-black font-bold px-2 py-1 mr-3 min-w-[30px] text-center">
                                {opt.key}
                              </div>
                              <div className="text-sm font-bold uppercase tracking-wider">{opt.label}</div>
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
          <span><span className="text-primary font-bold border border-primary/50 px-1 mr-1">SPACE</span> ADVANCE / DIAL</span>
          {systemStatus === "LIVE" && !currentNode?.options?.length && (
            <span><span className="text-secondary font-bold border border-secondary/50 px-1 mr-1">1-9</span> QUICK DISPO</span>
          )}
        </div>
        <div>
          <span><span className="text-destructive font-bold border border-destructive/50 px-1 mr-1">C</span> END CALL</span>
        </div>
      </div>
      
    </div>
  );
}
