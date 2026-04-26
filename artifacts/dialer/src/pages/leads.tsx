import { useState } from "react";
import { Link } from "wouter";
import { useListLeads } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

export default function Leads() {
  const [search, setSearch] = useState("");
  const [tier, setTier] = useState<string>("ALL");
  const [status, setStatus] = useState<string>("ALL");

  const { data: leadsData, isLoading } = useListLeads({
    search: search || undefined,
    tier: tier !== "ALL" ? tier : undefined,
    status: status !== "ALL" ? status : undefined,
    limit: 100
  });

  return (
    <div className="p-6 space-y-6 flex flex-col h-full">
      <div className="flex justify-between items-end border-b border-border pb-2">
        <h1 className="text-2xl">LEAD INBOX</h1>
        <div className="text-muted-foreground text-sm">
          {leadsData?.total || 0} TOTAL LEADS
        </div>
      </div>

      <div className="flex space-x-4">
        <Input 
          placeholder="SEARCH NAME OR PHONE..." 
          className="w-64 bg-transparent border-border rounded-none focus-visible:ring-primary"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={tier} onValueChange={setTier}>
          <SelectTrigger className="w-40 rounded-none bg-transparent border-border">
            <SelectValue placeholder="TIER" />
          </SelectTrigger>
          <SelectContent className="rounded-none border-border bg-popover text-popover-foreground">
            <SelectItem value="ALL">ALL TIERS</SelectItem>
            <SelectItem value="1">TIER 1 (HOT)</SelectItem>
            <SelectItem value="2">TIER 2 (WARM)</SelectItem>
            <SelectItem value="3">TIER 3 (COLD)</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-48 rounded-none bg-transparent border-border">
            <SelectValue placeholder="STATUS" />
          </SelectTrigger>
          <SelectContent className="rounded-none border-border bg-popover text-popover-foreground">
            <SelectItem value="ALL">ALL STATUSES</SelectItem>
            <SelectItem value="NEW">NEW</SelectItem>
            <SelectItem value="CALLED">CALLED</SelectItem>
            <SelectItem value="QUALIFIED">QUALIFIED</SelectItem>
            <SelectItem value="DISQUALIFIED">DISQUALIFIED</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border border-border flex-1 overflow-auto bg-background/50">
        <Table>
          <TableHeader className="bg-muted/50 sticky top-0 z-10">
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-primary font-bold">NAME</TableHead>
              <TableHead className="text-primary font-bold">PHONE</TableHead>
              <TableHead className="text-primary font-bold">TIER</TableHead>
              <TableHead className="text-primary font-bold">STATUS</TableHead>
              <TableHead className="text-primary font-bold">LAST DISPO</TableHead>
              <TableHead className="text-primary font-bold text-right">LAST CALLED</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground p-8 animate-pulse">
                  FETCHING LEADS...
                </TableCell>
              </TableRow>
            ) : leadsData?.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground p-8">
                  // NO LEADS FOUND. IMPORT VIA CSV.
                </TableCell>
              </TableRow>
            ) : (
              leadsData?.items.map((lead) => (
                <TableRow key={lead.id} className="border-border hover:bg-muted/30 cursor-pointer transition-colors">
                  <TableCell>
                    <Link href={`/leads/${lead.id}`} className="block w-full h-full text-accent hover:underline">
                      {lead.name}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono">{lead.phone || "--"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`rounded-none ${lead.tier === '1' ? 'border-secondary text-secondary' : 'border-muted-foreground text-muted-foreground'}`}>
                      T{lead.tier}
                    </Badge>
                  </TableCell>
                  <TableCell>{lead.status}</TableCell>
                  <TableCell className={lead.lastDisposition === 'INTERESTED' ? 'text-secondary font-bold' : ''}>
                    {lead.lastDisposition || "--"}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {lead.lastCalledAt ? format(new Date(lead.lastCalledAt), "MM/dd/yy HH:mm") : "NEVER"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
