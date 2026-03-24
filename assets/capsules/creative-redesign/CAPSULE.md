---
name: creative-redesign
description: Context assembly for UI redesigns, landing pages, visual refresh, and design work requiring differentiation from generic AI aesthetics
triggers:
  - redesign
  - landing page
  - visual refresh
  - UI design
  - creative
  - branding
---

# Creative Redesign Capsule

## Intent

Activate when the task involves visual design work that must be distinctive — not generic. This includes UI redesigns, landing pages, marketing materials, component library creation, and any creative output where "looks like AI generated it" is a failure mode.

## Assembly

When this capsule is activated, assemble the following context:

1. **Design context.** Load the design brief: intent, audience, visual direction, constraints, references, differentiation target.
2. **User preferences.** Load known aesthetic preferences and dislikes. What styles has the user approved or rejected in past work?
3. **Reference material.** Gather approved exemplars, mood boards, or reference designs relevant to this task class.
4. **Anti-patterns.** Load known design anti-patterns and previously rejected approaches.
5. **Existing design system.** If a design system exists, load tokens, components, and conventions. New work must extend, not contradict, the existing system.

### Required Inputs Before Starting

| Input | Why Required |
|---|---|
| **Objective** | What this design should accomplish (convert visitors, explain a product, onboard users) |
| **Audience** | Who will use this — their context, expectations, and sophistication level |
| **Visual direction** | A clear aesthetic stance: minimal, bold, editorial, playful, corporate, etc. |
| **References** | At least 2-3 examples of work the user considers high quality for this context |
| **Banned patterns** | Specific aesthetics or approaches to avoid (generic gradients, stock photo headers, etc.) |
| **Required states** | Loading, error, empty, responsive breakpoints, accessibility requirements |

## Anti-patterns

Reject output that exhibits:

- **Generic AI aesthetics.** Purple gradients on white, Inter/Roboto typography, symmetrical card grids with no visual hierarchy, default framework styling
- **Cosmetic-only changes.** Changing colors and fonts without addressing layout, hierarchy, or interaction design
- **No reference evidence.** Design choices not grounded in the stated direction or provided references
- **Ignoring user preferences.** Repeating styles the user has previously rejected
- **Missing states.** Only the happy-path design — no loading, error, empty, or responsive states
- **Inaccessible design.** Insufficient contrast, no focus states, color as sole indicator

## Quality Criteria

Creative work passes the quality gate when:

1. **Differentiation.** The output is visually distinctive — it does not look like a default template or generic AI output
2. **Audience fit.** Design choices serve the stated audience and objective
3. **Reference alignment.** Visual direction is consistent with provided references and stated aesthetic
4. **Preference compliance.** No banned patterns appear. Previously approved styles are honored.
5. **State completeness.** All required states (loading, error, empty, responsive, accessible) are designed
6. **Technical feasibility.** Design can be implemented with the project's technology stack
