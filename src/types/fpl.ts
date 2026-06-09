export interface FplBootstrapResponse {
  events: FplEvent[]
  teams: FplTeamData[]
  elements: FplElement[]
  element_types: FplElementType[]
}

export interface FplEvent {
  id: number
  name: string
  deadline_time: string
  finished: boolean
  data_checked: boolean
  is_current: boolean
  is_next: boolean
}

export interface FplTeamData {
  id: number
  name: string
  short_name: string
  code: number
}

export interface FplElement {
  id: number
  web_name: string
  first_name: string
  second_name: string
  element_type: number // 1=GK, 2=DEF, 3=MID, 4=FWD
  team: number
  now_cost: number // in tenths of £
  status: "a" | "d" | "s" | "i" | "u" | "n"
  photo: string
  news: string
  chance_of_playing_next_round: number | null
  total_points: number
  form: string
  ep_next: string | null
  points_per_game: string
}

export interface FplElementType {
  id: number
  singular_name: string
  singular_name_short: string
  plural_name: string
  plural_name_short: string
}

export interface FplFixture {
  id: number
  event: number | null
  kickoff_time: string | null
  team_h: number
  team_a: number
  team_h_score: number | null
  team_a_score: number | null
  started: boolean
  finished: boolean
  finished_provisional: boolean
}

export interface FplLiveResponse {
  elements: FplLiveElement[]
}

export interface FplLiveElement {
  id: number
  stats: FplLiveStats
  explain: FplExplain[]
}

export interface FplLiveStats {
  minutes: number
  goals_scored: number
  assists: number
  clean_sheets: number
  goals_conceded: number
  own_goals: number
  penalties_saved: number
  penalties_missed: number
  yellow_cards: number
  red_cards: number
  saves: number
  bonus: number
  bps: number
  total_points: number
  in_dreamteam: boolean
}

export interface FplExplain {
  fixture: number
  stats: FplExplainStat[]
}

export interface FplExplainStat {
  identifier: string
  points: number
  value: number
}
