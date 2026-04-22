import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import '@lettera/editor/styles.css';
import type { VariableContext, VariableDefinition, VariableSchema } from '@lettera/core';
import type { LetteraLayout } from '@lettera/editor';
import { sampleDocument } from './sampleDocument.js';

/**
 * Pick the editor shell from the URL — append `?layout=compact` to preview
 * the Unlayer-style compact layout, anything else (or omitted) renders the
 * classic 3-pane shell so existing consumers see no change.
 */
const layoutParam = new URLSearchParams(window.location.search).get('layout');
const layout: LetteraLayout = layoutParam === 'compact' ? 'compact' : 'classic';

/**
 * The editor bundle is large (Tiptap + cmdk + dnd-kit). We lazy-load it so
 * the initial JS payload stays minimal — important for marketing landing
 * pages or auth flows that mount alongside the editor.
 */
const LetteraEditor = lazy(() =>
  import('@lettera/editor').then((m) => ({ default: m.LetteraEditor })),
);

/**
 * Variables a host system would expose to the editor. In a real integration
 * these come from your CRM / e-commerce / auth context — the editor itself is
 * indifferent to where they live, it just needs the shape below.
 */
const sampleVariables: VariableDefinition[] = [
  {
    path: 'user.firstName',
    label: 'First name',
    sampleValue: 'Ada',
    group: 'User',
    type: 'string',
    description: "Recipient's first name",
  },
  {
    path: 'user.email',
    label: 'Email',
    sampleValue: 'ada@example.com',
    group: 'User',
    type: 'email',
  },
  {
    path: 'order.id',
    label: 'Order #',
    sampleValue: 'A-10421',
    group: 'Order',
    type: 'string',
  },
  {
    path: 'order.total',
    label: 'Order total',
    sampleValue: '€124.00',
    group: 'Order',
    type: 'string',
  },
  {
    path: 'company.name',
    label: 'Company',
    sampleValue: 'Lettera',
    group: 'Brand',
    type: 'string',
  },
];

/**
 * Typed variable schema — the second-generation variable model. Unlike the
 * flat `sampleVariables`, this one describes nested objects and lists so the
 * editor's Variables tree can expose a "+ Repeater" affordance for the
 * `services` list, and the renderer can auto-format currency / date leaves.
 */
const sampleSchema: VariableSchema = {
  fields: {
    customer: {
      kind: 'object',
      label: 'Customer',
      fields: {
        firstName: { kind: 'string', label: 'First name', sample: 'Ada' },
        lastName: { kind: 'string', label: 'Last name', sample: 'Lovelace' },
        email: { kind: 'email', label: 'Email', sample: 'ada@example.com' },
        isPremium: { kind: 'boolean', label: 'Premium?', sample: true },
      },
    },
    order: {
      kind: 'object',
      label: 'Order',
      fields: {
        id: { kind: 'string', label: 'Order #', sample: 'A-10421' },
        total: { kind: 'currency', label: 'Total', sample: 124, currency: 'EUR' },
        placedAt: { kind: 'date', label: 'Placed at', sample: '2026-04-18' },
      },
    },
    services: {
      kind: 'list',
      label: 'Services',
      item: {
        kind: 'object',
        label: 'Service',
        fields: {
          name: { kind: 'string', label: 'Name', sample: 'Consultation' },
          description: {
            kind: 'string',
            label: 'Description',
            sample: 'One-hour session',
          },
          fee: { kind: 'currency', label: 'Fee', sample: 90, currency: 'EUR' },
        },
      },
    },
  },
};

/**
 * Sample runtime data matching `sampleSchema`. In a real host this comes from
 * your backend; here we hard-code three services so the repeater has
 * something to iterate over.
 */
const sampleData: VariableContext = {
  customer: {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    isPremium: true,
  },
  order: {
    id: 'A-10421',
    total: 124,
    placedAt: '2026-04-18',
  },
  services: [
    { name: 'Website audit', description: 'Deep technical review', fee: 240 },
    { name: 'Branding workshop', description: 'Half-day session for the team', fee: 480 },
    { name: 'Monthly retainer', description: 'Ongoing design support', fee: 1200 },
  ],
};

const root = document.getElementById('root');
if (!root) throw new Error('No #root');
createRoot(root).render(
  <StrictMode>
    <Suspense
      fallback={
        <div style={{ padding: 24, font: '13px system-ui', color: '#6b7280' }}>Loading editor…</div>
      }
    >
      <LetteraEditor
        document={sampleDocument}
        variables={sampleVariables}
        schema={sampleSchema}
        data={sampleData}
        layout={layout}
      />
    </Suspense>
  </StrictMode>,
);
