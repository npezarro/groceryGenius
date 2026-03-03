import { useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShoppingCart, Mail, CheckCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { apiUrl } from "@/lib/api";

export default function VerifyEmailPage() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [verified, setVerified] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  // If no user or already verified, redirect home
  if (!user) {
    navigate("/auth");
    return null;
  }

  if (user.emailVerified && !verified) {
    navigate("/");
    return null;
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/auth/verify"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verification failed");

      qc.setQueryData(["/api/auth/me"], data);
      setVerified(true);
      toast({ title: "Email verified!" });
      setTimeout(() => navigate("/"), 1500);
    } catch (error) {
      toast({
        title: "Verification failed",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setResending(true);
    try {
      const res = await fetch(apiUrl("/api/auth/resend-verification"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to resend");
      toast({ title: "Code sent", description: "Check your email for a new verification code." });
    } catch (error) {
      toast({
        title: "Failed to resend",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setResending(false);
    }
  }

  if (verified) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-xl border-0">
          <CardContent className="p-8 text-center">
            <div className="bg-primary/10 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight mb-2">Email Verified</h1>
            <p className="text-muted-foreground text-sm">Redirecting to home...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-xl border-0">
        <CardContent className="p-8">
          <div className="text-center mb-8">
            <div className="bg-gradient-to-br from-primary to-emerald-600 rounded-2xl w-16 h-16 flex items-center justify-center mx-auto mb-4 shadow-lg">
              <Mail className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Verify Your Email</h1>
            <p className="text-muted-foreground text-sm mt-1.5">
              We sent a 6-digit code to <span className="font-medium text-foreground">{user.email}</span>
            </p>
          </div>

          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                className="text-center text-2xl font-mono tracking-[0.3em] h-14"
                maxLength={6}
                required
                autoFocus
              />
            </div>

            <Button
              type="submit"
              className="w-full h-11 font-semibold shadow-md hover:shadow-lg transition-shadow"
              disabled={loading || code.length !== 6}
            >
              {loading ? "Verifying..." : "Verify Email"}
            </Button>
          </form>

          <div className="text-center mt-6 pt-4 border-t border-border">
            <p className="text-sm text-muted-foreground mb-2">Didn't receive the code?</p>
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="text-sm text-primary font-medium hover:text-primary/80 transition-colors disabled:opacity-50"
            >
              {resending ? "Sending..." : "Resend verification code"}
            </button>
          </div>

          <div className="text-center mt-4">
            <button
              type="button"
              onClick={() => navigate("/")}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Skip for now
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
