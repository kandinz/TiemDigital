import { useEffect, useState } from "react";
import { api, type PageBlock } from "../services/platform";
import "../platform.css";
export function ContentPage({ slug }: { slug: string }) {
  const [page, setPage] = useState<{
    title: string;
    description: string;
    blocks: PageBlock[];
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ title: string; description: string; blocks: PageBlock[] }>(
      `/api/pages/${encodeURIComponent(slug)}`,
    )
      .then((p) => {
        setPage(p);
        document.title = `${p.title} · Tiệm Digital`;
        const meta = document.querySelector('meta[name="description"]');
        if (meta) meta.setAttribute("content", p.description);
      })
      .catch((e) => setError(e.message));
  }, [slug]);
  return (
    <div className="platform platform-shell">
      <header className="topbar">
        <a className="wordmark" href="/">
          tiệm<span>digital.</span>
        </a>
        <a href="/account">Tài khoản</a>
      </header>
      <main className="page-body">
        {error ? (
          <p className="notice error">{error}</p>
        ) : !page ? (
          <p>Đang tải nội dung…</p>
        ) : (
          <>
            <h1>{page.title}</h1>
            <p className="muted">{page.description}</p>
            {page.blocks.map((b, i) =>
              b.type === "text" ? (
                <section className="panel" key={i}>
                  <h2>{b.heading}</h2>
                  <p>{b.text}</p>
                </section>
              ) : b.type === "image" ? (
                <img
                  key={i}
                  src={b.url}
                  alt={b.alt ?? ""}
                  className="rounded-xl w-full"
                />
              ) : (
                <p key={i}>
                  <a href={b.url} rel="noreferrer">
                    {b.label} ↗
                  </a>
                </p>
              ),
            )}
          </>
        )}
      </main>
    </div>
  );
}
