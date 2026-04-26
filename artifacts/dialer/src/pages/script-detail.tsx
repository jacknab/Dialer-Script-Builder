import { useState } from "react";
import { useParams, Link } from "wouter";
import { 
  useGetScript, 
  useCreateScriptNode, 
  useUpdateScriptNode, 
  useDeleteScriptNode,
  useUpdateScript,
  getGetScriptQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";

export default function ScriptDetail() {
  const params = useParams();
  const scriptId = Number(params.id);
  const queryClient = useQueryClient();

  const { data: script, isLoading } = useGetScript(scriptId, {
    query: { enabled: !!scriptId, queryKey: getGetScriptQueryKey(scriptId) }
  });

  const createNode = useCreateScriptNode();
  const updateNode = useUpdateScriptNode();
  const deleteNode = useDeleteScriptNode();
  const updateScript = useUpdateScript();

  if (isLoading) return <div className="p-6 animate-pulse text-muted-foreground">DECRYPTING SCRIPT GRAPH...</div>;
  if (!script) return <div className="p-6 text-destructive">SCRIPT COMPILATION FAILED: NOT FOUND</div>;

  const handleAddNode = () => {
    createNode.mutate({
      scriptId,
      data: {
        title: "NEW NODE",
        message: "Enter script text here...",
        nodeType: "STANDARD",
        options: []
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetScriptQueryKey(scriptId) });
      }
    });
  };

  const handleSetRoot = (nodeId: number) => {
    updateScript.mutate({
      scriptId,
      data: { rootNodeId: nodeId }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetScriptQueryKey(scriptId) });
      }
    });
  };

  const handleDelete = (nodeId: number) => {
    if (!confirm("DELETE THIS NODE? IT MAY BREAK EXISTING BRANCHES.")) return;
    deleteNode.mutate({
      scriptId,
      nodeId
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetScriptQueryKey(scriptId) });
      }
    });
  };

  return (
    <div className="p-6 space-y-6 flex flex-col h-full">
      <div className="flex justify-between items-start border-b border-border pb-4 shrink-0">
        <div>
          <div className="text-muted-foreground text-sm mb-1">
            <Link href="/scripts" className="hover:text-accent hover:underline">{"< BACK TO LIBRARY"}</Link>
          </div>
          <h1 className="text-3xl font-bold text-primary">{script.name}</h1>
          <div className="text-muted-foreground text-sm mt-1">{script.description || "// NO DESCRIPTION"}</div>
        </div>
        <Button 
          onClick={handleAddNode}
          disabled={createNode.isPending}
          className="rounded-none bg-primary text-primary-foreground font-bold hover:bg-primary/90"
        >
          [+] ADD NODE
        </Button>
      </div>

      {!script.nodes || script.nodes.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground border border-dashed border-border p-12">
          <div className="mb-4">// SCRIPT IS EMPTY — ADD A FIRST NODE TO BEGIN</div>
          <Button onClick={handleAddNode} variant="outline" className="rounded-none border-primary text-primary hover:bg-primary/10">
            INITIALIZE FIRST NODE
          </Button>
        </div>
      ) : (
        <div className="flex-1 overflow-auto pr-4 pb-12 space-y-8 relative">
          {/* We'll render them in order of creation or just a list for now, with visual links conceptually */}
          {script.nodes.map((node) => (
            <NodeEditor 
              key={node.id} 
              node={node} 
              allNodes={script.nodes} 
              scriptId={scriptId}
              isRoot={script.rootNodeId === node.id}
              onSetRoot={() => handleSetRoot(node.id)}
              onDelete={() => handleDelete(node.id)}
              onUpdate={() => queryClient.invalidateQueries({ queryKey: getGetScriptQueryKey(scriptId) })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Sub-component for editing a single node
function NodeEditor({ node, allNodes, scriptId, isRoot, onSetRoot, onDelete, onUpdate }: any) {
  const updateNode = useUpdateScriptNode();
  
  const [title, setTitle] = useState(node.title || "");
  const [message, setMessage] = useState(node.message || "");
  const [options, setOptions] = useState<any[]>(node.options || []);
  const [isDirty, setIsDirty] = useState(false);

  const handleSave = () => {
    updateNode.mutate({
      scriptId,
      nodeId: node.id,
      data: { title, message, options }
    }, {
      onSuccess: () => {
        setIsDirty(false);
        onUpdate();
      }
    });
  };

  const addOption = () => {
    setOptions([...options, { key: String(options.length + 1), label: "New Option", nextNodeId: null, disposition: null }]);
    setIsDirty(true);
  };

  const updateOption = (index: number, field: string, value: any) => {
    const newOptions = [...options];
    newOptions[index] = { ...newOptions[index], [field]: value };
    // Clear the other field if one is set
    if (field === 'nextNodeId' && value) newOptions[index].disposition = null;
    if (field === 'disposition' && value) newOptions[index].nextNodeId = null;
    
    setOptions(newOptions);
    setIsDirty(true);
  };

  const removeOption = (index: number) => {
    const newOptions = [...options];
    newOptions.splice(index, 1);
    setOptions(newOptions);
    setIsDirty(true);
  };

  return (
    <Card className={`bg-background border ${isRoot ? 'border-primary shadow-[0_0_10px_rgba(0,255,0,0.1)]' : 'border-border'} rounded-none`}>
      <CardHeader className={`border-b ${isRoot ? 'border-primary bg-primary/5' : 'border-border bg-muted/20'} pb-3 flex flex-row items-center justify-between`}>
        <div className="flex items-center space-x-4 flex-1">
          <Badge variant="outline" className={`rounded-none ${isRoot ? 'border-primary text-primary' : 'border-muted-foreground text-muted-foreground'}`}>
            ID: {node.id}
          </Badge>
          {isRoot && <Badge variant="outline" className="rounded-none bg-primary text-primary-foreground border-primary font-bold">ENTRY POINT</Badge>}
          <Input 
            value={title}
            onChange={e => { setTitle(e.target.value); setIsDirty(true); }}
            className="h-8 max-w-[250px] bg-transparent border-transparent hover:border-border focus-visible:border-primary rounded-none px-2 font-bold"
            placeholder="NODE TITLE"
          />
        </div>
        <div className="flex space-x-2">
          {!isRoot && (
            <Button variant="ghost" size="sm" onClick={onSetRoot} className="h-8 rounded-none text-xs hover:text-primary">
              SET AS ENTRY
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={onDelete} className="h-8 w-8 rounded-none text-destructive hover:bg-destructive/10">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        <Textarea 
          value={message}
          onChange={e => { setMessage(e.target.value); setIsDirty(true); }}
          className="min-h-[100px] rounded-none border-border bg-background/50 focus-visible:ring-primary text-sm font-mono leading-relaxed"
          placeholder="Agent script text goes here..."
        />
        
        <div className="space-y-2">
          <div className="flex justify-between items-center border-b border-border pb-1">
            <h4 className="text-xs text-muted-foreground tracking-widest">BRANCHING OPTIONS</h4>
            <Button variant="ghost" size="sm" onClick={addOption} className="h-6 text-xs text-accent hover:text-accent hover:bg-accent/10 rounded-none px-2">
              <Plus className="h-3 w-3 mr-1" /> ADD OPTION
            </Button>
          </div>
          
          {options.length === 0 ? (
            <div className="text-xs text-muted-foreground py-2">// NO BRANCHES. SCRIPT ENDS HERE IF ENTRY.</div>
          ) : (
            <div className="space-y-2">
              {options.map((opt, i) => (
                <div key={i} className="flex items-center space-x-2 bg-muted/20 p-2 border border-border">
                  <Input 
                    value={opt.key}
                    onChange={e => updateOption(i, 'key', e.target.value)}
                    className="w-12 h-8 rounded-none border-border bg-background text-center font-bold text-secondary"
                    placeholder="KEY"
                  />
                  <Input 
                    value={opt.label}
                    onChange={e => updateOption(i, 'label', e.target.value)}
                    className="flex-1 h-8 rounded-none border-border bg-background text-sm"
                    placeholder="Option Label (e.g. Interested)"
                  />
                  
                  <Select 
                    value={opt.nextNodeId ? `NODE:${opt.nextNodeId}` : opt.disposition ? `DISPO:${opt.disposition}` : "NONE"}
                    onValueChange={(val) => {
                      if (val.startsWith("NODE:")) {
                        updateOption(i, "nextNodeId", parseInt(val.replace("NODE:", "")));
                      } else if (val.startsWith("DISPO:")) {
                        updateOption(i, "disposition", val.replace("DISPO:", ""));
                      } else {
                        const newOpts = [...options];
                        newOpts[i].nextNodeId = null;
                        newOpts[i].disposition = null;
                        setOptions(newOpts);
                        setIsDirty(true);
                      }
                    }}
                  >
                    <SelectTrigger className="w-[200px] h-8 rounded-none bg-background border-border text-xs">
                      <SelectValue placeholder="ACTION" />
                    </SelectTrigger>
                    <SelectContent className="rounded-none border-border bg-popover text-popover-foreground">
                      <SelectItem value="NONE" className="text-muted-foreground">-- SELECT ACTION --</SelectItem>
                      <SelectGroup label="GO TO NODE" className="border-b border-border pb-1 mb-1">
                        <div className="px-2 py-1 text-[10px] text-muted-foreground font-bold tracking-widest">JUMP TO NODE:</div>
                        {allNodes.filter((n: any) => n.id !== node.id).map((n: any) => (
                          <SelectItem key={`node-${n.id}`} value={`NODE:${n.id}`} className="text-accent">
                            → {n.title || `Node ${n.id}`}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                      <SelectGroup label="END CALL">
                        <div className="px-2 py-1 text-[10px] text-muted-foreground font-bold tracking-widest mt-1">END & MARK AS:</div>
                        <SelectItem value="DISPO:INTERESTED" className="text-secondary font-bold">● INTERESTED</SelectItem>
                        <SelectItem value="DISPO:NOT_INTERESTED">○ NOT INTERESTED</SelectItem>
                        <SelectItem value="DISPO:CALLBACK">○ CALLBACK</SelectItem>
                        <SelectItem value="DISPO:WRONG_NUMBER">○ WRONG NUMBER</SelectItem>
                        <SelectItem value="DISPO:NO_ANSWER">○ NO ANSWER</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>

                  <Button variant="ghost" size="icon" onClick={() => removeOption(i)} className="h-8 w-8 rounded-none text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
      {isDirty && (
        <CardFooter className="bg-primary/5 border-t border-border py-2 px-4 flex justify-end">
          <Button 
            onClick={handleSave} 
            disabled={updateNode.isPending}
            size="sm"
            className="rounded-none bg-primary text-primary-foreground font-bold h-8"
          >
            {updateNode.isPending ? "SAVING..." : "SAVE NODE"}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

// Quick helper to render select groups
function SelectGroup({ children, label, className = "" }: any) {
  return <div className={className}>{children}</div>;
}
