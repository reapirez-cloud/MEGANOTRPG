import GMWorkshopCharacters from "./GMWorkshopCharacters"
import { WorkshopHeader } from "./GMWorkshopCommon"
import GMWorkshopDraft from "./GMWorkshopDraft"
import GMWorkshopLibrary from "./GMWorkshopLibrary"
import GMWorkshopMain from "./GMWorkshopMain"
import GMWorkshopMaterials from "./GMWorkshopMaterials"
import GMWorkshopParty from "./GMWorkshopParty"
import {
  useGMWorkshopData,
  type WorkshopSection,
} from "./useGMWorkshopData"

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
          {section === "draft" && (
            <GMWorkshopDraft
              data={data}
              onOpenCharacter={onOpenCharacter}
            />
          )}
          {section === "party" && (
            <GMWorkshopParty
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
