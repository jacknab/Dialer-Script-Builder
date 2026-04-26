import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";

import Dashboard from "@/pages/dashboard";
import Leads from "@/pages/leads";
import LeadDetail from "@/pages/lead-detail";
import Scripts from "@/pages/scripts";
import ScriptDetail from "@/pages/script-detail";
import Campaigns from "@/pages/campaigns";
import CampaignDetail from "@/pages/campaign-detail";
import Dialer from "@/pages/dialer";
import Calls from "@/pages/calls";
import Settings from "@/pages/settings";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/leads" component={Leads} />
        <Route path="/leads/:id" component={LeadDetail} />
        <Route path="/scripts" component={Scripts} />
        <Route path="/scripts/:id" component={ScriptDetail} />
        <Route path="/campaigns" component={Campaigns} />
        <Route path="/campaigns/:id" component={CampaignDetail} />
        <Route path="/dialer" component={Dialer} />
        <Route path="/calls" component={Calls} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
