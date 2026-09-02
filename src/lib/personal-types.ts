/**
 * Response/request shapes for the personal-memory endpoints, mirrored from
 * the API's public OpenAPI (api/src/public-api/dto/{people,reminders,brief,
 * timeline,meetings,memories}.dto.ts). Names match the `getmnemo` SDK's
 * `src/personal/types.ts` (0.6.0) so the CLI can switch to the SDK resources
 * once that release is on npm. Only the fields the CLI renders or sends are
 * typed; `--json` passes the raw payload through untouched.
 */

export type ProvenanceKind = "api_key" | "mcp" | "user" | "connector" | "inbound" | "system";

export interface MemoryProvenance {
  kind: ProvenanceKind;
  id: string | null;
  label: string | null;
}

export interface MemoryRecord {
  id: string;
  content: string;
  memoryType: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  dueAt: string | null;
  createdBy: MemoryProvenance | null;
  container?: { tag?: string } | null;
}

export interface PersonImportantDate {
  label: string;
  date: string;
  recurring: boolean;
}

export interface CreatePersonInput {
  displayName: string;
  slug?: string;
  relationship?: string;
  email?: string;
  phone?: string;
  company?: string;
  notes?: string;
  importantDates?: PersonImportantDate[];
  aliases?: string[];
}

export interface Person {
  slug: string;
  tag: string;
  containerId: string;
  displayName: string;
  relationship: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  notes: string | null;
  importantDates: PersonImportantDate[];
  aliases: string[];
  archivedAt: string | null;
  memoryCount: number;
  openReminderCount: number;
  nextReminderAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedPeople {
  items: Person[];
  nextCursor: string | null;
  total: number;
}

export interface Reminder extends MemoryRecord {
  completedAt: string | null;
  person: { slug: string; displayName: string } | null;
}

export interface CreateReminderInput {
  content: string;
  dueAt: string;
  personSlug?: string;
  containerTag?: string;
  idempotencyKey?: string;
  metadata?: Record<string, string>;
}

export interface PaginatedReminders {
  items: Reminder[];
  nextCursor: string | null;
  total: number;
}

export interface ImportantDate {
  personSlug: string;
  displayName: string;
  label: string;
  date: string;
  daysUntil: number;
  recurring: boolean;
}

export interface UpcomingReminders {
  overdue: Reminder[];
  dueToday: Reminder[];
  upcoming: Reminder[];
  importantDates: ImportantDate[];
  generatedAt: string;
  timezone: string;
}

export interface AnswerCitation {
  type: string;
  score: number;
  content: string;
  sourceId?: string;
  title?: string;
  url?: string;
}

export interface BriefFollowUps {
  answer: string;
  citations: AnswerCitation[];
  abstained: boolean;
  cached: boolean;
}

export interface MeetingAttendee {
  email: string | null;
  name: string | null;
  responseStatus: string | null;
  self: boolean;
  person: { slug: string; displayName: string } | null;
}

export interface Meeting {
  documentId: string;
  eventId: string | null;
  title: string;
  start: string | null;
  end: string | null;
  isAllDay: boolean;
  status: string | null;
  htmlLink: string | null;
  location: string | null;
  organizer: { email: string | null; name: string | null } | null;
  attendees: MeetingAttendee[];
  containerTag: string;
  connectionId: string | null;
  attendeeSource: "metadata" | "contentText" | "none";
}

export interface MeetingConnection {
  id: string;
  containerTag: string;
  status: string;
  lastSyncAt: string | null;
}

export interface UpcomingMeetings {
  items: Meeting[];
  nextCursor: string | null;
  connections: MeetingConnection[];
}

export interface MeetingBrief extends Meeting {
  brief: BriefFollowUps | null;
  people: Array<{
    slug: string;
    displayName: string;
    relationship: string | null;
    openReminders: Reminder[];
    recentMemories: MemoryRecord[];
  }>;
  previousMeetings: Array<{ documentId: string; title: string; start: string | null }>;
  generatedAt: string;
}

export interface DailyBrief {
  date: string;
  timezone: string;
  generatedAt: string;
  scope: { kind: "workspace" | "container"; containerTag: string | null };
  reminders: { overdue: Reminder[]; dueToday: Reminder[]; upcoming: Reminder[] } | null;
  importantDates: ImportantDate[] | null;
  recentMemories: MemoryRecord[] | null;
  counts: { memoriesLast24h: number; documentsLast24h: number } | null;
  followUps: BriefFollowUps | null;
  meetings: Meeting[] | null;
}

export type TimelineItemType = "memory" | "reminder" | "document" | "event";
export const TIMELINE_ITEM_TYPES: readonly TimelineItemType[] = ["memory", "reminder", "document", "event"];

export interface TimelineItem {
  id: string;
  type: TimelineItemType;
  refId: string;
  occurredAt: string;
  title: string;
  snippet: string | null;
  containerTag: string;
  createdBy: MemoryProvenance | null;
  meta: Record<string, unknown>;
}

export interface Timeline {
  items: TimelineItem[];
  nextCursor: string | null;
  container: { tag: string; containerType: string; displayName: string | null } | null;
  range: { from: string | null; to: string | null };
}

export interface MergeMemoriesInput {
  containerTag: string;
  ids: string[];
  into?: string;
  content?: string;
  memoryType?: string;
  metadata?: Record<string, string>;
  mergeKey?: string;
}

export interface MergeMemoriesResponse {
  memory: MemoryRecord;
  mergedFromIds: string[];
  deletedIds: string[];
  replayed: boolean;
}
