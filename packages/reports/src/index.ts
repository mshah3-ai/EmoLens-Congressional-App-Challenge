/**
 * @emolens/reports: the report shared by the phone's PDF, the clinician portal and share links (SPEC 22.2, 24).
 * Pure TypeScript (no React Native, no browser): data types, the audience rules (assemble.ts), dates and numbers in
 * the family's language (format.ts), SVG charts (svg.ts) and the HTML pages (templates/).
 */
export * from './types';
export * from './assemble';
export * from './school';
export * from './format';
export * from './svg';
export * from './labels';
export * from './i18n';
export * from './schema';
export * from './templates/shell';
export * from './templates/report';
