import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useListScripts, useCreateScript, getListScriptsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function Scripts() {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: scripts, isLoading } = useListScripts();
  const createScript = useCreateScript();

  const handleCreate = () => {
    if (!name.trim()) return;
    createScript.mutate({
      data: { name, description: description || undefined, isActive: true }
    }, {
      onSuccess: (newScript) => {
        setIsOpen(false);
        queryClient.invalidateQueries({ queryKey: getListScriptsQueryKey() });
        setLocation(`/scripts/${newScript.id}`);
      }
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-end border-b border-border pb-2">
        <h1 className="text-2xl">SCRIPT LIBRARY</h1>
        
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-none bg-primary text-primary-foreground font-bold hover:bg-primary/90">
              [+] NEW SCRIPT
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-none border border-border bg-background sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="text-primary font-mono tracking-widest">CREATE NEW SCRIPT</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">SCRIPT NAME</label>
                <Input 
                  value={name} 
                  onChange={e => setName(e.target.value)} 
                  className="rounded-none border-border bg-transparent focus-visible:ring-primary"
                  placeholder="e.g. NAIL SALON V1"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">DESCRIPTION (OPTIONAL)</label>
                <Input 
                  value={description} 
                  onChange={e => setDescription(e.target.value)} 
                  className="rounded-none border-border bg-transparent focus-visible:ring-primary"
                  placeholder="e.g. Focus on google reviews"
                />
              </div>
            </div>
            <DialogFooter>
              <Button 
                onClick={handleCreate} 
                disabled={createScript.isPending || !name.trim()}
                className="rounded-none bg-primary text-primary-foreground font-bold w-full"
              >
                {createScript.isPending ? "INITIALIZING..." : "INITIALIZE SCRIPT"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="animate-pulse text-muted-foreground">LOADING SCRIPTS...</div>
      ) : !scripts || scripts.length === 0 ? (
        <div className="text-center p-12 text-muted-foreground border border-dashed border-border">
          // NO SCRIPTS FOUND. CREATE ONE TO BEGIN.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {scripts.map(script => (
            <Link key={script.id} href={`/scripts/${script.id}`}>
              <Card className="bg-background border-border rounded-none hover:border-primary cursor-pointer transition-colors group">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg group-hover:text-primary transition-colors">{script.name}</CardTitle>
                    {script.isActive ? (
                      <Badge variant="outline" className="border-primary text-primary rounded-none bg-primary/10 text-[10px]">ACTIVE</Badge>
                    ) : (
                      <Badge variant="outline" className="border-muted-foreground text-muted-foreground rounded-none text-[10px]">DRAFT</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-2 min-h-[40px] mb-4">
                    {script.description || "// NO DESCRIPTION"}
                  </p>
                  <div className="flex justify-between items-center text-xs border-t border-border pt-4">
                    <span className="text-accent">{script.nodeCount} NODES</span>
                    <span className="text-muted-foreground">ID: {script.id}</span>
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
