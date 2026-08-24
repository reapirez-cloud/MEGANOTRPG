export default function ImageCard({title}:{title:string}) {
 return (
  <div className="image-card">
    <div className="image-placeholder">ART</div>
    <span>{title}</span>
  </div>
 )
}
