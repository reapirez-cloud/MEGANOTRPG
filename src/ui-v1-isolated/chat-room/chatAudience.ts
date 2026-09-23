import { supabase } from "../../lib/supabase"

export type PcDialogueRecipient = {
  character_id: string
  character_name: string
  location_id: string
}

export async function loadPcDialogueRecipients({
  roomId,
  sourceCharacterId,
}: {
  roomId: string
  sourceCharacterId: string
}) {
  const result = await supabase.rpc("list_pc_dialogue_recipients_v1", {
    p_room_id: roomId,
    p_source_character_id: sourceCharacterId,
  })
  if (result.error) throw result.error
  return (result.data || []) as PcDialogueRecipient[]
}
