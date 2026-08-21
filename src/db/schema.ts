import { pgTable, uuid, varchar, text, timestamp, uniqueIndex, index, jsonb, integer, vector } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// --- Users Table ---
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).unique().notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// --- Organizations Table ---
export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).unique().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// --- Memberships Table ---
export const memberships = pgTable('memberships', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  organizationId: uuid('organization_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  role: varchar('role', { length: 50 }).notNull(), // OWNER, ADMIN, RECRUITER, HIRING_MANAGER, CANDIDATE
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  userOrgIdx: uniqueIndex('user_org_idx').on(table.userId, table.organizationId),
  userIdIdx: index('user_id_idx').on(table.userId),
  orgIdIdx: index('org_id_idx').on(table.organizationId),
}));

// --- Jobs Table ---
export const jobs = pgTable('jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .references(() => organizations.id) // safest restrictive relationship: NO CASCADE
    .notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description').notNull(),
  requirements: jsonb('requirements'), // stores Zod validated structured requirements
  status: varchar('status', { length: 50 }).notNull().default('DRAFT'), // DRAFT, PUBLISHED, ARCHIVED
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  jobOrgIdx: index('job_org_idx').on(table.organizationId),
  jobStatusIdx: index('job_status_idx').on(table.status),
  jobOrgStatusIdx: index('job_org_status_idx').on(table.organizationId, table.status),
}));

// --- Audit Logs Table ---
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .references(() => organizations.id) // safest restrictive relationship: NO CASCADE
    .notNull(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 100 }).notNull(), // JOB_CREATED, JOB_UPDATED, JOB_PUBLISHED, JOB_ARCHIVED, etc.
  entityId: uuid('entity_id'),
  entityType: varchar('entity_type', { length: 50 }),
  details: jsonb('details'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  auditOrgActionIdx: index('audit_org_action_idx').on(table.organizationId, table.action),
}));

// --- Relations Definitions (Drizzle Queries) ---
export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(memberships),
  auditLogs: many(auditLogs),
}));

export const organizationsRelations = relations(organizations, ({ many }) => ({
  memberships: many(memberships),
  jobs: many(jobs),
  auditLogs: many(auditLogs),
  candidates: many(candidates),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  user: one(users, {
    fields: [memberships.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [memberships.organizationId],
    references: [organizations.id],
  }),
}));

export const jobsRelations = relations(jobs, ({ one }) => ({
  organization: one(organizations, {
    fields: [jobs.organizationId],
    references: [organizations.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [auditLogs.organizationId],
    references: [organizations.id],
  }),
}));

// --- Candidates Table ---
export const candidates = pgTable('candidates', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .references(() => organizations.id) // restrictive relationship
    .notNull(),
  firstName: varchar('first_name', { length: 255 }),
  lastName: varchar('last_name', { length: 255 }),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  status: varchar('status', { length: 50 }).notNull().default('UPLOADED'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  candidateOrgIdx: index('candidate_org_idx').on(table.organizationId),
  candidateStatusIdx: index('candidate_status_idx').on(table.status),
  candidateOrgStatusIdx: index('candidate_org_status_idx').on(table.organizationId, table.status),
}));

// --- Candidate Documents Table ---
export const candidateDocuments = pgTable('candidate_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  candidateId: uuid('candidate_id')
    .references(() => candidates.id, { onDelete: 'cascade' })
    .notNull(),
  organizationId: uuid('organization_id')
    .references(() => organizations.id) // restrictive relationship
    .notNull(),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  fileSize: integer('file_size').notNull(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  storageKey: varchar('storage_key', { length: 255 }).notNull(),
  rawText: text('raw_text').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  docCandidateIdx: index('doc_candidate_idx').on(table.candidateId),
  docOrgIdx: index('doc_org_idx').on(table.organizationId),
}));

// --- Candidate Profiles Table ---
export const candidateProfiles = pgTable('candidate_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  candidateId: uuid('candidate_id')
    .references(() => candidates.id, { onDelete: 'cascade' })
    .notNull(),
  organizationId: uuid('organization_id')
    .references(() => organizations.id) // restrictive relationship
    .notNull(),
  summary: text('summary'),
  experience: jsonb('experience').notNull(), // array of experiences
  education: jsonb('education').notNull(), // array of education
  skills: jsonb('skills').notNull(), // array of skills
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  profileCandidateIdx: index('profile_candidate_idx').on(table.candidateId),
  profileOrgIdx: index('profile_org_idx').on(table.organizationId),
}));

// --- Candidate Evidence Table ---
export const candidateEvidence = pgTable('candidate_evidence', {
  id: uuid('id').primaryKey().defaultRandom(),
  candidateId: uuid('candidate_id')
    .references(() => candidates.id, { onDelete: 'cascade' })
    .notNull(),
  organizationId: uuid('organization_id')
    .references(() => organizations.id) // restrictive relationship
    .notNull(),
  skill: varchar('skill', { length: 100 }).notNull(),
  sourceDocumentId: uuid('source_document_id')
    .references(() => candidateDocuments.id, { onDelete: 'cascade' })
    .notNull(),
  excerpt: text('excerpt').notNull(),
  page: integer('page'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  evidenceCandidateIdx: index('evidence_candidate_idx').on(table.candidateId),
  evidenceOrgIdx: index('evidence_org_idx').on(table.organizationId),
}));

// --- Candidate Embeddings Table ---
export const candidateEmbeddings = pgTable('candidate_embeddings', {
  id: uuid('id').primaryKey().defaultRandom(),
  candidateId: uuid('candidate_id')
    .references(() => candidates.id, { onDelete: 'cascade' })
    .notNull(),
  organizationId: uuid('organization_id')
    .references(() => organizations.id) // restrictive relationship
    .notNull(),
  embedding: vector('embedding', { dimensions: 768 }).notNull(),
  model: varchar('model', { length: 100 }).notNull(),
  version: varchar('version', { length: 50 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  embeddingCandidateIdx: index('embedding_candidate_idx').on(table.candidateId),
  embeddingOrgIdx: index('embedding_org_idx').on(table.organizationId),
  embeddingHnswIdx: index('candidate_embedding_hnsw_idx')
    .using('hnsw', table.embedding.op('vector_cosine_ops')),
}));

// --- Candidate Relations ---
export const candidatesRelations = relations(candidates, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [candidates.organizationId],
    references: [organizations.id],
  }),
  documents: many(candidateDocuments),
  profiles: many(candidateProfiles),
  evidence: many(candidateEvidence),
  embeddings: many(candidateEmbeddings),
}));

export const candidateDocumentsRelations = relations(candidateDocuments, ({ one, many }) => ({
  candidate: one(candidates, {
    fields: [candidateDocuments.candidateId],
    references: [candidates.id],
  }),
  organization: one(organizations, {
    fields: [candidateDocuments.organizationId],
    references: [organizations.id],
  }),
  evidence: many(candidateEvidence),
}));

export const candidateProfilesRelations = relations(candidateProfiles, ({ one }) => ({
  candidate: one(candidates, {
    fields: [candidateProfiles.candidateId],
    references: [candidates.id],
  }),
  organization: one(organizations, {
    fields: [candidateProfiles.organizationId],
    references: [organizations.id],
  }),
}));

export const candidateEvidenceRelations = relations(candidateEvidence, ({ one }) => ({
  candidate: one(candidates, {
    fields: [candidateEvidence.candidateId],
    references: [candidates.id],
  }),
  organization: one(organizations, {
    fields: [candidateEvidence.organizationId],
    references: [organizations.id],
  }),
  document: one(candidateDocuments, {
    fields: [candidateEvidence.sourceDocumentId],
    references: [candidateDocuments.id],
  }),
}));

export const candidateEmbeddingsRelations = relations(candidateEmbeddings, ({ one }) => ({
  candidate: one(candidates, {
    fields: [candidateEmbeddings.candidateId],
    references: [candidates.id],
  }),
  organization: one(organizations, {
    fields: [candidateEmbeddings.organizationId],
    references: [organizations.id],
  }),
}));
