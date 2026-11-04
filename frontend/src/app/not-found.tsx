import Link from "next/link";
export default function NotFound() {
  return (
    <div className="auth-loading">
      <div className="eyebrow">404 · PAGE NOT FOUND</div>
      <h1 className="mt">Let’s get you back to care.</h1>
      <p className="muted mt mb">This page doesn’t exist in your workspace.</p>
      <Link href="/" className="btn">
        Return to overview
      </Link>
    </div>
  );
}
