// Just enough of Claude Code's generated plugin types to type-check the band and panel renderers from scripts/screenshots.ts without installing Claude Code.
declare module 'claude-code' {
  type Element = (props: Record<string, unknown>) => unknown
  interface Elements {
    terminal: { Box: Element; Text: Element; Button: Element }
    desktop: { Box: Element; Text: Element; Svg: Element; Markdown: Element }
  }
  type RenderSurface = 'terminal' | 'desktop' | 'mobile' | 'vscode'
}
declare function h(type: unknown, props: object | null, ...children: unknown[]): unknown
declare function Fragment(props: object): unknown
