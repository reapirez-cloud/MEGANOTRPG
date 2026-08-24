type Props = {
 title?: string
 children: React.ReactNode
}

export default function AppCard({title, children}:Props) {
 return (
  <article className="app-card">
   {title && <h3>{title}</h3>}
   {children}
  </article>
 )
}
