import { pgTable, uuid, varchar, text, timestamp, uniqueIndex, index, jsonb, integer, vector, boolean } from 'drizzle-orm/pg-core';
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

export const jobsRelations = relations(jobs, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [jobs.organizationId],
    references: [organizations.id],
  }),
  embeddings: many(jobEmbeddings),
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
    .references(() => organizations.id, { onDelete: 'cascade' })
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
    .references(() => organizations.id, { onDelete: 'cascade' })
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

// --- Job Embeddings Table ---
export const jobEmbeddings = pgTable('job_embeddings', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id')
    .references(() => jobs.id, { onDelete: 'cascade' })
    .notNull(),
  organizationId: uuid('organization_id')
    .references(() => organizations.id) // restrictive
    .notNull(),
  embedding: vector('embedding', { dimensions: 768 }).notNull(),
  model: varchar('model', { length: 100 }).notNull(),
  version: varchar('version', { length: 50 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  embeddingJobIdx: index('embedding_job_idx').on(table.jobId),
  embeddingJobOrgIdx: index('embedding_job_org_idx').on(table.organizationId),
  jobEmbeddingHnswIdx: index('job_embedding_hnsw_idx')
    .using('hnsw', table.embedding.op('vector_cosine_ops')),
}));

// --- Candidate Notes Table ---
export const candidateNotes = pgTable('candidate_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .references(() => organizations.id)
    .notNull(),
  candidateId: uuid('candidate_id')
    .references(() => candidates.id, { onDelete: 'cascade' })
    .notNull(),
  jobId: uuid('job_id')
    .references(() => jobs.id, { onDelete: 'cascade' })
    .notNull(),
  authorUserId: uuid('author_user_id')
    .references(() => users.id, { onDelete: 'set null' })
    .notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  notesCandidateIdx: index('notes_candidate_idx').on(table.candidateId),
  notesJobIdx: index('notes_job_idx').on(table.jobId),
  notesOrgIdx: index('notes_org_idx').on(table.organizationId),
  notesOrgCreatedIdx: index('notes_org_created_idx').on(table.organizationId, table.createdAt),
}));

// --- Candidate Status History Table ---
export const candidateStatusHistory = pgTable('candidate_status_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .references(() => organizations.id)
    .notNull(),
  candidateId: uuid('candidate_id')
    .references(() => candidates.id, { onDelete: 'cascade' })
    .notNull(),
  jobId: uuid('job_id')
    .references(() => jobs.id, { onDelete: 'cascade' }), // nullable if global
  previousStatus: varchar('previous_status', { length: 50 }),
  newStatus: varchar('new_status', { length: 50 }).notNull(),
  actorUserId: uuid('actor_user_id')
    .references(() => users.id, { onDelete: 'set null' })
    .notNull(),
  reason: varchar('reason', { length: 255 }),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  historyCandidateIdx: index('history_candidate_idx').on(table.candidateId),
  historyJobIdx: index('history_job_idx').on(table.jobId),
  historyOrgIdx: index('history_org_idx').on(table.organizationId),
  historyOrgCreatedIdx: index('history_org_created_idx').on(table.organizationId, table.createdAt),
  historyCandCreatedIdx: index('history_cand_created_idx').on(table.organizationId, table.candidateId, table.createdAt),
}));

// --- Candidate Notes Table Indexes Update ---
// Note: notesOrgCreatedIdx added via table schema below if needed

// --- Saved Searches Table ---
export const savedSearches = pgTable('saved_searches', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  query: text('query').notNull(),
  intentJson: jsonb('intent_json').notNull(),
  version: integer('version').default(1).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  savedSearchesUserIdx: index('saved_searches_user_idx').on(table.organizationId, table.userId),
}));

// --- Tags Table ---
export const tags = pgTable('tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  color: varchar('color', { length: 30 }).default('blue').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  tagOrgNameIdx: uniqueIndex('tag_org_name_idx').on(table.organizationId, table.name),
}));

// --- Candidate Tags Mapping Table ---
export const candidateTags = pgTable('candidate_tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  candidateId: uuid('candidate_id')
    .references(() => candidates.id, { onDelete: 'cascade' })
    .notNull(),
  tagId: uuid('tag_id')
    .references(() => tags.id, { onDelete: 'cascade' })
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  candTagUniqueIdx: uniqueIndex('cand_tag_unique_idx').on(table.candidateId, table.tagId),
  candTagOrgIdx: index('cand_tag_org_idx').on(table.organizationId, table.candidateId),
}));

// --- Notifications Table ---
export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  recipientUserId: uuid('recipient_user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  message: text('message').notNull(),
  type: varchar('type', { length: 50 }).notNull(),
  read: boolean('read').default(false).notNull(),
  entityId: uuid('entity_id'),
  entityType: varchar('entity_type', { length: 50 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  notifUserReadIdx: index('notif_user_read_idx').on(table.organizationId, table.recipientUserId, table.read),
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
  notes: many(candidateNotes),
  statusHistory: many(candidateStatusHistory),
  tags: many(candidateTags),
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

export const jobEmbeddingsRelations = relations(jobEmbeddings, ({ one }) => ({
  job: one(jobs, {
    fields: [jobEmbeddings.jobId],
    references: [jobs.id],
  }),
  organization: one(organizations, {
    fields: [jobEmbeddings.organizationId],
    references: [organizations.id],
  }),
}));

export const candidateNotesRelations = relations(candidateNotes, ({ one }) => ({
  candidate: one(candidates, {
    fields: [candidateNotes.candidateId],
    references: [candidates.id],
  }),
  organization: one(organizations, {
    fields: [candidateNotes.organizationId],
    references: [organizations.id],
  }),
  job: one(jobs, {
    fields: [candidateNotes.jobId],
    references: [jobs.id],
  }),
  author: one(users, {
    fields: [candidateNotes.authorUserId],
    references: [users.id],
  }),
}));

export const candidateStatusHistoryRelations = relations(candidateStatusHistory, ({ one }) => ({
  candidate: one(candidates, {
    fields: [candidateStatusHistory.candidateId],
    references: [candidates.id],
  }),
  organization: one(organizations, {
    fields: [candidateStatusHistory.organizationId],
    references: [organizations.id],
  }),
  job: one(jobs, {
    fields: [candidateStatusHistory.jobId],
    references: [jobs.id],
  }),
  actor: one(users, {
    fields: [candidateStatusHistory.actorUserId],
    references: [users.id],
  }),
}));

export const savedSearchesRelations = relations(savedSearches, ({ one }) => ({
  organization: one(organizations, {
    fields: [savedSearches.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [savedSearches.userId],
    references: [users.id],
  }),
}));

export const tagsRelations = relations(tags, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [tags.organizationId],
    references: [organizations.id],
  }),
  candidateTags: many(candidateTags),
}));

export const candidateTagsRelations = relations(candidateTags, ({ one }) => ({
  organization: one(organizations, {
    fields: [candidateTags.organizationId],
    references: [organizations.id],
  }),
  candidate: one(candidates, {
    fields: [candidateTags.candidateId],
    references: [candidates.id],
  }),
  tag: one(tags, {
    fields: [candidateTags.tagId],
    references: [tags.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  organization: one(organizations, {
    fields: [notifications.organizationId],
    references: [organizations.id],
  }),
  recipient: one(users, {
    fields: [notifications.recipientUserId],
    references: [users.id],
  }),
}));

// --- Phase 5: Assessment Templates Table ---
export const assessmentTemplates = pgTable('assessment_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'cascade' }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  timeLimitMinutes: integer('time_limit_minutes').notNull().default(60),
  passingScore: integer('passing_score').notNull().default(70),
  status: varchar('status', { length: 50 }).notNull().default('ACTIVE'), // DRAFT, ACTIVE, ARCHIVED
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  orgJobIdx: index('assessment_templates_org_job_idx').on(table.organizationId, table.jobId),
}));

// --- Phase 5: Assessment Questions Table ---
export const assessmentQuestions = pgTable('assessment_questions', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  templateId: uuid('template_id').references(() => assessmentTemplates.id, { onDelete: 'cascade' }).notNull(),
  type: varchar('type', { length: 50 }).notNull(), // MULTIPLE_CHOICE, FREE_TEXT, CODING_CHALLENGE
  title: varchar('title', { length: 255 }).notNull(),
  prompt: text('prompt').notNull(),
  options: jsonb('options'), // Array of MCQ choices { key, label } or null
  correctOption: varchar('correct_option', { length: 255 }), // Correct option key for MCQ
  allowedLanguages: jsonb('allowed_languages'), // e.g. ["python", "javascript", "typescript"]
  points: integer('points').notNull().default(10),
  orderIndex: integer('order_index').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  templateIdx: index('assessment_questions_template_idx').on(table.organizationId, table.templateId),
}));

// --- Phase 5: Coding Test Cases Table ---
export const codingTestCases = pgTable('coding_test_cases', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  questionId: uuid('question_id').references(() => assessmentQuestions.id, { onDelete: 'cascade' }).notNull(),
  input: text('input').notNull(),
  expectedOutput: text('expected_output').notNull(),
  isHidden: boolean('is_hidden').notNull().default(true),
  points: integer('points').notNull().default(5),
  timeoutMs: integer('timeout_ms').notNull().default(3000),
  memoryLimitMb: integer('memory_limit_mb').notNull().default(128),
}, (table) => ({
  questionIdx: index('coding_test_cases_question_idx').on(table.organizationId, table.questionId),
}));

// --- Phase 5: Interview Sessions Table ---
export const interviewSessions = pgTable('interview_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  candidateId: uuid('candidate_id').references(() => candidates.id, { onDelete: 'cascade' }).notNull(),
  templateId: uuid('template_id').references(() => assessmentTemplates.id, { onDelete: 'cascade' }).notNull(),
  accessToken: varchar('access_token', { length: 255 }).unique().notNull(),
  status: varchar('status', { length: 50 }).notNull().default('CREATED'), 
  // CREATED, INVITED, STARTED, IN_PROGRESS, SUBMITTED, PROCESSING, EVALUATED, REVIEWED, FINALIZED, EXPIRED
  startedAt: timestamp('started_at'),
  submittedAt: timestamp('submitted_at'),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  orgCandIdx: index('interview_sessions_org_cand_idx').on(table.organizationId, table.candidateId),
  tokenIdx: index('interview_sessions_token_idx').on(table.accessToken),
  statusIdx: index('interview_sessions_status_idx').on(table.organizationId, table.status),
}));

// --- Phase 5: Interview Answers Table ---
export const interviewAnswers = pgTable('interview_answers', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  sessionId: uuid('session_id').references(() => interviewSessions.id, { onDelete: 'cascade' }).notNull(),
  questionId: uuid('question_id').references(() => assessmentQuestions.id, { onDelete: 'cascade' }).notNull(),
  selectedOption: varchar('selected_option', { length: 255 }),
  textAnswer: text('text_answer'),
  submittedCode: text('submitted_code'),
  programmingLanguage: varchar('programming_language', { length: 50 }),
  submittedAt: timestamp('submitted_at').defaultNow().notNull(),
}, (table) => ({
  sessionQuestionIdx: index('interview_answers_session_question_idx').on(table.organizationId, table.sessionId, table.questionId),
}));

// --- Phase 5: Code Execution Results Table ---
export const codeExecutionResults = pgTable('code_execution_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  answerId: uuid('answer_id').references(() => interviewAnswers.id, { onDelete: 'cascade' }).notNull(),
  testCaseId: uuid('test_case_id').references(() => codingTestCases.id, { onDelete: 'cascade' }).notNull(),
  passed: boolean('passed').notNull(),
  actualOutput: text('actual_output'),
  errorOutput: text('error_output'),
  executionTimeMs: integer('execution_time_ms').notNull(),
  memoryUsedMb: integer('memory_used_mb').notNull(),
  status: varchar('status', { length: 50 }).notNull(), // PASSED, FAILED, TIMEOUT, MEMORY_LIMIT, RUNTIME_ERROR, COMPILATION_ERROR
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  answerIdx: index('code_execution_results_answer_idx').on(table.organizationId, table.answerId),
}));

// --- Phase 5: Assessment Evaluations Table ---
export const assessmentEvaluations = pgTable('assessment_evaluations', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  sessionId: uuid('session_id').references(() => interviewSessions.id, { onDelete: 'cascade' }).notNull(),
  deterministicScore: integer('deterministic_score').notNull(),
  maxDeterministicScore: integer('max_deterministic_score').notNull(),
  aiQualitativeFeedback: jsonb('ai_qualitative_feedback'),
  finalScore: integer('final_score').notNull(),
  isOverridden: boolean('is_overridden').notNull().default(false),
  overriddenByUserId: uuid('overridden_by_user_id').references(() => users.id),
  overrideReason: text('override_reason'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  sessionIdx: index('assessment_evaluations_session_idx').on(table.organizationId, table.sessionId),
}));

// --- Phase 6: Multi-Evaluator Panel Evaluations Table ---
export const panelEvaluations = pgTable('panel_evaluations', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  sessionId: uuid('session_id').references(() => interviewSessions.id, { onDelete: 'cascade' }).notNull(),
  evaluatorUserId: uuid('evaluator_user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  recommendation: varchar('recommendation', { length: 50 }).notNull(), // STRONG_HIRE, HIRE, NO_HIRE, STRONG_NO_HIRE
  qualitativeFeedback: text('qualitative_feedback').notNull(),
  scoreOverride: integer('score_override'),
  overrideReason: text('override_reason'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  sessionEvaluatorIdx: uniqueIndex('panel_evaluations_session_evaluator_idx').on(table.sessionId, table.evaluatorUserId),
  sessionIdx: index('panel_evaluations_session_idx').on(table.organizationId, table.sessionId),
  evaluatorIdx: index('panel_evaluations_evaluator_idx').on(table.organizationId, table.evaluatorUserId),
}));

// --- Phase 5 & 6 Relations Definitions ---
export const assessmentTemplatesRelations = relations(assessmentTemplates, ({ one, many }) => ({
  organization: one(organizations, { fields: [assessmentTemplates.organizationId], references: [organizations.id] }),
  job: one(jobs, { fields: [assessmentTemplates.jobId], references: [jobs.id] }),
  questions: many(assessmentQuestions),
  sessions: many(interviewSessions),
}));

export const assessmentQuestionsRelations = relations(assessmentQuestions, ({ one, many }) => ({
  organization: one(organizations, { fields: [assessmentQuestions.organizationId], references: [organizations.id] }),
  template: one(assessmentTemplates, { fields: [assessmentQuestions.templateId], references: [assessmentTemplates.id] }),
  testCases: many(codingTestCases),
  answers: many(interviewAnswers),
}));

export const codingTestCasesRelations = relations(codingTestCases, ({ one, many }) => ({
  organization: one(organizations, { fields: [codingTestCases.organizationId], references: [organizations.id] }),
  question: one(assessmentQuestions, { fields: [codingTestCases.questionId], references: [assessmentQuestions.id] }),
  executionResults: many(codeExecutionResults),
}));

export const interviewSessionsRelations = relations(interviewSessions, ({ one, many }) => ({
  organization: one(organizations, { fields: [interviewSessions.organizationId], references: [organizations.id] }),
  candidate: one(candidates, { fields: [interviewSessions.candidateId], references: [candidates.id] }),
  template: one(assessmentTemplates, { fields: [interviewSessions.templateId], references: [assessmentTemplates.id] }),
  answers: many(interviewAnswers),
  evaluations: many(assessmentEvaluations),
  panelEvaluations: many(panelEvaluations),
}));

export const interviewAnswersRelations = relations(interviewAnswers, ({ one, many }) => ({
  organization: one(organizations, { fields: [interviewAnswers.organizationId], references: [organizations.id] }),
  session: one(interviewSessions, { fields: [interviewAnswers.sessionId], references: [interviewSessions.id] }),
  question: one(assessmentQuestions, { fields: [interviewAnswers.questionId], references: [assessmentQuestions.id] }),
  executionResults: many(codeExecutionResults),
}));

export const codeExecutionResultsRelations = relations(codeExecutionResults, ({ one }) => ({
  organization: one(organizations, { fields: [codeExecutionResults.organizationId], references: [organizations.id] }),
  answer: one(interviewAnswers, { fields: [codeExecutionResults.answerId], references: [interviewAnswers.id] }),
  testCase: one(codingTestCases, { fields: [codeExecutionResults.testCaseId], references: [codingTestCases.id] }),
}));

export const assessmentEvaluationsRelations = relations(assessmentEvaluations, ({ one }) => ({
  organization: one(organizations, { fields: [assessmentEvaluations.organizationId], references: [organizations.id] }),
  session: one(interviewSessions, { fields: [assessmentEvaluations.sessionId], references: [interviewSessions.id] }),
  overriddenByUser: one(users, { fields: [assessmentEvaluations.overriddenByUserId], references: [users.id] }),
}));

export const panelEvaluationsRelations = relations(panelEvaluations, ({ one }) => ({
  organization: one(organizations, { fields: [panelEvaluations.organizationId], references: [organizations.id] }),
  session: one(interviewSessions, { fields: [panelEvaluations.sessionId], references: [interviewSessions.id] }),
  evaluatorUser: one(users, { fields: [panelEvaluations.evaluatorUserId], references: [users.id] }),
}));
