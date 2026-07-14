interface ComingSoonPageProps {
  glyph: string;
  title: string;
  description: string;
  items: Array<{ title: string; detail: string }>;
}

export function ComingSoonPage({ glyph, title, description, items }: ComingSoonPageProps) {
  return (
    <div className="coming-soon-page">
      <div className="coming-soon-glyph">{glyph}</div>
      <h1>{title}</h1>
      <p>{description}</p>
      <ul className="coming-soon-list">
        {items.map((item) => (
          <li key={item.title}>
            <strong>{item.title}</strong> — {item.detail}
          </li>
        ))}
      </ul>
    </div>
  );
}
