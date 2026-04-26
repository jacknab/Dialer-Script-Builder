import React, { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";

const fakeLead = {
  name: "Luxe Nail Studio",
  address: "7425 W Sunset Blvd, Los Angeles, CA",
  phone: "(323) 555-0192",
  rating: 4.6,
  reviews: 87,
  status: "HOT_LEAD",
};

const callHistory = [
  { date: "2025-03-02", result: "CALLBACK REQUESTED", agentId: "102" },
  { date: "2025-01-14", result: "NOT INTERESTED", agentId: "87" },
];

const callFlow = [
  { text: "Hi, is the owner available at Luxe Nail Studio?" },
  { text: "Thanks — I’ll be quick. We help nail salons automatically get more 5-star Google reviews using a simple SMS after each visit." },
  { text: "Right now most salons only get a small percentage of happy clients leaving reviews because they’re never prompted." },
  { text: "Our system sends an automatic text after every visit asking how the experience was and directs happy clients to leave a Google review." },
  {
    text: "If I could show you how salons are increasing their rating every week, would it be worth a quick look?",
    options: [
      { key: "1", label: "Interested" },
      { key: "2", label: "Not Interested" },
      { key: "3", label: "Callback" },
      { key: "4", label: "Wrong Number" }
    ]
  }
];

const dispositions = {
  "1": "INTERESTED",
  "2": "NOT INTERESTED",
  "3": "CALLBACK",
  "4": "WRONG NUMBER",
};

export default function TerminalDialerMockup() {
  const [callState, setCallState] = useState("RINGING");
  const [systemStatus, setSystemStatus] = useState("ACTIVE");

  const [callStart, setCallStart] = useState(null);
  const [timer, setTimer] = useState("00:00");

  const [notes, setNotes] = useState("");
  const [hotLead, setHotLead] = useState(false);

  const [scriptIndex, setScriptIndex] = useState(-1);
  const [viewIndex, setViewIndex] = useState(-1);
  const [scriptLog, setScriptLog] = useState([]);

  const audioRef = useRef(null);

  useEffect(() => {
    let interval;
    if (callStart && systemStatus !== "OFFLINE") {
      interval = setInterval(() => {
        const diff = Math.floor((Date.now() - callStart) / 1000);
        const m = String(Math.floor(diff / 60)).padStart(2, "0");
        const s = String(diff % 60).padStart(2, "0");
        setTimer(`${m}:${s}`);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [callStart, systemStatus]);

  const resetToNextLead = () => {
    setScriptIndex(-1);
    setViewIndex(-1);
    setScriptLog([]);
    setCallStart(null);
    setTimer("00:00");
    setCallState("RINGING");
    setNotes("");
    setHotLead(false);
  };

  useEffect(() => {
    const handler = (e) => {
      const key = e.key.toLowerCase();

      if (systemStatus === "OFFLINE") return;

      if (key === " " || key === "enter") {
        if (!callStart) {
          setCallStart(Date.now());
          setCallState("LIVE");

          setScriptIndex(0);
          setViewIndex(0);
          setScriptLog([callFlow[0].text]);
          return;
        }

        setScriptIndex((prev) => {
          const next = Math.min(prev + 1, callFlow.length - 1);
          setViewIndex(next);
          setScriptLog((l) => [...l, callFlow[next].text]);
          return next;
        });
      }

      if (key === "arrowup") {
        setViewIndex((v) => Math.max(0, v - 1));
      }

      if (key === "c") setCallState("WRAPUP");

      if (dispositions[key]) {
        if (dispositions[key] === "INTERESTED") setHotLead(true);
        setTimeout(() => resetToNextLead(), 500);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [callStart, systemStatus]);

  const currentLine = callFlow[viewIndex] || {};

  return (
    <div className="p-4 bg-black text-green-400 min-h-screen font-mono flex flex-col">

      <div className="grid grid-cols-3 gap-4 flex-1">

        <Card className="bg-black border-green-500 col-span-1">
          <CardContent className="p-4">
            <h2>LEAD</h2>
            <p>{fakeLead.name}</p>
            <p className="text-green-400">
              {fakeLead.address.split(",")[0]}<br />
              {fakeLead.address.split(",")[1]}
            </p>
            <p>{fakeLead.phone}</p>
          </CardContent>
        </Card>

        <Card className="col-span-2 bg-black border-green-500">
          <CardContent className="p-4 h-[420px] overflow-auto">

            {scriptLog.map((t, i) => (
              <div key={i} className={i === viewIndex ? "text-white font-bold" : "text-gray-500"}>
                {i === viewIndex ? "> " + t : "  " + t}

                {i === viewIndex && currentLine.options && (
                  <div className="mt-2 text-xs text-orange-400">
                    {currentLine.options.map((o) => (
                      <div key={o.key}>
                        Press {o.key} = {o.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

          </CardContent>
        </Card>

      </div>

      <div className="mt-2 border-t border-green-700 pt-2 text-xs flex justify-between">
        <span>SPACE: NEXT</span>
        <span>ARROW UP: REVIEW PREV</span>
        <span>C: END</span>
      </div>

    </div>
  );
}
