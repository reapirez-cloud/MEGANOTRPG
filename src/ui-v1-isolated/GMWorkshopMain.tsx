import { useAI } from "../ai/AIProvider"
import { WorkshopPanel } from "./GMWorkshopCommon"
import type { WorkshopSection } from "./useGMWorkshopData"
import { useGMWorkshopData } from "./useGMWorkshopData"

function countText(value: number, one: string, few: string, many: string) {
  const mod100 = value % 100
  const mod10 = value % 10
  if (mod100 >= 11 && mod100 <= 14) return value + " " + many
  if (mod10 === 1) return value + " " + one
  if (mod10 >= 2 && mod10 <= 4) return value + " " + few
  return value + " " + many
}

export default function GMWorkshopMain({
  data,
  onNavigate,
}: {
  data: ReturnType<typeof useGMWorkshopData>
  onNavigate: (section?: WorkshopSection) => void
}) {
  const { drafts: aiDrafts } = useAI()
  const activePc = data.campaignCharacters.filter((character) =>
    character.characterType === "pc" &&
    data.members.some((member) => member.activeCharacterId === character.id)
  ).length
  const freePc = data.campaignCharacters.filter((character) =>
    character.characterType === "pc" &&
    character.lifeState === "alive" &&
    !character.assignedUserId
  ).length
  const dead = data.campaignCharacters.filter((character) => character.lifeState === "dead").length
  const npc = data.campaignCharacters.filter((character) => character.characterType === "npc").length
  const pc = data.campaignCharacters.filter((character) => character.characterType === "pc").length

  return (
    <div className="u1-gm-workshop__panels">
      <WorkshopPanel
        eyebrow="AI · до утверждения"
        title="На проверку"
        meta={String(aiDrafts.length).padStart(2, "0")}
        detail={countText(aiDrafts.length, "предложение", "предложения", "предложений")}
        tone="draft"
        onClick={() => onNavigate("review")}
      />

      <WorkshopPanel
        title="Участники"
        meta={String(data.members.length).padStart(2, "0")}
        detail={
          countText(activePc, "активный PC", "активных PC", "активных PC") +
          " · " +
          countText(freePc, "свободный", "свободных", "свободных")
        }
        onClick={() => onNavigate("members")}
      >
        <span className="u1-gm-panel__preview">
          {data.members.slice(0, 4).map((member) => {
            const current = data.campaignCharacters.find(
              (character) => character.id === member.activeCharacterId,
            )
            return (
              <span key={member.userId}>
                <strong>{member.displayName}</strong>
                <small>{current?.name || "без активного персонажа"}</small>
              </span>
            )
          })}
        </span>
      </WorkshopPanel>

      <WorkshopPanel
        title="Персонажи"
        meta={String(data.characters.length).padStart(2, "0")}
        detail={
          pc + " PC · " +
          npc + " NPC · " +
          data.draftCharacters.length + " чернов. · " +
          freePc + " свободно · " +
          dead + " мёртв."
        }
        onClick={() => onNavigate("characters")}
      />

      <WorkshopPanel
        title="Библиотека"
        meta={String(data.activeDefinitions.length).padStart(2, "0")}
        detail={data.draftDefinitions.length + " чернов. · Предметы · заклинания · способности · эффекты"}
        onClick={() => onNavigate("library")}
      />

      <WorkshopPanel
        title="Личные материалы"
        meta={String(data.materials.length).padStart(2, "0")}
        detail={
          countText(data.folders.length, "папка", "папки", "папок") +
          " · " +
          countText(data.materials.length, "материал", "материала", "материалов")
        }
        onClick={() => onNavigate("materials")}
      />
    </div>
  )
}
