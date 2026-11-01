"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, fontFamily: "system-ui, sans-serif", textAlign: "center" }}>
      <div>
        <h1>Something went wrong</h1>
        <p>The page could not be displayed.</p>
        <button type="button" onClick={reset}>Try again</button>
      </div>
    </main>
  );
}
