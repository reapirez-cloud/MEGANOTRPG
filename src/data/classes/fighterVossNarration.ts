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

export const fighterClassVossNarration = fighterBrantClassVossNarration
export const fighterClassVossComment = fighterBrantClassVossComment

export function getFighterBaseVossNarration(level: number, name: string) {
  return getFighterBrantBaseVossNarration(level, name)
    || getPreviousFighterBaseVossNarration(level, name)
}

export function getFighterBaseVossComment(level: number, name: string) {
  return getFighterBrantBaseVossComment(level, name)
}

export function getFighterSubclassVossNarration(subclassId: string) {
  return getGeminiFighterSubclassVossNarration(subclassId)
    || getPreviousFighterSubclassVossNarration(subclassId)
}

export function getFighterSubclassVossComment(subclassId: string) {
  return getGeminiFighterSubclassVossComment(subclassId)
    || getPreviousFighterSubclassVossComment(subclassId)
}

export function getFighterSubclassFeatureVossNarration(subclassId: string, level: number, name: string) {
  return getGeminiFighterSubclassFeatureVossNarration(subclassId, level, name)
    || getPreviousFighterSubclassFeatureVossNarration(subclassId, level, name)
}

export function getFighterSubclassFeatureVossComment(subclassId: string, level: number, name: string) {
  return getGeminiFighterSubclassFeatureVossComment(subclassId, level, name)
}
