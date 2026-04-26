import { useParams, Link } from "wouter";
import { useGetCampaign, getGetCampaignQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

export default function CampaignDetail() {
  const params = useParams();
  const campaignId = Number(params.id);

  const { data: campaign, isLoading } = useGetCampaign(campaignId, {
    query: { enabled: !!campaignId, queryKey: getGetCampaignQueryKey(campaignId) }
  });

  if (isLoading) return <div className="p-6 animate-pulse text-muted-foreground">LOADING CAMPAIGN DATA...</div>;
  if (!campaign) return <div className="p-6 text-destructive">CAMPAIGN NOT FOUND</div>;

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex justify-between items-start border-b border-border pb-4">
        <div>
          <div className="text-muted-foreground text-sm mb-1">
            <Link href="/campaigns" className="hover:text-accent hover:underline">{"< BACK TO CAMPAIGNS"}</Link>
          </div>
          <h1 className="text-3xl font-bold text-primary">{campaign.name}</h1>
          <div className="flex space-x-2 mt-2">
            <Badge variant="outline" className={`rounded-none ${
              campaign.status === 'ACTIVE' ? 'border-primary text-primary bg-primary/10' : 
              'border-muted-foreground text-muted-foreground'
            }`}>
              STATUS: {campaign.status}
            </Badge>
          </div>
        </div>
        <Link href={`/dialer?campaignId=${campaign.id}`}>
          <Button className="rounded-none bg-primary text-primary-foreground hover:bg-primary/90 font-bold tracking-widest px-8 py-6 h-auto text-lg terminal-glow">
            ENTER DIALER {">>"}
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-background border-border rounded-none">
          <CardHeader className="border-b border-border pb-2">
            <CardTitle className="text-sm font-mono tracking-widest text-primary">CAMPAIGN OPS</CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-6">
            <div>
              <div className="text-xs text-muted-foreground mb-1">QUEUE SIZE (UNTOUCHED)</div>
              <div className="text-4xl font-bold text-accent">{campaign.queueSize ?? "--"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">CALLS EXECUTED</div>
              <div className="text-2xl">{campaign.callsMade || 0}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">ASSIGNED SCRIPT</div>
              <div className="text-sm text-primary">{campaign.script?.name || `ID: ${campaign.scriptId}`}</div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-background border-border rounded-none flex flex-col h-[300px]">
          <CardHeader className="border-b border-border pb-2">
            <CardTitle className="text-sm font-mono tracking-widest text-primary">RECENT DISPOSITIONS</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center flex-1 text-muted-foreground">
            // LIVE FEED UNAVAILABLE IN THIS VIEW
            <br/>
            SEE DASHBOARD FOR BREAKDOWNS
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
