import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

function App() {
  const [message, setMessage] = useState('Проверяю подключение...')

  useEffect(() => {
    async function checkSupabase() {
      const { data, error } = await supabase
        .from('app_test')
        .select('message')
        .single()

      if (error) {
        setMessage(`Ошибка: ${error.message}`)
        return
      }

      setMessage(data.message)
    }

    checkSupabase()
  }, [])

  return (
    <main>
      <h1>MEGANOTRPG</h1>
      <p>{message}</p>
    </main>
  )
}

export default App