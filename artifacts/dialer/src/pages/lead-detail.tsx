import { useParams, Link, useLocation } from "wouter";
import { useGetLead, useStartCall, getGetLeadQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

export default function LeadDetail() {
  const params = useParams();
  const leadId = Number(params.id);
  const [, setLocation] = useLocation();

  const { data: lead, isLoading } = useGetLead(leadId, {
    query: { enabled: !!leadId, queryKey: getGetLeadQueryKey(leadId) }
  });

  const startCall = useStartCall();

  if (isLoading) return <div className="p-6 animate-pulse text-muted-foreground">LOADING RECORD...</div>;
  if (!lead) return <div className="p-6 text-destructive">RECORD NOT FOUND</div>;

  const handleCallNow = () => {
    // Generic call outside campaign
    startCall.mutate({
      data: { leadId }
    }, {
      onSuccess: (call) => {
        setLocation(`/dialer?callId=${call.id}&leadId=${lead.id}`);
      }
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-start border-b border-border pb-4">
        <div>
          <div className="text-muted-foreground text-sm mb-1">
            <Link href="/leads" className="hover:text-accent hover:underline">{"< BACK TO INBOX"}</Link>
          </div>
          <h1 className="text-3xl font-bold text-primary">{lead.name}</h1>
          <div className="flex space-x-2 mt-2">
            <Badge variant="outline" className="border-primary text-primary rounded-none bg-primary/10">
              STATUS: {lead.status}
            </Badge>
            <Badge variant="outline" className="border-secondary text-secondary rounded-none bg-secondary/10">
              TIER: {lead.tier}
            </Badge>
            <Badge variant="outline" className="border-muted-foreground text-muted-foreground rounded-none">
              SCORE: {lead.leadScore}
            </Badge>
          </div>
        </div>
        <Button 
          onClick={handleCallNow}
          disabled={startCall.isPending}
          className="rounded-none bg-primary text-primary-foreground hover:bg-primary/90 font-bold tracking-widest px-8"
        >
          {startCall.isPending ? "INITIALIZING..." : "CALL NOW"}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-background border-border rounded-none">
          <CardHeader className="border-b border-border pb-2">
            <CardTitle className="text-sm font-mono tracking-widest text-primary">CONTACT INFO</CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            <div>
              <div className="text-xs text-muted-foreground">PHONE</div>
              <div className="text-lg font-mono">{lead.phone || "--"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">ADDRESS</div>
              <div className="text-md">{lead.address || "--"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">WEBSITE</div>
              <div className="text-md text-accent">{lead.website || "--"}</div>
            </div>
            {lead.signalTags && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">SIGNALS</div>
                <div className="flex flex-wrap gap-2">
                  {lead.signalTags.split(',').map(tag => (
                    <Badge key={tag} variant="outline" className="rounded-none border-border bg-muted">
                      {tag.trim()}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-background border-border rounded-none flex flex-col h-[400px]">
          <CardHeader className="border-b border-border pb-2">
            <CardTitle className="text-sm font-mono tracking-widest text-primary">CALL HISTORY</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-auto flex-1">
            {lead.calls && lead.calls.length > 0 ? (
              <div className="divide-y divide-border">
                {lead.calls.map(call => (
                  <div key={call.id} className="p-4 space-y-2 hover:bg-muted/30 transition-colors">
                    <div className="flex justify-between">
                      <span className={`font-bold ${call.disposition === 'INTERESTED' ? 'text-secondary' : 'text-primary'}`}>
                        {call.disposition || "NO DISPOSITION"}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {call.createdAt ? format(new Date(call.createdAt), "MMM d, yyyy HH:mm") : "--"}
                      </span>
                    </div>
                    {call.notes && (
                      <div className="text-sm border-l-2 border-muted-foreground pl-2 text-muted-foreground">
                        "{call.notes}"
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground flex justify-between">
                      <span>DUR: {call.durationSec || 0}s</span>
                      <span>ID: {call.id}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                // NO CALL HISTORY
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
