export const COMMAND = 'buddy'
// Spike: Intl time zone is Europe/Berlin and getHours() matched `date` (09 vs 09), so the sandbox knows local time.
export const LOCALTIME_MODE: 'intl' | 'process' = 'intl'
// Spike: tool.call result for a failing Bash is { result: 'Error: Exit code 1', text: 'Exit code 1', isError: true, ... }; read failure from `isError`.
export const BASH_FAILURE_FIELD = 'isError'
// Spike: a $.clock.sleep timer and a $.model.complete started with `void` inside turn.complete both finished after the hook returned (headless -p).
export const UNAWAITED_WORK_SURVIVES = true
export const SPEECH_TIMEOUT_MS = 4000
export const JUDGE_TIMEOUT_MS = 15000
export const FLASH_MS = 6000
export const EVOLVE_MS = 4000
export const COMPACT_MIN_COLUMNS = 60
export const PENDING_LOG_MAX = 200
