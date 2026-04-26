import { useState } from "react";
import { useGetDashboardSummary, useGetRecentCalls } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { format } from "date-fns";

export default function Dashboard() {
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary();
  const { data: recentCalls, isLoading: loadingCalls } = useGetRecentCalls({ limit: 10 });

  if (loadingSummary || loadingCalls) {
    return <div className="p-6 text-muted-foreground animate-pulse">LOADING DASHBOARD DATA...</div>;
  }

  if (!summary) return <div className="p-6 text-destructive">ERROR LOADING DASHBOARD</div>;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl border-b border-border pb-2 mb-6">SYSTEM DASHBOARD</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <MetricCard title="TOTAL LEADS" value={summary.totalLeads} />
        <MetricCard title="WITH PHONE" value={summary.leadsWithPhone} />
        <MetricCard title="TOTAL CALLS" value={summary.totalCalls} />
        <MetricCard title="CALLS TODAY" value={summary.callsToday} />
        <MetricCard title="HOT LEADS" value={summary.hotLeads} />
        <MetricCard title="AVG DUR (SEC)" value={summary.avgDurationSec || 0} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-background border-border rounded-none">
          <CardHeader className="border-b border-border pb-2">
            <CardTitle className="text-sm font-mono tracking-widest text-primary">DISPOSITIONS</CardTitle>
          </CardHeader>
          <CardContent className="pt-4 h-[300px]">
            {summary.dispositions && summary.dispositions.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={summary.dispositions} layout="vertical" margin={{ top: 0, right: 0, left: 40, bottom: 0 }}>
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis dataKey="key" type="category" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} width={100} />
                  <Tooltip 
                    cursor={{fill: 'hsl(var(--muted))'}}
                    contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', borderRadius: 0, color: 'hsl(var(--primary))' }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={0} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">// NO DATA</div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-background border-border rounded-none flex flex-col">
          <CardHeader className="border-b border-border pb-2">
            <CardTitle className="text-sm font-mono tracking-widest text-primary">RECENT CALLS</CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-auto">
            {recentCalls && recentCalls.length > 0 ? (
              <div className="divide-y divide-border">
                {recentCalls.map(call => (
                  <div key={call.id} className="p-3 flex justify-between items-center hover:bg-muted/50 transition-colors text-sm">
                    <div>
                      <div className="text-foreground">{call.leadName || `LEAD #${call.leadId}`}</div>
                      <div className="text-muted-foreground text-xs">{call.leadPhone || "NO PHONE"}</div>
                    </div>
                    <div className="text-right">
                      <div className={`font-bold ${call.disposition === 'INTERESTED' ? 'text-secondary terminal-glow-amber' : 'text-primary'}`}>
                        {call.disposition || "NO DISPO"}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {call.createdAt ? format(new Date(call.createdAt), "HH:mm:ss") : "UNKNOWN"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm p-4">// NO RECENT CALLS</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ title, value }: { title: string, value: string | number }) {
  return (
    <Card className="bg-background border-border rounded-none">
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground mb-1 tracking-widest">{title}</div>
        <div className="text-2xl font-bold text-primary">{value}</div>
      </CardContent>
    </Card>
  );
}
