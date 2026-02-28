import { Switch, Route, Router as WouterRouter } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BASE_PATH } from "@/lib/api";
import Home from "@/pages/home";
import NotFound from "@/pages/not-found";
import LoadTestDataBar from "./components/LoadTestDataBar";

function AppRoutes() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={BASE_PATH || undefined}>
          <Toaster />
          <AppRoutes />
          <LoadTestDataBar />
        </WouterRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
