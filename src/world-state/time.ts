import type { DayPeriod, WorldPosition } from "./types.ts"

export const DAY_PERIODS: ReadonlyArray<{ value: DayPeriod; label: string; shortLabel: string }> = [
  { value: "dawn", label: "Рассвет", shortLabel: "Рассвет" },
  { value: "morning", label: "Утро", shortLabel: "Утро" },
  { value: "day", label: "День", shortLabel: "День" },
  { value: "late_day", label: "Поздний день", shortLabel: "Поздний день" },
  { value: "evening", label: "Вечер", shortLabel: "Вечер" },
  { value: "night", label: "Ночь", shortLabel: "Ночь" },
  { value: "deep_night", label: "Глубокая ночь", shortLabel: "Глубокая ночь" },
]

const periodIndex = new Map(DAY_PERIODS.map((period, index) => [period.value, index]))

export const CAMPAIGN_MINUTES_PER_DAY = 24 * 60

const LEGACY_PERIOD_ANCHOR_MINUTES: Record<DayPeriod, number> = {
  deep_night: 120,
  dawn: 360,
  morning: 540,
  day: 780,
  late_day: 960,
  evening: 1200,
  night: 1380,
}

export function dayPeriodLabel(period: DayPeriod): string {
  return DAY_PERIODS.find((entry) => entry.value === period)?.label || period
}

export function formatCampaignTime(position: Pick<WorldPosition, "campaign_day" | "day_period">): string {
  return `День ${position.campaign_day} кампании · ${dayPeriodLabel(position.day_period)}`
}

export function legacyWorldTimeToCampaignMinute(
  position: Pick<WorldPosition, "campaign_day" | "day_period">,
): number {
  return (
    (Math.max(1, position.campaign_day) - 1) * CAMPAIGN_MINUTES_PER_DAY +
    LEGACY_PERIOD_ANCHOR_MINUTES[position.day_period]
  )
}

export function campaignMinuteToWorldTime(campaignMinute: number): {
  campaign_day: number
  day_period: DayPeriod
  hour: number
  minute: number
} {
  const normalized = Math.max(0, Math.floor(campaignMinute))
  const minuteOfDay = normalized % CAMPAIGN_MINUTES_PER_DAY
  const campaignDay = Math.floor(normalized / CAMPAIGN_MINUTES_PER_DAY) + 1

  const dayPeriod: DayPeriod =
    minuteOfDay < 300 ? "deep_night"
      : minuteOfDay < 420 ? "dawn"
      : minuteOfDay < 660 ? "morning"
      : minuteOfDay < 900 ? "day"
      : minuteOfDay < 1080 ? "late_day"
      : minuteOfDay < 1320 ? "evening"
      : "night"

  return {
    campaign_day: campaignDay,
    day_period: dayPeriod,
    hour: Math.floor(minuteOfDay / 60),
    minute: minuteOfDay % 60,
  }
}

export function formatExactCampaignTime(campaignMinute: number): string {
  const time = campaignMinuteToWorldTime(campaignMinute)
  const hh = String(time.hour).padStart(2, "0")
  const mm = String(time.minute).padStart(2, "0")
  return `День ${time.campaign_day} · ${hh}:${mm} · ${dayPeriodLabel(time.day_period)}`
}

export function compareWorldTime(
  a: Pick<WorldPosition, "campaign_day" | "day_period" | "campaign_minute">,
  b: Pick<WorldPosition, "campaign_day" | "day_period" | "campaign_minute">,
): number {
  if (
    typeof a.campaign_minute === "number" &&
    typeof b.campaign_minute === "number"
  ) {
    return a.campaign_minute - b.campaign_minute
  }
  if (a.campaign_day !== b.campaign_day) return a.campaign_day - b.campaign_day
  return (periodIndex.get(a.day_period) ?? 0) - (periodIndex.get(b.day_period) ?? 0)
}

export function shiftWorldTime(position: WorldPosition, direction: -1 | 1): WorldPosition {
  const current = periodIndex.get(position.day_period) ?? 0
  const next = current + direction

  const shifted: WorldPosition =
    next < 0
      ? {
          ...position,
          campaign_day: Math.max(1, position.campaign_day - 1),
          day_period: DAY_PERIODS[DAY_PERIODS.length - 1]!.value,
        }
      : next >= DAY_PERIODS.length
        ? {
            ...position,
            campaign_day: position.campaign_day + 1,
            day_period: DAY_PERIODS[0]!.value,
          }
        : { ...position, day_period: DAY_PERIODS[next]!.value }

  if (typeof position.campaign_minute !== "number") return shifted
  return {
    ...shifted,
    campaign_minute: legacyWorldTimeToCampaignMinute(shifted),
  }
}
