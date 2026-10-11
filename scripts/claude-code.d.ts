// Just enough of Claude Code's generated plugin types to type-check the band renderer from scripts/screenshots.ts without installing Claude Code.
declare module 'claude-code' {
  type Element = (props: Record<string, unknown>) => unknown
  interface Elements {
    terminal: { Box: Element; Text: Element }
  }
}
declare function h(type: unknown, props: object | null, ...children: unknown[]): unknown
declare function Fragment(props: object): unknown
