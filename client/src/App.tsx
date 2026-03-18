import { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";
import { BASE_PATH } from "@/lib/api";

const Home = lazy(() => import("@/pages/home"));
const AuthPage = lazy(() => import("@/pages/auth"));
const NotFound = lazy(() => import("@/pages/not-found"));
const LoadTestDataBar = lazy(() => import("./components/LoadTestDataBar"));

function RouteLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-muted-foreground">Loading...</div>
    </div>
  );
}

function AppRoutes() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/auth" component={AuthPage} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={BASE_PATH || undefined}>
            <Toaster />
            <AppRoutes />
            <Suspense fallback={null}>
              <LoadTestDataBar />
            </Suspense>
          </WouterRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
