
export default function ImageTile({title}:{title:string}) {
  return (
    <div className="card">
      <div style={{
        height:120,
        borderRadius:18,
        background:"#29213d",
        display:"flex",
        alignItems:"center",
        justifyContent:"center"
      }}>
        ART
      </div>
      <p>{title}</p>
    </div>
  )
}
