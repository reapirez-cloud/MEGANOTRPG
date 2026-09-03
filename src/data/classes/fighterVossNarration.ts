import {
  getFighterBaseVossNarration as getPreviousFighterBaseVossNarration,
  getFighterSubclassFeatureVossNarration as getPreviousFighterSubclassFeatureVossNarration,
  getFighterSubclassVossComment as getPreviousFighterSubclassVossComment,
  getFighterSubclassVossNarration as getPreviousFighterSubclassVossNarration,
} from "./fighterVossNarrationPreBrant.ts"
import {
  fighterBrantClassVossComment,
  fighterBrantClassVossNarration,
  getFighterBrantBaseVossComment,
  getFighterBrantBaseVossNarration,
} from "./fighterVossNarrationBrant.ts"
import {
  getGeminiFighterSubclassFeatureVossComment,
  getGeminiFighterSubclassFeatureVossNarration,
  getGeminiFighterSubclassVossComment,
  getGeminiFighterSubclassVossNarration,
} from "./fighterSubclassVossNarrationGeminiPack1.ts"
import {
  getGeminiFighterSubclassFeatureVossCommentPack2,
  getGeminiFighterSubclassFeatureVossNarrationPack2,
  getGeminiFighterSubclassVossCommentPack2,
  getGeminiFighterSubclassVossNarrationPack2,
} from "./fighterSubclassVossNarrationGeminiPack2.ts"
import {
  getGeminiFighterSubclassFeatureVossCommentPack3,
  getGeminiFighterSubclassFeatureVossNarrationPack3,
  getGeminiFighterSubclassVossCommentPack3,
  getGeminiFighterSubclassVossNarrationPack3,
} from "./fighterSubclassVossNarrationGeminiPack3.ts"
import {
  getGeminiFighterSubclassFeatureVossCommentPack4,
  getGeminiFighterSubclassFeatureVossNarrationPack4,
  getGeminiFighterSubclassVossCommentPack4,
  getGeminiFighterSubclassVossNarrationPack4,
} from "./fighterSubclassVossNarrationGeminiPack4.ts"
import { normalizeVossWorldToneDeep } from "./vossWorldToneDeep.ts"

function normalizeFighterVoss(text: string | null | undefined) {
  return normalizeVossWorldToneDeep(text).replace(/зерновому налогу/giu, "зерновому оброку")
}

export const fighterClassVossNarration = normalizeFighterVoss(fighterBrantClassVossNarration)
export const fighterClassVossComment = normalizeFighterVoss(fighterBrantClassVossComment)

export function getFighterBaseVossNarration(level: number, name: string) {
  return normalizeFighterVoss(
    getFighterBrantBaseVossNarration(level, name)
      || getPreviousFighterBaseVossNarration(level, name),
  )
}

export function getFighterBaseVossComment(level: number, name: string) {
  return normalizeFighterVoss(getFighterBrantBaseVossComment(level, name))
}

export function getFighterSubclassVossNarration(subclassId: string) {
  return normalizeFighterVoss(
    getGeminiFighterSubclassVossNarrationPack4(subclassId)
      || getGeminiFighterSubclassVossNarrationPack3(subclassId)
      || getGeminiFighterSubclassVossNarrationPack2(subclassId)
      || getGeminiFighterSubclassVossNarration(subclassId)
      || getPreviousFighterSubclassVossNarration(subclassId),
  )
}

export function getFighterSubclassVossComment(subclassId: string) {
  return normalizeFighterVoss(
    getGeminiFighterSubclassVossCommentPack4(subclassId)
      || getGeminiFighterSubclassVossCommentPack3(subclassId)
      || getGeminiFighterSubclassVossCommentPack2(subclassId)
      || getGeminiFighterSubclassVossComment(subclassId)
      || getPreviousFighterSubclassVossComment(subclassId),
  )
}

export function getFighterSubclassFeatureVossNarration(subclassId: string, level: number, name: string) {
  return normalizeFighterVoss(
    getGeminiFighterSubclassFeatureVossNarrationPack4(subclassId, level, name)
      || getGeminiFighterSubclassFeatureVossNarrationPack3(subclassId, level, name)
      || getGeminiFighterSubclassFeatureVossNarrationPack2(subclassId, level, name)
      || getGeminiFighterSubclassFeatureVossNarration(subclassId, level, name)
      || getPreviousFighterSubclassFeatureVossNarration(subclassId, level, name),
  )
}

export function getFighterSubclassFeatureVossComment(subclassId: string, level: number, name: string) {
  return normalizeFighterVoss(
    getGeminiFighterSubclassFeatureVossCommentPack4(subclassId, level, name)
      || getGeminiFighterSubclassFeatureVossCommentPack3(subclassId, level, name)
      || getGeminiFighterSubclassFeatureVossCommentPack2(subclassId, level, name)
      || getGeminiFighterSubclassFeatureVossComment(subclassId, level, name),
  )
}