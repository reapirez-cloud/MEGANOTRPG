type Props = {
  title: string
}

export default function TopBar({ title }: Props) {
  return (
    <header className="app-topbar">
      <div className="app-topbar__inner">
        <div>
          <div className="app-brand">MEGANOTRPG</div>
          <h1 className="app-title">{title}</h1>
        </div>

        <button className="icon-button" aria-label="Уведомления" type="button">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M10.3 19a2 2 0 0 0 3.4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
    </header>
  )
}
