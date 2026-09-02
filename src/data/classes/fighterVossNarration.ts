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
  return getPreviousFighterSubclassVossNarration(subclassId)
}

export function getFighterSubclassVossComment(subclassId: string) {
  return getPreviousFighterSubclassVossComment(subclassId)
}

export function getFighterSubclassFeatureVossNarration(subclassId: string, level: number, name: string) {
  return getPreviousFighterSubclassFeatureVossNarration(subclassId, level, name)
}
