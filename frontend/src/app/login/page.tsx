"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  ArrowUpRight,
  ShieldCheck,
  Eye,
  EyeOff,
  PackageCheck,
  HeartPulse,
} from "lucide-react";
import { useApp } from "@/components/providers";
import { Button } from "@/components/ui";
import { post } from "@/lib/api";
export default function Login() {
  const { reload } = useApp(),
    router = useRouter(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [show, setShow] = useState(false);
  return (
    <div className="login-page">
      <section className="login-story">
        <div className="brand">
          <span className="brand-icon">
            <Plus size={28} strokeWidth={3} />
          </span>
          <span>medora.</span>
        </div>
        <span className="story-tag">
          <HeartPulse size={18} /> BUILT FOR EVERYDAY CARE
        </span>
        <h1>
          A healthier way
          <br />
          to run your
          <br />
          <em>pharmacy.</em>
        </h1>
        <p>
          From the first batch to the final prescription.
          <br />
          Bring your entire pharmacy into focus.
        </p>
        <div className="story-card">
          <PackageCheck size={30} />
          <div>
            <strong>The right medicine. The right time.</strong>
            <p>Smart expiry control. Confident dispensing.</p>
          </div>
          <ShieldCheck size={25} />
        </div>
        <span className="story-footer">
          Thoughtfully made for pharmacies in Bangladesh.
        </span>
      </section>
      <section className="login-form-area">
        <div className="login-form">
          <span className="eyebrow">YOUR DAILY DOSE OF CLARITY</span>
          <h2>Welcome back.</h2>
          <p>Sign in to your pharmacy workspace.</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              const fd = new FormData(e.currentTarget);
              try {
                await post("auth/login", {
                  email: fd.get("email"),
                  password: fd.get("password"),
                });
                await reload();
                router.replace("/");
              } catch (e) {
                setError(e instanceof Error ? e.message : "Unable to sign in");
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="field">
              <span>Email address</span>
              <input
                name="email"
                type="email"
                placeholder="you@pharmacy.com"
                autoComplete="username"
                required
              />
            </label>
            <label className="field">
              <span>Password</span>
              <div className="password-field">
                <input
                  name="password"
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  aria-label={show ? "Hide password" : "Show password"}
                  onClick={() => setShow(!show)}
                  className="icon-btn"
                >
                  {show ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </label>
            {error && (
              <div className="inline-error" role="alert">
                {error}
              </div>
            )}
            <Button type="submit" busy={busy}>
              Sign in to workspace <ArrowUpRight size={20} />
            </Button>
          </form>
          <div className="login-help">
            <ShieldCheck size={18} />
            <span>Protected access. Your role, your workspace.</span>
          </div>
          <p className="login-note">
            Need access? Ask your pharmacy owner to create an account.
          </p>
        </div>
      </section>
    </div>
  );
}
