/**
 * Codebase Mapper — Structured codebase analysis document generation.
 *
 * Generates analysis templates for different focus areas:
 * - tech: STACK.md, INTEGRATIONS.md
 * - arch: ARCHITECTURE.md, STRUCTURE.md
 * - quality: TESTING.md, CONVENTIONS.md
 * - concerns: CONCERNS.md
 *
 * Templates are structured outlines that guide the analysis agent.
 * Actual file content analysis is performed by the GSD codebase-mapper
 * expert at runtime.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MapFocus = 'tech' | 'arch' | 'quality' | 'concerns';

export interface CodebaseDocument {
  name: string;
  focus: MapFocus;
  sections: string[];
  template: string;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const TEMPLATES: Record<string, CodebaseDocument> = {
  'STACK.md': {
    name: 'STACK.md',
    focus: 'tech',
    sections: ['Languages', 'Frameworks', 'Build Tools', 'Dependencies', 'Runtime'],
    template: [
      '# Technology Stack',
      '',
      '## Languages',
      '- Primary: [detect from file extensions]',
      '- Secondary: [detect from configs]',
      '',
      '## Frameworks',
      '- [detect from package.json / requirements.txt / go.mod]',
      '',
      '## Build Tools',
      '- [detect from Makefile / scripts / CI config]',
      '',
      '## Key Dependencies',
      '- [list top-level dependencies with versions]',
      '',
      '## Runtime',
      '- [detect from Dockerfile / deployment configs]',
    ].join('\n'),
  },
  'ARCHITECTURE.md': {
    name: 'ARCHITECTURE.md',
    focus: 'arch',
    sections: ['Overview', 'Layers', 'Data Flow', 'Key Patterns', 'Boundaries'],
    template: [
      '# Architecture',
      '',
      '## Overview',
      '- [high-level architecture pattern: monolith, microservices, etc.]',
      '',
      '## Layers',
      '- [identify distinct layers: presentation, business, data, etc.]',
      '',
      '## Data Flow',
      '- [trace primary data flows through the system]',
      '',
      '## Key Patterns',
      '- [identify recurring patterns: DI, repository, pub/sub, etc.]',
      '',
      '## Boundaries',
      '- [identify module boundaries and interfaces]',
    ].join('\n'),
  },
  'STRUCTURE.md': {
    name: 'STRUCTURE.md',
    focus: 'arch',
    sections: ['Directory Layout', 'Module Organization', 'Entry Points', 'Configuration'],
    template: [
      '# Project Structure',
      '',
      '## Directory Layout',
      '```',
      '[tree output of top-level directories]',
      '```',
      '',
      '## Module Organization',
      '- [describe how code is organized]',
      '',
      '## Entry Points',
      '- [list main entry points and their roles]',
      '',
      '## Configuration',
      '- [list config files and their purposes]',
    ].join('\n'),
  },
  'CONVENTIONS.md': {
    name: 'CONVENTIONS.md',
    focus: 'quality',
    sections: ['Naming', 'File Organization', 'Error Handling', 'Logging', 'Code Style'],
    template: [
      '# Code Conventions',
      '',
      '## Naming',
      '- [detected naming patterns: camelCase, snake_case, etc.]',
      '',
      '## File Organization',
      '- [how files are structured within modules]',
      '',
      '## Error Handling',
      '- [error handling patterns used]',
      '',
      '## Logging',
      '- [logging patterns and levels]',
      '',
      '## Code Style',
      '- [linter config, formatter, style rules]',
    ].join('\n'),
  },
  'TESTING.md': {
    name: 'TESTING.md',
    focus: 'quality',
    sections: ['Framework', 'Coverage', 'Patterns', 'Test Organization'],
    template: [
      '# Testing',
      '',
      '## Framework',
      '- [testing framework and runners]',
      '',
      '## Coverage',
      '- [current coverage metrics if available]',
      '',
      '## Patterns',
      '- [testing patterns: unit, integration, e2e]',
      '',
      '## Test Organization',
      '- [how tests are organized relative to source]',
    ].join('\n'),
  },
  'INTEGRATIONS.md': {
    name: 'INTEGRATIONS.md',
    focus: 'tech',
    sections: ['External APIs', 'Databases', 'Message Queues', 'Third-Party Services'],
    template: [
      '# Integrations',
      '',
      '## External APIs',
      '- [list external API integrations]',
      '',
      '## Databases',
      '- [database systems and access patterns]',
      '',
      '## Message Queues',
      '- [if applicable: queues and event systems]',
      '',
      '## Third-Party Services',
      '- [other external service integrations]',
    ].join('\n'),
  },
  'CONCERNS.md': {
    name: 'CONCERNS.md',
    focus: 'concerns',
    sections: ['Technical Debt', 'Security', 'Performance', 'Maintainability', 'Risks'],
    template: [
      '# Concerns',
      '',
      '## Technical Debt',
      '- [identified tech debt items]',
      '',
      '## Security',
      '- [security concerns or gaps]',
      '',
      '## Performance',
      '- [performance concerns or bottlenecks]',
      '',
      '## Maintainability',
      '- [maintainability issues]',
      '',
      '## Risks',
      '- [identified risks and mitigation status]',
    ].join('\n'),
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get codebase analysis documents for a focus area.
 */
export function getDocumentsForFocus(focus: MapFocus): CodebaseDocument[] {
  return Object.values(TEMPLATES).filter(t => t.focus === focus);
}

/**
 * Get all available analysis documents.
 */
export function getAllDocuments(): CodebaseDocument[] {
  return Object.values(TEMPLATES);
}

/**
 * Get a specific analysis document template by name.
 */
export function getDocumentTemplate(name: string): CodebaseDocument | null {
  return TEMPLATES[name] ?? null;
}

/**
 * Get all available focus areas.
 */
export function getAvailableFocusAreas(): MapFocus[] {
  return ['tech', 'arch', 'quality', 'concerns'];
}

/**
 * Generate a combined analysis prompt for a focus area.
 *
 * Returns structured text that guides the codebase-mapper expert.
 */
export function generateAnalysisPrompt(focus: MapFocus): string {
  const docs = getDocumentsForFocus(focus);

  const lines: string[] = [
    `## Codebase Analysis: ${focus}`,
    '',
    `Analyze the codebase and produce the following documents:`,
    '',
  ];

  for (const doc of docs) {
    lines.push(`### ${doc.name}`);
    lines.push(`Sections: ${doc.sections.join(', ')}`);
    lines.push('');
  }

  return lines.join('\n');
}
