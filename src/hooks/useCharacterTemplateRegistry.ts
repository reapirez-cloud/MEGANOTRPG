import { useCallback, useEffect, useState } from "react"
import { supabase } from "../lib/supabase.ts"
import { clearCharacterTemplateBundles, registerCharacterTemplateBundles } from "../rule-templates/registry.ts"
import type { CharacterTemplateAssignment, CharacterTemplateBundle, RuleTemplate, RuleTemplateLevel } from "../rule-templates/types.ts"
import { useCharacterSourceSuppressions } from "./useCharacterSourceSuppressions.ts"

const TEMPLATE_FIELDS = "id,campaign_id,kind,slug,name,description,version,mechanics,choices,parent_template_id,unlock_level,catalog_key,catalog_revision,source_kind,source_label,is_builtin,mechanical_summary,author_description,author_comment,rules_meta,is_active,created_by,created_at,updated_at"

export function useCharacterTemplateRegistry(characterId: string | null) {
  const [bundles, setBundles] = useState<CharacterTemplateBundle[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [revision, setRevision] = useState(0)
  const suppressions = useCharacterSourceSuppressions(characterId)

  const load = useCallback(async () => {
    if (!characterId) { setBundles([]); setLoading(false); return }
    setLoading(true); setError("")
    const assignmentResult = await supabase.from("character_template_assignments").select("id,character_id,template_id,template_level,selected_choices,assigned_at,updated_at").eq("character_id", characterId).order("assigned_at")
    if (assignmentResult.error) { setError(assignmentResult.error.message); setLoading(false); return }
    const assignments = (assignmentResult.data || []) as CharacterTemplateAssignment[]
    const ids = [...new Set(assignments.map((item) => item.template_id))]
    if (!ids.length) {
      registerCharacterTemplateBundles(characterId, [])
      setBundles([]); setRevision((value) => value + 1); setLoading(false); return
    }
    const [templateResult, levelResult] = await Promise.all([
      supabase.from("rule_templates").select(TEMPLATE_FIELDS).in("id", ids),
      supabase.from("rule_template_levels").select("id,template_id,level,mechanics,choices").in("template_id", ids).order("level"),
    ])
    const firstError = templateResult.error || levelResult.error
    if (firstError) { setError(firstError.message); setLoading(false); return }
    const templates = (templateResult.data || []) as RuleTemplate[]
    const levels = (levelResult.data || []) as RuleTemplateLevel[]
    const next = assignments.map((assignment) => {
      const template = templates.find((item) => item.id === assignment.template_id)
      if (!template) return null
      return { assignment, template, levels: levels.filter((item) => item.template_id === template.id) }
    }).filter((item): item is CharacterTemplateBundle => Boolean(item))
    registerCharacterTemplateBundles(characterId, next)
    setBundles(next); setRevision((value) => value + 1); setLoading(false)
  }, [characterId])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) void load() })
    return () => { cancelled = true; if (characterId) clearCharacterTemplateBundles(characterId) }
  }, [characterId, load])

  // CharacterGameFrame keys its resolved child by this revision. When a GM
  // flips a source OFF/ON, force the same CE consumers to rebuild from the
  // changed suppression registry without teaching them about suppression UI.
  useEffect(() => {
    if (!characterId) return
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) setRevision((value) => value + 1) })
    return () => { cancelled = true }
  }, [characterId, suppressions.revision])

  return {
    bundles,
    loading: loading || suppressions.loading,
    error: error || suppressions.error,
    revision,
    reload: load,
    suppressions,
  }
}
