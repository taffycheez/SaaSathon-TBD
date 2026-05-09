import UploadWorkspaceForm from "@/components/upload-workspace-form";

export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="hero">
        <div className="hero-card hero-copy">
          <p className="eyebrow">WorkspaceIQ Cloud</p>
          <h1>Next.js and TypeScript shell for the SaaS version of WorkspaceIQ.</h1>
          <p>
            This package is the migration target for a hosted product: App Router pages, typed route
            handlers, and a cloud-facing API layer that can call either the existing Node analysis
            service or a dedicated Python CV worker.
          </p>
          <div className="info-strip">
            <span className="info-chip">Deploy on Vercel</span>
            <span className="info-chip">Swap in queues later</span>
            <span className="info-chip">Keep the prototype alive while migrating</span>
          </div>
        </div>
        <UploadWorkspaceForm />
      </section>
    </main>
  );
}
