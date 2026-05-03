/**
 * Schema-form stories. The schema-form renderer is the highest-payoff
 * target for the harness because it handles many shapes:
 * primitives, enums, integer ranges, booleans, arrays of primitives,
 * arrays of objects (nested forms), nested objects.
 *
 * Each story exercises one shape against a minimal handcrafted schema
 * so an edit-to-feedback loop is fast and the failure mode is local.
 */

import { renderForm } from '../../ui/settings/schema-form.js';

function story(id, title, description, schema, initial = {}) {
  return {
    id,
    title,
    description,
    render(stage, setState) {
      let value = JSON.parse(JSON.stringify(initial));
      setState(value);
      const form = renderForm(schema, value, (next) => {
        value = next;
        setState(value);
      });
      stage.appendChild(form);
    },
  };
}

export const schemaFormStories = [
  story(
    'sf/string-enum',
    'String + enum (citation style)',
    'Single dropdown with four options. Smallest exercise of the renderer; useful for sanity-checking layout.',
    {
      type: 'object',
      properties: {
        defaultStyle: { type: 'string', enum: ['prl', 'aps', 'apa', 'ieee'], description: 'Citation style' },
      },
      required: ['defaultStyle'],
    },
    { defaultStyle: 'prl' },
  ),

  story(
    'sf/integer-range',
    'Integer with min/max (digest cap)',
    'Number input with bounds; the renderer should clamp at the schema limits.',
    {
      type: 'object',
      properties: {
        maxPapers: { type: 'integer', minimum: 1, maximum: 200 },
      },
    },
    { maxPapers: 25 },
  ),

  story(
    'sf/booleans',
    'Multiple booleans (privacy)',
    'Stack of checkboxes. The renderer should keep labels readable and align the inputs.',
    {
      type: 'object',
      properties: {
        includeNotesInExports: { type: 'boolean' },
        includeUnreadOnlyInDigest: { type: 'boolean' },
      },
    },
    { includeNotesInExports: false, includeUnreadOnlyInDigest: true },
  ),

  story(
    'sf/array-primitives',
    'Array of primitives (categories)',
    'String array editor with add/remove. Type into a row to mutate; click + to add. The state dump should show the live array.',
    {
      type: 'object',
      properties: {
        arxivCategories: {
          type: 'array',
          items: { type: 'string' },
          uniqueItems: true,
        },
      },
    },
    { arxivCategories: ['quant-ph', 'cond-mat.supr-con'] },
  ),

  story(
    'sf/array-objects',
    'Array of objects (recipients)',
    'Sub-forms inside an array. Editing a name/email mutates the parent array; the state dump shows the full nested structure.',
    {
      type: 'object',
      properties: {
        recipients: {
          type: 'array',
          'x-mergeKey': 'email',
          items: {
            type: 'object',
            required: ['email'],
            properties: {
              email: { type: 'string', format: 'email' },
              name: { type: 'string' },
              frequency: { type: 'string', enum: ['daily', 'weekly', 'both'] },
              enabled: { type: 'boolean' },
            },
          },
        },
      },
    },
    {
      recipients: [
        { email: 'me@example.com', name: 'Me', frequency: 'daily', enabled: true },
        { email: 'collab@example.com', name: 'Collaborator', frequency: 'weekly', enabled: false },
      ],
    },
  ),

  story(
    'sf/nested-object',
    'Nested object (autoFetch)',
    'A sub-object inside the top-level form. Verifies nested fieldsets render readably and the change handler bubbles.',
    {
      type: 'object',
      properties: {
        autoFetch: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            cooldownHours: { type: 'integer', minimum: 0, maximum: 24 },
            maxResultsPerQuery: { type: 'integer', minimum: 1, maximum: 100 },
          },
        },
      },
    },
    { autoFetch: { enabled: true, cooldownHours: 4, maxResultsPerQuery: 25 } },
  ),

  story(
    'sf/empty-schema',
    'Empty schema (edge case)',
    'A schema with no properties. The renderer should produce an empty form, not crash.',
    { type: 'object', properties: {} },
    {},
  ),

  story(
    'sf/missing-initial-value',
    'Missing initial value (edge case)',
    'Schema requires a string but the initial value is undefined. Tests the field dispatcher\'s `?? \'\'` fallback.',
    {
      type: 'object',
      properties: {
        title: { type: 'string', minLength: 1 },
      },
      required: ['title'],
    },
    {},
  ),
];
