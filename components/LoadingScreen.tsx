export function LoadingScreen() {
  return (
    <main className="page-shell" style={{ display: "grid", placeItems: "center" }}>
      <section className="card" style={{ padding: 28, textAlign: "center", maxWidth: 420 }}>
        <div className="pill">NivaDesk</div>
        <h1 style={{ margin: "18px 0 8px" }}>Loading your workspace…</h1>
        <p style={{ margin: 0, color: "var(--muted)" }}>Checking your account access.</p>
      </section>
    </main>
  );
}
