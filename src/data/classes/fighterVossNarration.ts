import {
  getFighterBaseVossNarration as getPreviousFighterBaseVossNarration,
  getFighterSubclassFeatureVossNarration as getPreviousFighterSubclassFeatureVossNarration,
  getFighterSubclassVossComment as getPreviousFighterSubclassVossComment,
  getFighterSubclassVossNarration as getPreviousFighterSubclassVossNarration,
} from "./fighterVossNarrationPreBrant"
import {
  fighterBrantClassVossComment,
  fighterBrantClassVossNarration,
  getFighterBrantBaseVossComment,
  getFighterBrantBaseVossNarration,
} from "./fighterVossNarrationBrant"
import {
  getGeminiFighterSubclassFeatureVossComment,
  getGeminiFighterSubclassFeatureVossNarration,
  getGeminiFighterSubclassVossComment,
  getGeminiFighterSubclassVossNarration,
} from "./fighterSubclassVossNarrationGeminiPack1"
import {
  getGeminiFighterSubclassFeatureVossCommentPack2,
  getGeminiFighterSubclassFeatureVossNarrationPack2,
  getGeminiFighterSubclassVossCommentPack2,
  getGeminiFighterSubclassVossNarrationPack2,
} from "./fighterSubclassVossNarrationGeminiPack2"
import {
  getGeminiFighterSubclassFeatureVossCommentPack3,
  getGeminiFighterSubclassFeatureVossNarrationPack3,
  getGeminiFighterSubclassVossCommentPack3,
  getGeminiFighterSubclassVossNarrationPack3,
} from "./fighterSubclassVossNarrationGeminiPack3"
import {
  getGeminiFighterSubclassFeatureVossCommentPack4,
  getGeminiFighterSubclassFeatureVossNarrationPack4,
  getGeminiFighterSubclassVossCommentPack4,
  getGeminiFighterSubclassVossNarrationPack4,
} from "./fighterSubclassVossNarrationGeminiPack4"
import { normalizeVossWorldTone } from "./vossWorldTone"

export const fighterClassVossNarration = normalizeVossWorldTone(fighterBrantClassVossNarration)
export const fighterClassVossComment = normalizeVossWorldTone(fighterBrantClassVossComment)

export function getFighterBaseVossNarration(level: number, name: string) {
  return normalizeVossWorldTone(
    getFighterBrantBaseVossNarration(level, name)
      || getPreviousFighterBaseVossNarration(level, name),
  )
}

export function getFighterBaseVossComment(level: number, name: string) {
  return normalizeVossWorldTone(getFighterBrantBaseVossComment(level, name))
}

export function getFighterSubclassVossNarration(subclassId: string) {
  return normalizeVossWorldTone(
    getGeminiFighterSubclassVossNarrationPack4(subclassId)
      || getGeminiFighterSubclassVossNarrationPack3(subclassId)
      || getGeminiFighterSubclassVossNarrationPack2(subclassId)
      || getGeminiFighterSubclassVossNarration(subclassId)
      || getPreviousFighterSubclassVossNarration(subclassId),
  )
}

export function getFighterSubclassVossComment(subclassId: string) {
  return normalizeVossWorldTone(
    getGeminiFighterSubclassVossCommentPack4(subclassId)
      || getGeminiFighterSubclassVossCommentPack3(subclassId)
      || getGeminiFighterSubclassVossCommentPack2(subclassId)
      || getGeminiFighterSubclassVossComment(subclassId)
      || getPreviousFighterSubclassVossComment(subclassId),
  )
}

export function getFighterSubclassFeatureVossNarration(subclassId: string, level: number, name: string) {
  return normalizeVossWorldTone(
    getGeminiFighterSubclassFeatureVossNarrationPack4(subclassId, level, name)
      || getGeminiFighterSubclassFeatureVossNarrationPack3(subclassId, level, name)
      || getGeminiFighterSubclassFeatureVossNarrationPack2(subclassId, level, name)
      || getGeminiFighterSubclassFeatureVossNarration(subclassId, level, name)
      || getPreviousFighterSubclassFeatureVossNarration(subclassId, level, name),
  )
}

export function getFighterSubclassFeatureVossComment(subclassId: string, level: number, name: string) {
  return normalizeVossWorldTone(
    getGeminiFighterSubclassFeatureVossCommentPack4(subclassId, level, name)
      || getGeminiFighterSubclassFeatureVossCommentPack3(subclassId, level, name)
      || getGeminiFighterSubclassFeatureVossCommentPack2(subclassId, level, name)
      || getGeminiFighterSubclassFeatureVossComment(subclassId, level, name),
  )
}
