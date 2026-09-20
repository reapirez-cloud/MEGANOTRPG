import { useAIViewContextLayer } from "../ai/AIProvider"
import GMWorkshopCharacters from "./GMWorkshopCharacters"
import { WorkshopHeader } from "./GMWorkshopCommon"
import GMWorkshopReview from "./GMWorkshopReview"
import GMWorkshopLibrary from "./GMWorkshopLibrary"
import GMWorkshopMain from "./GMWorkshopMain"
import GMWorkshopMaterials from "./GMWorkshopMaterials"
import GMWorkshopMembers from "./GMWorkshopMembers"
import {
  useGMWorkshopData,
  type WorkshopSection,
} from "./useGMWorkshopData"

function sectionLabel(section?: WorkshopSection) {
  if (section === "review") return "На проверку"
  if (section === "members") return "Участники"
  if (section === "characters") return "Персонажи"
  if (section === "library") return "Библиотека"
  if (section === "materials") return "Материалы"
  return "Мастерская"
}

export default function GMWorkshop({
  section,
  onNavigate,
  onOpenCharacter,
  onBack,
}: {
  section?: WorkshopSection
  onNavigate: (section?: WorkshopSection) => void
  onOpenCharacter: (characterId: string) => void
  onBack: () => void
}) {
  const data = useGMWorkshopData()

  const visible =
    section === "characters"
      ? data.characters.slice(0, 24).map((character) => ({
          type: character.characterType,
          id: character.id,
          name: character.name,
          class: character.characterClass,
          level: character.level,
          state: character.lifeState,
        }))
      : section === "library"
        ? data.definitions.slice(0, 24).map((definition) => ({
            type: definition.kind,
            id: definition.id,
            name: definition.name,
            summary: definition.summary,
          }))
        : section === "review"
          ? []
          : section === "materials"
            ? data.materials.slice(0, 24).map((material) => ({
                type: material.kind,
                id: material.id,
                title: material.title,
                folderId: material.folderId,
              }))
            : section === "members"
              ? data.members.slice(0, 24).map((member) => ({
                  type: "member",
                  userId: member.userId,
                  name: member.displayName,
                  role: member.role,
                  activeCharacterId: member.activeCharacterId,
                }))
              : []

  const label = sectionLabel(section)

  useAIViewContextLayer(
    "gm-workshop",
    data.loading || !data.canManage
      ? null
      : {
          screen: "gm-workshop",
          route: "#/workspace/manage" + (section ? "/" + section : ""),
          title: "Мастерская · " + label,
          text:
            "ГМ сейчас открыл раздел «" +
            label +
            "». Контекст передан приложением как данные, а не прочитан со скриншота.",
          facts: {
            campaignTitle: data.campaignTitle,
            section: section || "index",
            counts: {
              members: data.members.length,
              campaignCharacters: data.campaignCharacters.length,
              draftCharacters: data.draftCharacters.length,
              activeDefinitions: data.activeDefinitions.length,
              draftDefinitions: data.draftDefinitions.length,
              locations: data.locations.length,
              materials: data.materials.length,
            },
            visible,
          },
        },
    30,
  )

  if (data.loading) {
    return (
      <main className="u1-gm-workshop">
        <div className="u1-gm-workshop__loading">
          Мастерская открывается…
        </div>
      </main>
    )
  }

  return (
    <main className="u1-gm-workshop">
      {data.campaignCoverUrl && (
        <div
          className="u1-gm-workshop__ambient"
          style={{ backgroundImage: "url(" + JSON.stringify(data.campaignCoverUrl) + ")" }}
          aria-hidden="true"
        />
      )}

      <WorkshopHeader
        campaignTitle={data.campaignTitle}
        section={section}
        onNavigate={onNavigate}
        onBack={onBack}
      />

      {data.error || !data.canManage ? (
        <div className="u1-gm-workshop__error">
          {data.error || "Недостаточно прав для мастерской."}
        </div>
      ) : (
        <>
          {!section && (
            <GMWorkshopMain
              data={data}
              onNavigate={onNavigate}
            />
          )}
          {section === "review" && (
            <GMWorkshopReview data={data} />
          )}
          {section === "members" && (
            <GMWorkshopMembers
              data={data}
              onOpenCharacter={onOpenCharacter}
            />
          )}
          {section === "characters" && (
            <GMWorkshopCharacters
              data={data}
              onOpenCharacter={onOpenCharacter}
            />
          )}
          {section === "library" && (
            <GMWorkshopLibrary data={data} />
          )}
          {section === "materials" && (
            <GMWorkshopMaterials data={data} />
          )}
        </>
      )}
    </main>
  )
}
