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
  return getGeminiFighterSubclassVossNarrationPack3(subclassId)
    || getGeminiFighterSubclassVossNarrationPack2(subclassId)
    || getGeminiFighterSubclassVossNarration(subclassId)
    || getPreviousFighterSubclassVossNarration(subclassId)
}

export function getFighterSubclassVossComment(subclassId: string) {
  return getGeminiFighterSubclassVossCommentPack3(subclassId)
    || getGeminiFighterSubclassVossCommentPack2(subclassId)
    || getGeminiFighterSubclassVossComment(subclassId)
    || getPreviousFighterSubclassVossComment(subclassId)
}

export function getFighterSubclassFeatureVossNarration(subclassId: string, level: number, name: string) {
  return getGeminiFighterSubclassFeatureVossNarrationPack3(subclassId, level, name)
    || getGeminiFighterSubclassFeatureVossNarrationPack2(subclassId, level, name)
    || getGeminiFighterSubclassFeatureVossNarration(subclassId, level, name)
    || getPreviousFighterSubclassFeatureVossNarration(subclassId, level, name)
}

export function getFighterSubclassFeatureVossComment(subclassId: string, level: number, name: string) {
  return getGeminiFighterSubclassFeatureVossCommentPack3(subclassId, level, name)
    || getGeminiFighterSubclassFeatureVossCommentPack2(subclassId, level, name)
    || getGeminiFighterSubclassFeatureVossComment(subclassId, level, name)
}
