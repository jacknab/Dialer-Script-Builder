import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useListCampaigns, useCreateCampaign, useListScripts, getListCampaignsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

export default function Campaigns() {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [scriptId, setScriptId] = useState<string>("");
  
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: campaigns, isLoading } = useListCampaigns();
  const { data: scripts } = useListScripts();
  const createCampaign = useCreateCampaign();

  const handleCreate = () => {
    if (!name.trim() || !scriptId) return;
    createCampaign.mutate({
      data: { name, scriptId: parseInt(scriptId), leadFilter: null }
    }, {
      onSuccess: (newCampaign) => {
        setIsOpen(false);
        queryClient.invalidateQueries({ queryKey: getListCampaignsQueryKey() });
        setLocation(`/campaigns/${newCampaign.id}`);
      }
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-end border-b border-border pb-2">
        <h1 className="text-2xl">ACTIVE CAMPAIGNS</h1>
        
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-none bg-primary text-primary-foreground font-bold hover:bg-primary/90">
              [+] LAUNCH CAMPAIGN
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-none border border-border bg-background sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="text-primary font-mono tracking-widest">NEW CAMPAIGN PARAMETERS</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">CAMPAIGN ALIAS</label>
                <Input 
                  value={name} 
                  onChange={e => setName(e.target.value)} 
                  className="rounded-none border-border bg-transparent focus-visible:ring-primary"
                  placeholder="e.g. NAIL SALONS LA"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">ASSIGNED SCRIPT</label>
                <Select value={scriptId} onValueChange={setScriptId}>
                  <SelectTrigger className="w-full rounded-none bg-transparent border-border">
                    <SelectValue placeholder="SELECT SCRIPT" />
                  </SelectTrigger>
                  <SelectContent className="rounded-none border-border bg-popover text-popover-foreground">
                    {scripts?.filter(s => s.isActive).map(script => (
                      <SelectItem key={script.id} value={script.id.toString()}>
                        {script.name}
                      </SelectItem>
                    ))}
                    {scripts?.filter(s => s.isActive).length === 0 && (
                      <SelectItem value="disabled" disabled>NO ACTIVE SCRIPTS AVAILABLE</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button 
                onClick={handleCreate} 
                disabled={createCampaign.isPending || !name.trim() || !scriptId}
                className="rounded-none bg-primary text-primary-foreground font-bold w-full"
              >
                {createCampaign.isPending ? "INITIALIZING..." : "COMPILE AND LAUNCH"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="animate-pulse text-muted-foreground">SCANNING CAMPAIGNS...</div>
      ) : !campaigns || campaigns.length === 0 ? (
        <div className="text-center p-12 text-muted-foreground border border-dashed border-border">
          // NO CAMPAIGNS IN SYSTEM. LAUNCH ONE TO BEGIN OUTBOUND OPERATIONS.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {campaigns.map(camp => (
            <Link key={camp.id} href={`/campaigns/${camp.id}`}>
              <Card className="bg-background border-border rounded-none hover:border-primary cursor-pointer transition-colors group h-full flex flex-col">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg group-hover:text-primary transition-colors">{camp.name}</CardTitle>
                    <Badge variant="outline" className={`rounded-none text-[10px] ${
                      camp.status === 'ACTIVE' ? 'border-primary text-primary bg-primary/10' : 
                      camp.status === 'COMPLETED' ? 'border-muted-foreground text-muted-foreground' : 
                      'border-secondary text-secondary bg-secondary/10'
                    }`}>
                      {camp.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-between">
                  <div className="mb-4">
                    <div className="text-xs text-muted-foreground mb-1">CALLS EXECUTED</div>
                    <div className="text-2xl font-bold text-accent">{camp.callsMade || 0}</div>
                  </div>
                  <div className="flex justify-between items-center text-xs border-t border-border pt-4">
                    <span className="text-muted-foreground">SCRIPT ID: {camp.scriptId}</span>
                    <span className="text-muted-foreground">
                      {camp.createdAt ? format(new Date(camp.createdAt), "MM/dd/yy") : "--"}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
