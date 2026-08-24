export default function ContentCard({item}:{item:any}){
  return (
    <article className="card">
      <h3>{item.title}</h3>
      <p>{item.description}</p>
    </article>
  )
}
