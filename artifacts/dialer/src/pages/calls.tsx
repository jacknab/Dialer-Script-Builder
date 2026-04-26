import { useListCalls } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";

export default function Calls() {
  const { data: calls, isLoading } = useListCalls({ limit: 100 });

  return (
    <div className="p-6 space-y-6 flex flex-col h-full">
      <div className="border-b border-border pb-2">
        <h1 className="text-2xl">GLOBAL CALL LOG</h1>
      </div>

      <div className="border border-border flex-1 overflow-auto bg-background/50">
        <Table>
          <TableHeader className="bg-muted/50 sticky top-0 z-10">
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-primary font-bold">CALL ID</TableHead>
              <TableHead className="text-primary font-bold">TIME</TableHead>
              <TableHead className="text-primary font-bold">LEAD</TableHead>
              <TableHead className="text-primary font-bold">DURATION</TableHead>
              <TableHead className="text-primary font-bold">STATUS</TableHead>
              <TableHead className="text-primary font-bold">DISPOSITION</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground p-8 animate-pulse">
                  FETCHING CALL LOGS...
                </TableCell>
              </TableRow>
            ) : !calls || calls.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground p-8">
                  // NO CALLS RECORDED YET
                </TableCell>
              </TableRow>
            ) : (
              calls.map((call) => (
                <TableRow key={call.id} className="border-border hover:bg-muted/30 transition-colors">
                  <TableCell className="font-mono text-muted-foreground">#{call.id}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {call.createdAt ? format(new Date(call.createdAt), "MM/dd/yy HH:mm:ss") : "--"}
                  </TableCell>
                  <TableCell>LEAD #{call.leadId}</TableCell>
                  <TableCell className="font-mono">{call.durationSec || 0}s</TableCell>
                  <TableCell>{call.status}</TableCell>
                  <TableCell className={call.disposition === 'INTERESTED' ? 'text-secondary font-bold' : ''}>
                    {call.disposition || "--"}
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
