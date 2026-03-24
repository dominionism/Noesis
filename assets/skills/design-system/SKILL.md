---
name: design-system
description: Structured frontend design methodology covering layout composition, design tokens, typography, color systems, motion design, responsive patterns, and component architecture
category: frontend
triggers:
  - design system
  - UI design
  - frontend design
  - component library
  - design tokens
  - typography
  - color palette
  - layout
  - animation
  - responsive
chain_with:
  - api-design-principles
---

# Design System

## Purpose

Structured methodology for creating cohesive, production-grade frontend interfaces. Covers the full design-to-implementation pipeline: layout composition, design tokens, typography, color, motion, responsive patterns, and component architecture. Every design decision is intentional and serves the user's task.

## When to Use

- When building new UI components, pages, or applications
- When establishing or extending a design system
- When styling or improving the visual quality of an interface
- When creating prototypes that need to look production-ready

## Design Methodology

### Step 1: Define the Context

Before any visual decisions, answer:

| Question | Why It Matters |
|---|---|
| Who is the user? | A financial analyst needs information density. A consumer needs simplicity. |
| What is the primary task? | The interface should make the #1 task effortless. Everything else is secondary. |
| What is the environment? | Mobile on a train vs. desktop in an office. Bright sunlight vs. dark room. |
| What is the brand tone? | Corporate and trustworthy vs. playful and energetic. This constrains every visual choice. |

### Step 2: Compose the Layout

Sketch structure before styling. Layout determines information hierarchy.

```
┌─────────────────────────────────────────┐
│  NAVIGATION                             │
├───────────┬─────────────────────────────┤
│           │                             │
│  SIDEBAR  │      PRIMARY CONTENT        │
│  (filters,│      (the user's task)      │
│   nav)    │                             │
│           ├─────────────────────────────┤
│           │      SECONDARY CONTENT      │
│           │      (supporting info)      │
└───────────┴─────────────────────────────┘
```

**Layout principles:**
- Primary content gets the most space and the most prominent position
- Navigation is consistent and predictable across all pages
- Whitespace is a design element, not wasted space. Generous spacing improves readability.
- Content width for text should not exceed 65-75 characters per line for readability

**Grid system:**

```css
.layout {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: var(--space-md);
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 var(--space-lg);
}
```

### Step 3: Define Design Tokens

Design tokens are the single source of truth for visual values. Never hardcode colors, spacing, or typography in components.

#### Spacing Scale

Use a consistent scale based on a base unit:

```css
:root {
  --space-2xs: 0.125rem;  /* 2px */
  --space-xs:  0.25rem;   /* 4px */
  --space-sm:  0.5rem;    /* 8px */
  --space-md:  1rem;      /* 16px — base */
  --space-lg:  1.5rem;    /* 24px */
  --space-xl:  2rem;      /* 32px */
  --space-2xl: 3rem;      /* 48px */
  --space-3xl: 4rem;      /* 64px */
}
```

**Rule:** Only use token values. If you need `12px`, use `--space-sm` (8) or `--space-md` (16). Resist the urge to add one-off values — they break the rhythm.

#### Shadow Scale

```css
:root {
  --shadow-sm:  0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md:  0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  --shadow-lg:  0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
  --shadow-xl:  0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
}
```

#### Border Radius Scale

```css
:root {
  --radius-sm:   0.25rem;  /* 4px — subtle rounding */
  --radius-md:   0.5rem;   /* 8px — standard components */
  --radius-lg:   0.75rem;  /* 12px — cards, modals */
  --radius-xl:   1rem;     /* 16px — prominent elements */
  --radius-full: 9999px;   /* pills, avatars */
}
```

### Step 4: Typography

#### Type Scale

```css
:root {
  --text-xs:   0.75rem;   /* 12px — captions, labels */
  --text-sm:   0.875rem;  /* 14px — secondary text */
  --text-base: 1rem;      /* 16px — body text */
  --text-lg:   1.125rem;  /* 18px — emphasized body */
  --text-xl:   1.25rem;   /* 20px — section headers */
  --text-2xl:  1.5rem;    /* 24px — page headers */
  --text-3xl:  1.875rem;  /* 30px — hero text */
  --text-4xl:  2.25rem;   /* 36px — display text */

  --leading-tight:  1.25;
  --leading-normal: 1.5;
  --leading-relaxed: 1.75;

  --font-normal:   400;
  --font-medium:   500;
  --font-semibold: 600;
  --font-bold:     700;
}
```

#### Font Selection Guide

| Context | Category | Criteria |
|---|---|---|
| **Body text** | Sans-serif or serif | High x-height, clear letterforms, excellent readability at 14-16px |
| **Headings** | Display, serif, or distinctive sans | Character and personality. Can sacrifice some readability for distinctiveness. |
| **Code** | Monospace | Clear distinction between similar characters (0/O, 1/l/I) |
| **Data** | Tabular figures | Monospaced numbers for columns to align. Check that the font supports `font-variant-numeric: tabular-nums` |

**Font pairing principle:** Contrast, not conflict. Pair a distinctive heading font with a neutral body font. Two distinctive fonts compete for attention.

### Step 5: Color System

#### Semantic Color Tokens

Define colors by purpose, not by hue:

```css
:root {
  /* Surface colors */
  --color-bg-primary:    /* Main background */
  --color-bg-secondary:  /* Elevated surfaces (cards, modals) */
  --color-bg-tertiary:   /* Subtle backgrounds (hover states, code blocks) */

  /* Text colors */
  --color-text-primary:   /* Headings, primary content */
  --color-text-secondary: /* Supporting text, descriptions */
  --color-text-muted:     /* Disabled, placeholder */

  /* Interactive colors */
  --color-accent:          /* Primary actions, links */
  --color-accent-hover:    /* Hover state */
  --color-accent-active:   /* Active/pressed state */

  /* Feedback colors */
  --color-success:   /* Confirmations, positive states */
  --color-warning:   /* Caution, attention needed */
  --color-error:     /* Errors, destructive actions */
  --color-info:      /* Informational messages */

  /* Border colors */
  --color-border:        /* Default borders */
  --color-border-focus:  /* Focus ring color */
}
```

#### Color Accessibility

| Element | Minimum Contrast Ratio | WCAG Level |
|---|---|---|
| Body text on background | 4.5:1 | AA |
| Large text (18px+ or 14px+ bold) on background | 3:1 | AA |
| UI components and graphical objects | 3:1 | AA |
| Enhanced (small text) | 7:1 | AAA |

**Test method:** Use a contrast checker tool. Test every text/background combination that appears in the interface. Do not estimate — measure.

#### Dark Mode Strategy

Do not invert colors. Define a separate token set:

```css
@media (prefers-color-scheme: dark) {
  :root {
    --color-bg-primary:    /* Dark surface */
    --color-bg-secondary:  /* Slightly lighter dark surface */
    --color-text-primary:  /* Light text */
    --color-text-secondary: /* Muted light text */
    /* Accent colors may need lightness adjustment for dark backgrounds */
  }
}
```

**Dark mode rules:**
- Reduce saturation slightly for colors on dark backgrounds
- Use elevation (lighter surfaces) instead of shadows for depth
- Ensure interactive states are still clearly distinguishable

### Step 6: Motion Design

#### Timing Scale

```css
:root {
  --duration-instant: 100ms;   /* Button press, toggle */
  --duration-fast:    150ms;   /* Hover states, small transitions */
  --duration-normal:  250ms;   /* Panel open/close, tab switch */
  --duration-slow:    400ms;   /* Page transitions, large reveals */
  --duration-slower:  600ms;   /* Complex orchestrated animations */

  --ease-default: cubic-bezier(0.4, 0, 0.2, 1);  /* General purpose */
  --ease-in:      cubic-bezier(0.4, 0, 1, 1);      /* Exiting elements */
  --ease-out:     cubic-bezier(0, 0, 0.2, 1);      /* Entering elements */
  --ease-bounce:  cubic-bezier(0.34, 1.56, 0.64, 1); /* Playful emphasis */
}
```

#### Animation Patterns

| Pattern | Duration | Easing | Use Case |
|---|---|---|---|
| **Fade in** | 250-400ms | ease-out | New content appearing |
| **Slide in** | 250-350ms | ease-out | Panels, drawers, dropdowns |
| **Scale in** | 200-300ms | ease-out | Modals, popovers |
| **Hover lift** | 150ms | ease-default | Cards, interactive elements |
| **Button press** | 100ms | ease-in | Click feedback |
| **Stagger** | 50-80ms delay per item | ease-out | Lists, grid items appearing |

#### Motion Principles

1. **Purposeful.** Animation communicates something: direction, relationship, state change. If it does not communicate, remove it.
2. **Fast.** Most transitions should be 150-300ms. Users perceive anything over 400ms as slow.
3. **Respect preferences.** Honor `prefers-reduced-motion`:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### Step 7: Responsive Design

#### Breakpoint Scale

```css
/* Mobile first — base styles are mobile */
/* sm: 640px — Large phones, small tablets */
/* md: 768px — Tablets */
/* lg: 1024px — Laptops */
/* xl: 1280px — Desktops */
/* 2xl: 1536px — Large screens */
```

#### Responsive Patterns

| Pattern | Implementation | When to Use |
|---|---|---|
| **Stack to row** | `flex-direction: column` → `row` at breakpoint | Navigation items, card grids, form layouts |
| **Show/hide** | `display: none` → `block` at breakpoint | Sidebar (hidden on mobile, visible on desktop) |
| **Resize** | Fluid widths with min/max constraints | Content containers, images |
| **Reorder** | `order` property or grid area names | Priority content first on mobile |
| **Simplify** | Fewer columns, collapsed sections | Data tables, complex layouts |

#### Touch Target Sizes

| Target | Minimum Size | Guideline |
|---|---|---|
| Buttons | 44x44px | Apple HIG, WCAG 2.5.5 |
| Links in text | 24px tall | With adequate spacing between adjacent links |
| Icon buttons | 44x44px | Even if the icon is 24px, the tap area is 44px |
| Form inputs | 44px tall | Comfortable for finger tapping |

## Component Architecture

### Component Hierarchy

```
Tokens → Primitives → Composites → Patterns → Templates
```

| Level | Example | Characteristics |
|---|---|---|
| **Tokens** | `--color-accent`, `--space-md` | Values only. No visual output. |
| **Primitives** | Button, Input, Text, Icon | One purpose. No layout opinions. Accept tokens via variants/props. |
| **Composites** | FormField (Label + Input + Error), Card (Image + Content + Actions) | Combine primitives. Define internal layout. |
| **Patterns** | LoginForm, SearchBar, DataTable | Combine composites for a specific use case. May include behavior. |
| **Templates** | DashboardLayout, SettingsPage | Page-level structure. Define content regions. |

### Component Checklist

Before a component is complete:

| Check | Requirement |
|---|---|
| **States** | Default, hover, focus, active, disabled, loading, error |
| **Variants** | Primary, secondary, ghost/outline (as applicable) |
| **Sizes** | Small, medium, large (if the component appears at different scales) |
| **Accessibility** | Keyboard operable, screen reader compatible, focus visible |
| **Responsiveness** | Behaves correctly at all breakpoints |
| **Dark mode** | Works with both color schemes |
| **Reduced motion** | Graceful without animation |

## Anti-patterns

- **Hardcoded values.** `color: #3b82f6` instead of `var(--color-accent)`. Every hardcoded value is a consistency bug waiting to happen and makes theme changes impossible.
- **Pixel-perfect at one breakpoint.** Designing only for desktop (or only for mobile) and forcing the other sizes to work. Design for the constraints of each viewport.
- **Animation for decoration.** Bouncing elements, spinning loaders everywhere, parallax effects that serve no functional purpose. Animation should communicate state changes and relationships.
- **Inconsistent spacing.** Using 12px here, 15px there, 20px somewhere else. Stick to the spacing scale. Visual rhythm comes from consistency.
- **Color as sole indicator.** Red for error, green for success — without text, icons, or patterns. 8% of men have color vision deficiency. Always supplement color with another signal.
- **Placeholder-only labels.** Form labels that disappear when the user types. Users lose context. Always use persistent, visible labels above or beside inputs.
- **Generic aesthetics.** Default framework styling with no intentional design decisions. Every interface should have a clear visual point of view appropriate to its context.

## Verification

Design system is effective when:
1. All visual values come from design tokens (no hardcoded colors, spacing, or typography)
2. Every component has all required states designed and implemented
3. Color contrast meets WCAG AA for all text/background combinations
4. Touch targets meet minimum size requirements (44x44px)
5. Interface is functional and readable at every supported breakpoint
6. `prefers-reduced-motion` and `prefers-color-scheme` are respected
7. A new component can be built using existing tokens and primitives without introducing new visual values
