export const COMMAND = 'buddy'
// Spike: Intl time zone is Europe/Berlin and getHours() matched `date` (09 vs 09), so the sandbox knows local time.
export const LOCALTIME_MODE: 'intl' | 'process' = 'intl'
export const SPEECH_TIMEOUT_MS = 4000
export const JUDGE_TIMEOUT_MS = 15000
export const FLASH_MS = 6000
export const EVOLVE_MS = 4000
// Compared with AbovePrompt's bodyColumns, which is the terminal width less the prompt's margins
// (about 5 columns), so 55 here hides the bubble below a terminal of about 60 columns.
export const COMPACT_MIN_COLUMNS = 55
export const PENDING_LOG_MAX = 200
export const CHECKS_MAX = 100
