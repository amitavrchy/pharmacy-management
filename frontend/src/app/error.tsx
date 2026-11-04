"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="auth-loading">
      <h1>Something interrupted your workspace.</h1>
      <p className="muted mt mb">
        Your saved transactions remain on the server. Try loading this page
        again.
      </p>
      <button className="btn" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
