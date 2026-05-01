const MOCKUPS = [
  {
    slug: 'funnel-preview',
    title: 'Synergy Home — Generator Funnel',
    client: 'ch014',
    description: 'Full 5-step quote funnel mockup. Survey + thank-you page.',
    urls: [
      { label: 'Survey', path: '/dev/funnel-preview' },
      { label: 'Thank-you', path: '/dev/funnel-preview/thank-you?name=Jane+Smith&city=Lexington' },
    ],
  },
]

export default function DevIndex() {
  return (
    <html>
      <head>
        <title>Dev mockups</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>{`
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            background: #f5f5f3; color: #1a1a1a; margin: 0; padding: 40px 24px; }
          h1 { font-size: 14px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;
            color: #888; margin: 0 0 24px; }
          .card { background: #fff; border: 1px solid #e5e5e2; border-radius: 12px;
            padding: 20px 24px; max-width: 560px; margin-bottom: 16px; }
          .card-title { font-size: 17px; font-weight: 600; margin: 0 0 2px; }
          .card-meta { font-size: 12px; color: #888; margin: 0 0 10px; }
          .card-desc { font-size: 14px; color: #555; margin: 0 0 14px; line-height: 1.5; }
          .links { display: flex; gap: 8px; flex-wrap: wrap; }
          a { display: inline-block; font-size: 13px; font-weight: 500; padding: 6px 14px;
            border-radius: 8px; text-decoration: none; background: #f0f0ee; color: #1a1a1a;
            transition: background 0.15s; }
          a:hover { background: #e0e0dd; }
        `}</style>
      </head>
      <body>
        <h1>Dev mockups</h1>
        {MOCKUPS.map(m => (
          <div key={m.slug} className="card">
            <div className="card-title">{m.title}</div>
            <div className="card-meta">Client: {m.client} · /dev/{m.slug}</div>
            <div className="card-desc">{m.description}</div>
            <div className="links">
              {m.urls.map(u => (
                <a key={u.path} href={u.path}>{u.label}</a>
              ))}
            </div>
          </div>
        ))}
      </body>
    </html>
  )
}
