# AptiHire AI Design System

This design system establishes the visual identity, UI tokens, accessible patterns, and responsive component library for AptiHire AI. It is built to present a professional, data-dense, and highly readable interface that feels premium and credible.

---

## 1. Visual Direction & Identity

* **Theme**: Modern Enterprise AI SaaS. Neutral light-mode background by default, with strict dark-mode CSS variable mappings.
* **Aesthetics**: Clean borders, light card shadows, dense layout, strong whitespace hierarchy.
* **Anti-Patterns (What to Avoid)**: No excessive neon or glowing glassmorphism, no giant colorful gradients, and no meaningless illustrations or emojis.

---

## 2. Design Tokens

The styling system relies on standard CSS variables defined in `:root`.

### Colors (HSL Palette)
A neutral-slate foundation with a professional Indigo-Blue accent representing trust and technical accuracy.

```css
:root {
  /* Slate Neutrals (Light Mode) */
  --background: 210 20% 98%;      /* #f8fafc */
  --foreground: 224 71% 4%;       /* #020617 */
  --card: 0 0% 100%;              /* #ffffff */
  --card-foreground: 224 71% 4%;
  --popover: 0 0% 100%;
  --popover-foreground: 224 71% 4%;
  --border: 220 13% 91%;          /* #e2e8f0 */
  --input: 220 13% 91%;
  
  /* Primary Accent (Slate Indigo) */
  --primary: 221 83% 53%;         /* #2563eb */
  --primary-foreground: 210 20% 98%;
  
  /* Secondary (Cool Gray) */
  --secondary: 220 14.3% 95.9%;   /* #f1f5f9 */
  --secondary-foreground: 220 14.3% 20%;
  
  /* Statuses */
  --success: 142 76% 36%;         /* #16a34a */
  --success-foreground: 0 0% 100%;
  --warning: 38 92% 50%;          /* #d97706 */
  --warning-foreground: 0 0% 100%;
  --danger: 0 84.2% 60.2%;        /* #ef4444 */
  --danger-foreground: 0 0% 100%;
  
  /* AI-Specific Accent (Teal-Cyan) */
  --ai-accent: 187 100% 42%;      /* #00b4d8 (Indicates AI-generated metadata) */
  --ai-accent-foreground: 224 71% 4%;
}

/* Dark Mode Overrides */
@media (prefers-color-scheme: dark) {
  :root {
    --background: 224 71% 4%;     /* #020617 */
    --foreground: 210 20% 98%;    /* #f8fafc */
    --card: 222 47% 11%;          /* #0f172a */
    --card-foreground: 210 20% 98%;
    --border: 217 32% 17%;        /* #1e293b */
    --input: 217 32% 17%;
    
    --primary: 217 91% 60%;       /* #3b82f6 */
    --secondary: 217 32% 17%;
    --secondary-foreground: 210 20% 98%;
  }
}
```

### Typography
* **Primary Sans-Serif**: `Inter`, system-ui, -apple-system, sans-serif (For clean interface text).
* **Technical/Code Font**: `Roboto Mono`, SFMono-Regular, monospace (For data values, scores, and code assessments).
* **Font Sizes**:
  * `xs`: 0.75rem (12px, line-height: 1rem) - metadata, table headers
  * `sm`: 0.875rem (14px, line-height: 1.25rem) - body text, inputs
  * `base`: 1rem (16px, line-height: 1.5rem) - list items, primary values
  * `lg`: 1.125rem (18px, line-height: 1.75rem) - card titles
  * `xl`: 1.25rem (20px, line-height: 1.75rem) - subsection headings
  * `2xl`: 1.5rem (24px, line-height: 2rem) - page titles

### Spacing Scale
A consistent 4px (0.25rem) increment system:
* `1`: 0.25rem (4px)
* `2`: 0.5rem (8px)
* `3`: 0.75rem (12px)
* `4`: 1rem (16px)
* `6`: 1.5rem (24px)
* `8`: 2rem (32px)

### Borders & Radii
* **Border Width**: `1px` (default), `2px` (active/focus states).
* **Corner Radius**:
  * `--radius-sm`: `4px` (for badges, small tags)
  * `--radius-md`: `6px` (for buttons, input fields, select dropdowns)
  * `--radius-lg`: `8px` (for cards, dialog containers, slide-out drawers)
* **Shadows**:
  * `--shadow-sm`: `0 1px 2px 0 rgba(0, 0, 0, 0.05)`
  * `--shadow-md`: `0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)`

---

## 3. Layout & Density

To optimize information architecture for recruiters scanning dozens of resumes, AptiHire AI utilizes a high-density dashboard design.
* **Max Width**: Grid container width capped at `1440px`.
* **Sidebar Layout**: A fixed left navigation panel (width: `240px`) with collapsible mobile support.
* **Component Padding**: Standard card internal padding is `1rem` (16px). Table cell padding is `0.5rem 1rem`.

---

## 4. Reusable Components

All components must consume the CSS design tokens above.

### Core Inputs & Controls
1. **Button**: Rounded `--radius-md` buttons. Focus outlines visible with `outline: 2px solid hsl(var(--primary))`.
2. **Input / Select**: Explicit placeholder styling (`opacity: 0.5`), error state border change to `hsl(var(--danger))`.
3. **Badge**: Pill-shaped (`border-radius: 9999px`) with light backgrounds (e.g., status badges for jobs).

### Data Layouts
1. **Table / DataTable**: Compact rows. Header text uppercase, `font-size: var(--font-xs)`. Hover states on rows (`background-color: hsl(var(--secondary))`).
2. **Pagination**: Clear numeric counters, arrow icons with accessible `aria-label` tags.
3. **Card**: Flat border (`1px solid hsl(var(--border))`) with `--radius-lg` and `--shadow-sm`.

### Custom AI Components
1. **AI Insight Box**:
   * Outlined with a subtle, dashed border: `1px dashed hsl(var(--ai-accent))`.
   * Displays an badge reading `[AI-Generated]` using the teal accent color.
   * Actions included at the footer: "Why this score?", "View evidence", "View source", and "Report issue".
2. **Scorecard**:
   * Uses large monospace typography for numbers (e.g., `88%`).
   * Color-coded progress rings representing match metrics (e.g., Green for >= 80%, Orange for 50-79%, Red for < 50%).
3. **Candidate Card**:
   * Summarizes name, current role, match percentage, and list of matched skills vs. missing gaps.
4. **Pipeline Stage Board**:
   * Visual Kanban-like columns showing: `Applied` -> `Screening` -> `Assessment` -> `Interview` -> `Offered`. Each column contains drag-and-drop cards.

---

## 5. State Handling (UX Feedback Loops)

Every asynchronous operation must render its state explicitly:

* **Idle**: Normal interactive state.
* **Loading**: Render a custom shimmer effect (`Skeleton` loader) for cards, and a spinner text block (e.g., `Analyzing resume...`) for heavy tasks.
* **Success**: Toast notifications with green success indicators.
* **Error**: A red banner with details of the failure, error code, and a primary "Retry" action.
* **Empty**: Centered icon, helper message, and action CTA (e.g., "Create a Job to get started").

---

## 6. Accessibility & Motion Guidelines

* **Keyboard Navigation**: All interactive elements are focusable via `tabindex="0"`. Focus outline is NEVER suppressed.
* **Contrast**: Text elements must satisfy a minimum contrast ratio of `4.5:1` against their backgrounds (meeting WCAG 2.2 AA).
* **Screen Readers**: Interactive elements (such as close buttons, navigation tags, and icons) must use explicit `aria-label` or `sr-only` descriptive spans.
* **Motion**: Limit transitions to micro-interactions (e.g., button hover background shifts). Standard duration is `150ms ease-in-out`.
* **Reduced Motion**: Respect media query settings:
  ```css
  @media (prefers-reduced-motion: reduce) {
    * {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }
  ```
