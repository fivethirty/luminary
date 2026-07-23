# Luminary UI System

This document is the contract for production UI work. It exists to keep human- and agent-authored
changes visually consistent without erasing meaningful interaction differences.

The production application uses a small CSS library rather than a component framework:

- `src/ui/styles/tokens.css`: theme palettes, spacing, typography, radii, motion, control sizes,
  and reusable semantic values.
- `src/ui/styles/primitives.css`: controls, variants, labels, panels, dialogs, disclosures, and
  small layout primitives.
- `src/app.css`: page layout and application-wide result/fleet semantics.
- `src/ui/components/*`: domain-specific component layout and visuals.

`src/app.css` imports the token and primitive layers. Component styles may consume those contracts
but must not redefine them.

## Audit Summary

The July 2026 review found the following repeated production patterns:

| Pattern | Previous implementations | Shared contract |
| --- | --- | --- |
| Standard controls | theme, faction, planner, population, search, action buttons | `.ui-input`, `.ui-select`, `.ui-button` |
| Button variants | default, clear/reset, danger, copy-link accent, square icon actions | `.ui-button--*`, `.ui-icon-button` |
| Select-backed commands | recent battle, add ship, NPC layout pills | `.ui-command-select` plus visual modifiers and `.ui-native-overlay-select` |
| Segmented choices | control-mode switch | `.ui-segmented-control` |
| Containers | fleet/results cards and impact/survivor panels | `.ui-card`, `.ui-card__header`, `.ui-panel` |
| Warnings | destructive-edit and incomplete-representation notices | `.ui-warning` |
| Dialog structure | fleet settings and part finder | `.ui-dialog`, `.ui-dialog__surface`, `.ui-dialog__header` |
| Repeated typography | preference labels, field labels, section eyebrows | `.ui-label`, `.ui-eyebrow`, `.ui-text-strong` |
| Disclosure affordance | detailed results and part buckets | `.ui-disclosure-summary` |
| Inline alignment | component headers | `.ui-cluster`, with a local `--ui-cluster-gap` when necessary |

The extraction also removed a duplicated ship-clear stylesheet. Reset actions now use the same
quiet compact button contract in both ship representations.

The visual similarity between two controls is not, by itself, a reason to merge their behavior:

- A standard select owns a persistent value. Theme, faction, damage planner, and sector population
  use `.ui-select`.
- A command select performs an action and clears its native selection. Recent battles, add-ship,
  and NPC presets use `.ui-command-select`.
- NPC preset pills retain their add/increment/swap behavior. They share the native overlay and
  focus treatment, not a state-select component.
- `calc-selector` changes a bounded quantity with two buttons. `calc-stat-cube` is an editable
  spinbutton with signs, defaults, keyboard arrows, and press-and-hold behavior. They share sizing
  tokens but remain separate components.
- Blueprint slots and part tiles are artwork-aligned, domain-specific controls. Their geometry
  belongs in the blueprint component, while their colors, focus, and typography use shared tokens.

## Primitive Catalog

### Buttons

Every ordinary button gets `.ui-button` and an explicit `type`.

```html
<button class="ui-button" type="button">Copy for chat</button>
<button class="ui-button ui-button--accent" type="button">Copy link</button>
<button class="ui-button ui-button--danger" type="button">Clear setup</button>
<button
  class="ui-button ui-button--quiet ui-button--compact"
  type="button"
>
  Clear
</button>
```

Use `.ui-icon-button` only for a square icon/glyph action. It always needs an accessible name;
visible `×`, arrows, and other glyphs are not sufficient.

```html
<button class="ui-icon-button" type="button" aria-label="Remove fleet">
  ×
</button>
```

Do not add a new visual button variant inside a component until the existing default, primary,
accent, danger, quiet, compact, and icon contracts have been ruled out.

### Fields and selects

Use `.ui-input` for an ordinary text/search field and `.ui-select` for a persistent native select.
Width belongs to the component or layout; control height, padding, chevron, border, and focus
belong to the primitive.

```html
<label class="ui-field">
  <span class="ui-label">Faction</span>
  <select class="ui-select">…</select>
</label>
```

Use a native element even when it is visually overlaid. This keeps mobile pickers, keyboard
navigation, and assistive-technology behavior.

```html
<label class="ui-command-select ui-command-select--pill">
  <span>Ancient</span>
  <select class="ui-native-overlay-select" aria-label="Add Ancient layout">
    …
  </select>
</label>
```

The only command-select modifiers are currently:

- `--button`: ordinary rectangular action such as `+ Ship`.
- `--pill`: compact quick-access commands such as NPC presets.

### Containers and layout

- `.ui-card` is the outer bordered application surface.
- `.ui-card__header` owns a card header's inset and divider.
- `.ui-panel` is a padded inset surface nested inside a larger card.
- `.ui-warning` supplies the shared warning border, surface, and semantic color. The component
  owns its padding and layout, includes a non-color warning indicator, and uses `role="alert"` only
  when the warning is revealed in response to UI state.
- `.ui-cluster` is an inline flex row with centered items and a token gap.
- `.ui-push-end` consumes remaining inline space. It is intended for one item inside a cluster.

Padding has one owner. A card header, panel, section body, or toolbar supplies the inset; its direct
children should not add matching outer margins. Sibling spacing is expressed by the parent's
`gap`, not a mixture of child margins.

### Dialogs and disclosures

Dialogs use the native `<dialog>` element and the shared shell. Component CSS chooses only its
width, height, scrolling region, and domain-specific background.

Disclosures use native `<details>` and `<summary>`. The shared summary class supplies marker reset,
chevron, and rotation; component styles may supply section padding and colors.

## Spacing and Sizing Rules

Use the spacing scale for layout:

- `--space-2xs`: internal hairline/segmented insets.
- `--space-xs`: dense related items.
- `--space-sm`: normal control and row gaps.
- `--space-md`: panel padding and separated groups.
- `--space-lg` and above: page sections.

Use semantic control tokens instead of reconstructing padding:

- `--control-height-compact`: icon, quiet, pill, and segmented controls.
- `--control-height`: normal buttons, selects, and inputs.
- `--control-height-touch`: primary fields/actions in full-screen interaction surfaces.
- `--control-padding-*`: shared control insets.

A new raw `rem`, `px`, color, radius, or font size in production CSS is presumed to be accidental.
Geometry tied to source artwork or a safe-area calculation can be an exception, but it needs a
local semantic custom property or an audit-baseline rationale.

## Agent Workflow

Use this sequence for every UI change:

1. **Inventory before creating.** Search `src/ui/styles/primitives.css`, component templates, and
   nearby components for the same interaction contract.
2. **Name the behavior.** Decide whether the control is a persistent value, command, toggle,
   disclosure, navigation action, destructive action, or direct manipulation surface.
3. **Compose primitives first.** Add component CSS only for layout, width, domain color, or
   artwork-specific geometry.
4. **Cover every state.** Check default, hover (when available), active, focus-visible, disabled,
   selected/pressed, loading, empty, and error/invalid states that apply.
5. **Keep native semantics.** Prefer button, select, input, details/summary, dialog, table, and
   label. Add an accessible name to glyph-only controls. Use `aria-pressed`, `aria-current`, or
   live regions only when their semantics match.
6. **Check input methods.** Verify keyboard operation, touch targets, coarse pointers, and that
   focus is visible. Never remove an outline without an equally visible replacement on the same
   interaction.
7. **Check responsive ownership.** Start at 360–390px, then the canonical 40rem, 48rem, 64rem,
   and 80rem boundaries. Avoid a new breakpoint; `src/ui/breakpoints.test.ts` enforces the scale.
8. **Test the contract.** Component tests should assert behavior and accessible state. Avoid
   snapshotting incidental class order unless class composition is the contract under test.
9. **Run the ratchet.** `bun run audit:ui:strict` rejects increases in likely token bypasses,
   custom control styling, removed outlines, implicit button types, and inline styles.
10. **Validate the application.** Run the nearest component test while iterating, then
    `bun run check`.

When `bun` is not on `PATH`, prefix commands with `mise exec --`.

## Review Checklist

Before a UI change is complete, verify:

- The same concept has the same spacing, height, radius, typography, and state treatment.
- Different concepts have not been merged merely because they look alike.
- Parent and child do not both own the same padding/margin.
- Text can wrap or truncate intentionally, and grid/flex children have `min-width: 0` where needed.
- No component causes horizontal page overflow at mobile width.
- Focus is visible and returns to the invoking control after a modal interaction.
- Glyph-only buttons have contextual accessible names.
- Buttons inside or near forms declare `type`.
- Selected navigation uses `aria-current`; toggles use `aria-pressed`.
- Color is not the only carrier of state.
- Motion has a reduced-motion path.
- Light and dark themes preserve contrast and do not rely on hard-coded production colors.
- Empty, hidden, disabled, invalid, pending, and populated states are all deliberate.

## Additional Concerns and Follow-up

This review also addressed issues that were not explicit in the original request:

- removed duplicated top spacing around the results component;
- restored a visible focus ring to the part search field;
- added explicit button types to production templates;
- replaced route inline styles with the `hidden` state;
- exposed active navigation with `aria-current`;
- added safe external-link relations;
- added anchor focus treatment and reduced-motion behavior;
- removed a dead fleet wrapper rule;
- verified the migrated page has no horizontal overflow at a 390px viewport.

The next highest-value improvements are:

1. Add browser screenshot regression coverage for representative empty, populated, results,
   dialog, light-theme, dark-theme, and 390px layouts.
2. Add automated contrast/high-contrast checks once a browser accessibility harness is available.
3. Add reconnect/disconnect lifecycle tests for custom elements that attach listeners to the host.
4. Introduce CSS cascade layers if global/component ordering becomes a recurring source of
   specificity fixes.
5. Promote prototype code only through a scoped component migration; do not merge the study
   stylesheet into the application bundle.
