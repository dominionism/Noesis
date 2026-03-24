---
name: design-brief
description: Template for capturing design intent, audience, direction, constraints, and required states before any UI/UX work begins
type: project-state
---

# Design Brief

Complete this brief before starting any design or frontend work. Incomplete briefs produce generic output.

## Template

### Intent

What is this interface for? What problem does it solve?

```
[One paragraph describing the purpose and desired outcome]
```

### Audience

Who will use this? Be specific — not "users."

```
Primary: [Role, expertise level, context of use]
Secondary: [If applicable]
```

### Visual Direction

What aesthetic are we committing to? Choose a clear direction.

```
Direction: [e.g., minimal and precise, bold and editorial, warm and organic, corporate and trustworthy]
References: [2-3 URLs or descriptions of designs that exemplify the target quality]
```

### Constraints

```
Technology: [Framework, library restrictions]
Performance: [Load time targets, bundle size limits]
Accessibility: [WCAG level, specific requirements]
Brand: [Existing colors, fonts, logos that must be used]
```

### Banned Patterns

What to explicitly avoid:

```
- [e.g., generic gradient backgrounds]
- [e.g., stock photography heroes]
- [e.g., default Bootstrap/Tailwind component styling]
```

### Differentiation Target

What should make this memorable? What is the one thing someone will notice?

```
[Specific design element or approach that elevates this above generic]
```

### Required States

Every screen must account for:

- [ ] **Loading** — Skeleton screen or spinner with context
- [ ] **Empty** — Explanation + primary action when no data exists
- [ ] **Error** — Specific message + recovery action
- [ ] **Partial** — Graceful degradation when some data is unavailable
- [ ] **Long content** — How the layout handles 10x expected content
- [ ] **Responsive** — Mobile, tablet, desktop breakpoints
- [ ] **Accessible** — Keyboard navigation, screen reader, contrast compliance
- [ ] **Reduced motion** — Respects `prefers-reduced-motion`

### Selected Skill / Capsule

```
Skill: [design-system | other]
Capsule: [creative-redesign | none]
```
