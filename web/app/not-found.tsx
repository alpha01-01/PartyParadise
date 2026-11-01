import Link from "next/link";

export default function NotFound() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, fontFamily: "system-ui, sans-serif", textAlign: "center" }}>
      <div>
        <h1>Page not found</h1>
        <p>That page does not exist or has moved.</p>
        <Link href="/">Back to PartyParadise</Link>
      </div>
    </main>
  );
}
