export type RoomCategory = "game" | "flood"

export type ChatRoom = {
  id: string
  slug: string
  title: string
  category: RoomCategory
  position: number
  preview: string
  time: string
}

export type ChatRoomMember = {
  room_id: string
  user_id: string
  can_read: boolean
  can_write: boolean
  created_at?: string
  updated_at?: string
}

export type ChatMessage = {
  id: number
  room_id: string
  user_id: string | null
  client_id: string
  character_id: string | null
  author_name: string
  author_avatar_url: string | null
  body: string
  created_at: string
  edited_at: string | null
}
