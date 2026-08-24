import {useState} from 'react'

type Props = {
  type:string
  onCreate:(data:any)=>void
}

export default function CreateForm({type,onCreate}:Props){
  const [title,setTitle] = useState('')
  const [description,setDescription] = useState('')

  return (
    <div className="card">
      <h3>Создать {type}</h3>

      <input
        placeholder="Название"
        value={title}
        onChange={e=>setTitle(e.target.value)}
      />

      <textarea
        placeholder="Описание"
        value={description}
        onChange={e=>setDescription(e.target.value)}
      />

      <button
        onClick={()=>{
          onCreate({
            type,
            title,
            description
          })
          setTitle('')
          setDescription('')
        }}
      >
        Сохранить
      </button>
    </div>
  )
}
