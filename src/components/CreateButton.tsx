type Props = {
  label?: string
  onClick:()=>void
}

export default function CreateButton({label='Создать', onClick}:Props){
  return (
    <button onClick={onClick}>
      + {label}
    </button>
  )
}
