export const COMMAND = 'buddy'
// Spike: Intl time zone is Europe/Berlin and getHours() matched `date` (09 vs 09), so the sandbox knows local time.
export const LOCALTIME_MODE: 'intl' | 'process' = 'intl'
export const SPEECH_TIMEOUT_MS = 4000
export const JUDGE_TIMEOUT_MS = 15000
export const FLASH_MS = 6000
export const EVOLVE_MS = 4000
export const PENDING_LOG_MAX = 200
// One pendingLog line at most: a turn's facts are short, so only a runaway one is cut.
export const LOG_LINE_MAX = 300
export const CHECKS_MAX = 100
// The newest tool calls the permission check denied, remembered so their errors are not failures.
export const DENIED_MAX = 200
