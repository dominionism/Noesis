---
name: file-operations
description: Enforce efficient file operations and proper project structure. Use when moving, renaming, reorganizing, or creating files. Call out misplaced files and structure violations.
---

# File Operations & Project Structure

## Part 1: ALWAYS Move, NEVER Recreate

When relocating files, ALWAYS use bash `mv` command.

**WRONG (wasteful):**
```
Read old file → Write new file → Delete old file
```

**RIGHT (efficient):**
```bash
mkdir -p new/path/           # Create parent dirs first
mv old/path/file.md new/path/file.md   # Move/rename
```

### Rules

1. **ALWAYS** use `mv` to relocate files
2. **NEVER** recreate a file just to move it
3. **ONLY** rewrite content if it actually changes
4. Use `cp` for duplicating, not read+write
5. Use `mkdir -p` before moving to new directories

---

## Part 2: Project Structure Best Practices

### Standard Separation

```
project/
├── frontend/              # Client-side ONLY
│   ├── src/
│   │   ├── components/    # UI components
│   │   ├── hooks/         # Custom React hooks
│   │   ├── utils/         # Frontend utilities
│   │   ├── services/      # API client calls
│   │   ├── types/         # Frontend types
│   │   └── styles/        # CSS/styling
│   └── public/            # Static assets
│
├── backend/               # Server-side ONLY
│   ├── src/
│   │   ├── controllers/   # Request handlers
│   │   ├── services/      # Business logic
│   │   ├── models/        # Data models
│   │   ├── routes/        # API routes
│   │   ├── middleware/    # Express middleware
│   │   └── utils/         # Backend utilities
│   └── tests/
│
├── shared/                # Code used by BOTH
│   ├── types/             # Shared TypeScript types
│   └── utils/             # Shared utilities
│
└── docs/                  # Documentation
```

---

## Red Flags - CALL THESE OUT

When you see these violations, **immediately flag them**:

1. **Frontend in backend** - React components in `/backend`
2. **Backend in frontend** - Database queries in `/frontend`
3. **API routes mixed with UI** - Express routes next to React components
4. **Business logic in controllers** - Controllers should be thin
5. **Scattered utilities** - Same util function in multiple places
6. **Types not centralized** - Duplicate type definitions
7. **No test organization** - Tests mixed randomly with source
8. **No separation of concerns** - God files doing everything

### When to Flag

Before creating or moving any file, ask:
- Does this belong in frontend, backend, or shared?
- Is there already a correct location for this type of file?
- Am I about to violate separation of concerns?

If structure is wrong, **suggest the correct location** before proceeding.
