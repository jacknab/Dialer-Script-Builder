import React, { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useGetTwilioStatus } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [time, setTime] = useState(new Date().toLocaleTimeString());

  const { data: twilioStatus } = useGetTwilioStatus();

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date().toLocaleTimeString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const navItems = [
    { href: "/", label: "DASH" },
    { href: "/leads", label: "LEADS" },
    { href: "/scripts", label: "SCRIPTS" },
    { href: "/campaigns", label: "CAMPAIGNS" },
    { href: "/dialer", label: "DIALER" },
    { href: "/calls", label: "CALLS" },
    { href: "/settings", label: "SETTINGS" },
  ];

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden relative">
      <div className="scanline"></div>
      
      {/* Sidebar */}
      <div className="w-64 border-r border-border flex flex-col z-10 bg-background">
        <div className="p-4 border-b border-border font-bold tracking-widest text-lg">
          OUTBOUND // OPS
        </div>
        <div className="flex flex-col p-2 space-y-1 flex-1 overflow-y-auto">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="block">
              <div
                className={`px-4 py-2 hover:bg-primary/10 cursor-pointer transition-colors ${
                  location === item.href || (item.href !== "/" && location.startsWith(item.href))
                    ? "bg-primary/20 text-primary border-l-2 border-primary"
                    : "text-muted-foreground border-l-2 border-transparent"
                }`}
              >
                {item.label}
              </div>
            </Link>
          ))}
        </div>
        <div className="p-4 border-t border-border text-xs text-muted-foreground">
          v1.0.0-terminal
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-col flex-1 z-10 bg-background overflow-hidden">
        {/* Topbar */}
        <div className="h-14 border-b border-border flex items-center justify-between px-6">
          <div className="flex items-center space-x-4">
            <span className="text-sm">AGENT // 001</span>
            <div className="flex items-center space-x-2">
              <span className="text-xs text-muted-foreground">TWILIO:</span>
              {twilioStatus?.connected ? (
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary text-xs">CONNECTED</Badge>
              ) : (
                <Badge variant="outline" className="bg-secondary/10 text-secondary border-secondary text-xs">OFFLINE</Badge>
              )}
            </div>
          </div>
          <div className="text-accent font-bold tracking-widest">
            {time}
          </div>
        </div>

        {/* Page Content */}
        <div className="flex-1 overflow-auto relative">
          {!twilioStatus?.connected && location !== "/settings" && (
            <div className="bg-secondary/20 border-b border-secondary text-secondary p-2 text-center text-xs font-bold tracking-widest">
              WARNING: TWILIO NOT CONFIGURED — CALLS WILL BE LOGGED BUT NOT PLACED. GO TO SETTINGS.
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
