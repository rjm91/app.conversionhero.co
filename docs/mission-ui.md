# Mission UI specification

Status: active

Applies to:

- Client Mission: `/control/[clientId]/mission`
- Agency Mission: `/control/mission`

The Mission UI is ConversionHero's focused operating environment. It borrows
the spatial model of Cursor and VS Code—explorer, tabs, editor surface, terminal
panel, and status bar—without copying product branding or turning business data
into a code editor metaphor.

## Principles

1. **One shell, different scopes.** Client and agency Mission use the same
   chrome, spacing, typography, interaction states, and surface hierarchy.
   Their data and navigation differ by scope.
2. **Graphite is structural; color is meaningful.** Neutral graphite surfaces
   define hierarchy. Accent colors identify context or selection. Green,
   amber, and red communicate business meaning and must not be decorative.
3. **The active view joins the canvas.** The active tab uses the canvas color
   so the tab and content read as one uninterrupted surface. A thin accent line
   identifies the active tab.
4. **Dense, not cramped.** Mission is an operational interface. Controls are
   compact, but text remains readable and hit targets remain intentional.
5. **Progressive disclosure.** Details, source rows, terminal output, and
   secondary controls appear on demand instead of competing with primary KPIs.
6. **State survives navigation.** Pane sizes, open tabs, and useful session
   state persist when practical.

## Shell anatomy

The shell is ordered from outside to inside:

1. 36 px titlebar: scope switcher, context label, view controls, user menu.
2. Explorer: grouped destinations, counts, recent/pinned work, panel shortcuts.
3. 34 px tabbar: open work surfaces; active tab connects to the canvas.
4. Editor canvas: the active business view, optionally split side by side.
5. Resizable terminal/problems panel with a 30 px panel tab row.
6. 30 px status bar: scope, range, health, mode, and keyboard affordances.

The explorer and lower panel are user-resizable. Resize handles remain visually
quiet until hover or drag. Sizes should persist per scope in local storage.

## Shared tokens

The `.mission-shell` class in `app/globals.css` is the source of truth. Mission
pages may consume the short aliases (`--bg`, `--panel`, and so on), but must not
redeclare their own palette.

| Token | Value | Use |
| --- | --- | --- |
| `--mission-canvas` | `#202023` | Editor canvas and terminal body |
| `--mission-chrome` | `#1a1a1c` | Titlebar, explorer, tabbar, status bar |
| `--mission-raised` | `#2a2a2e` | Menus, controls, raised/hover surfaces |
| `--mission-popup` | `#26262a` | Floating menus and popovers |
| `--mission-line` | `rgba(255,255,255,.06)` | Standard hairline dividers |
| `--mission-line-strong` | `rgba(255,255,255,.10)` | Raised-surface borders |
| `--mission-text` | `#e4e4e6` | Primary text |
| `--mission-text-dim` | `#9a9aa2` | Secondary text |
| `--mission-text-faint` | `#6a6a72` | Metadata and disabled text |
| `--mission-blue` | `#6ea8fe` | Agency/default interaction accent |
| `--mission-green` | `#3fd68f` | Positive/healthy/profitable |
| `--mission-amber` | `#e8b45a` | Warning/watch/cost |
| `--mission-red` | `#f4747f` | Negative/risk/destructive |
| `--mission-orange` | `#ee946c` | Spend and secondary cost emphasis |
| `--mission-purple` | `#a78bfa` | Memory/agent/system concepts |

Typography uses `SF Mono`, `ui-monospace`, `Menlo`, `Consolas`, then
`monospace`, at a 13 px base size and 1.5 line height. Tab, status, and metadata
labels may step down to 9–12 px. Numeric values use tabular figures.

## Context and accent rules

- **Agency Mission:** use `--mission-blue` for selection, focus, links, and
  active-tab lines. The shell remains ConversionHero-owned.
- **Client Mission:** the shell stays graphite. Client primary color may replace
  the default blue for primary actions, selected ranges, badges, and identity
  marks through the existing `--blue-*` brand scale.
- **Semantic values:** never recolor profit/loss or health signals to match a
  client's brand. Green, amber, and red keep the same meaning in both scopes.
- Accent tints use low-opacity fills (roughly 6–16%). Solid accent fills are
  reserved for endpoints, primary actions, and small identity marks.

## Component and interaction rules

### Explorer

- Chrome background with no card container.
- Section labels are faint, uppercase, and letter-spaced.
- Hover uses a neutral translucent fill.
- Selection uses a subtle accent tint plus a 2 px accent edge.
- Counts are compact pills; amber is reserved for items requiring attention.

### Tabs and canvas

- Tabbar uses chrome; canvas uses the lighter graphite canvas token.
- Inactive tabs use dim text and hairline separators.
- Active tabs use canvas background, primary text, and a 2 px top accent.
- Closing a tab is neutral on hover unless the action is destructive.

### Panels and resize handles

- Divider hit areas may be 5–9 px, but are transparent at rest.
- Hover and active feedback use neutral white at 10% and 16%, respectively.
- A divider must track the pointer in its local pane coordinate system without
  snapping on drag start.
- The terminal uses canvas background; its tab row uses chrome.

### Controls and popovers

- Compact controls use raised graphite, a hairline border, and 5–7 px radius.
- Popovers use the popup token, a strong hairline, and a restrained shadow.
- Focus indicators use the current context accent and must remain visible.
- Control styles must be locally scoped so broad button rules cannot override
  nested calendars, tables, or other compound widgets.

### Content surfaces

- Prefer dividers and whitespace over nested cards.
- Cards are appropriate for independent objects such as clients, agreements,
  findings, or generated artifacts—not for every metric group.
- Default content padding is 18 px vertically and 24 px horizontally.
- Empty states are quiet, specific, and placed where results will appear.

## Accessibility and quality bar

- Interactive elements must be keyboard reachable and expose a visible focus
  state.
- Text and essential status colors must maintain readable contrast on graphite.
- Meaning cannot depend on color alone; pair it with labels, icons, or values.
- Hover-only actions must have a keyboard-accessible equivalent.
- Test pane resizing, overflow, popovers, and the status bar at desktop widths.
- Run targeted lint and the full production build before deployment.

## Implementation contract

1. Add `mission-shell` to both Mission layout wrappers and page roots.
2. Shared palette or typography changes happen only in `.mission-shell`.
3. Page CSS owns data-view layout, not foundational palette values.
4. Agency and client may have different content components, but shell geometry
   and interaction behavior should remain equivalent.
5. Any intentional divergence must be recorded in this document.

## Design history

- `d707d5c` introduced the client warm-graphite, Cursor-style visual language.
- The initial implementation intentionally preserved semantic financial colors.
- This specification promotes that implementation from a page-specific skin to
  the shared Mission shell for both client and agency scopes.
