# Timeline Feature Spec — Operation-Scoped Event History

## 1. Overview

The timeline is an operation-scoped page that visualizes the full activity history of an operation as a horizontal axis from operation creation through today. Active days appear as dots on the axis; vertical event stacks rise above each active day showing every event that happened that day. Empty stretches of time are compressed into single fixed-width "gap" segments labeled with the span (e.g. `↔ 23 days`) so the timeline preserves the sense of elapsed time without wasting horizontal space.

Events are emitted automatically by the application — operators do not create them by hand. Each event captures *who* did *what* to *which subject* and *when*.

**Core approach:** A new persistent `operation_events` MongoDB collection records every event of interest. A single subscriber attached to the existing in-process `IEventBus` translates emitted domain events into persisted rows. The frontend reads two GraphQL queries — one for bucket counts (the axis) and one for the events of a specific day (the vertical stack) — and an SSE subscription for live appends. The visualization is plain React + CSS with shadcn/Radix primitives; no charting or timeline library.

## 2. Design Decisions

### 2.1 Persistent Event Log Separate From the Event Bus

The existing `IEventBus` (`core/pkg/eventbus/`) is in-process pub/sub used for SSE subscriptions and side effects (e.g. disconnecting Hocuspocus clients on role change). Events are not persisted.

The timeline needs a durable, queryable, historical log. We introduce a new `operation_events` collection and a new `OperationEvent` model. The event bus remains the canonical publish surface; persistence is one subscriber among many.

**Why:** Keeps the bus minimal and decoupled from storage. Anyone adding a new domain event automatically gets timeline coverage by adding their topic to the persistence subscriber's topic set — a single-file, single-line change.

### 2.2 Snapshot Subject Name at Write Time

Each persisted event stores `subject_name` (e.g. the credential's name, the wiki document's title) as captured at the moment the event was logged. We do **not** join back to the live subject on read.

**Why:** Events must survive deletion of their subject. A credential deleted six months ago should still render as "Alice added password \"prod-db-root\"" on the timeline, not "Alice added (deleted credential)". This also makes the read path a single Mongo scan with zero joins.

### 2.3 No Pre-Rendered Summary String

The persisted row stores structured fields (`topic`, `subject_kind`, `subject_name`, `actor_id`, `metadata`). The human-readable summary ("Alice added password credential \"prod-db-root\"") is rendered client-side from those fields by a pure function `event-summary.ts`.

**Why:** Lets us iterate on phrasing, localization, and density without backfilling rows.

### 2.4 Piecewise (Segmented) Time Axis

Active days get a fixed-width segment. Contiguous runs of zero-event days collapse into a single fixed-width "gap" segment labeled with the day count. The axis is not a linear time-to-pixel mapping.

**Why:** Operations can run for months with sparse activity. A linear scale wastes most of the canvas on empty space. The piecewise scale shows *that* time passed (with the gap label) without burning pixels on it. Matches the user's stated requirement to compress empty stretches.

### 2.5 Always-Render Vertical Event Stacks

Every active day always shows its full vertical stack of event dots above the axis. No expand-on-click affordance is needed.

**Why:** The user explicitly chose this over expand-on-click. Trade-off: dense days can grow tall. Acceptable; the timeline scrolls vertically when content overflows.

### 2.6 Viewer's Local Timezone for Bucketing

Day boundaries are computed in the viewer's local timezone (browser `Intl.DateTimeFormat().resolvedOptions().timeZone`), not UTC and not a stored operation timezone.

**Why:** Operators care about "what happened today" in their own working day. Mongo `$dateTrunc` with `timezone` does this server-side correctly. The viewer's IANA TZ string is passed as a query argument.

### 2.7 Three Granularities: Day / Week / Month

The user can toggle between day-, week-, and month-level buckets. Granularity is a query argument; rebucketing happens server-side via `$dateTrunc`.

**Why:** A 2-year operation viewed at day granularity has 730 segments and is hard to scan; month granularity gives a high-level shape. Both views over the same data, no extra storage cost.

### 2.8 Events Are Kept Forever

No TTL on the `operation_events` collection. No retention sweeper. Same posture as `sessions` ("Mongo `sessions` retention: unbounded, no TTL").

**Why:** The timeline is the operation's history; truncating it defeats the feature. Revisit only if a collection grows large enough to matter.

### 2.9 One-Time Backfill on First Deploy

When the persistence subscriber starts and finds an empty `operation_events` collection, it backfills synthetic `credential.created` and `wiki.document.created` events from existing rows of those collections, using the source row's `CreatedByID` as actor and `CreateAt` as `occurred_at`.

**Why:** Without backfill, existing operations would look empty until the first new event. The backfill is idempotent: event IDs are derived deterministically as `uuidv5(topic + subject_id)` so a re-run cannot duplicate rows.

### 2.10 No Timeline Visualization Library

The frontend is plain React + Tailwind + shadcn/Radix primitives (Dialog, Tooltip, Popover). The only new dependency is **dayjs** (with `utc` and `timezone` plugins) for date math.

**Why:** Every mainstream timeline / charting library assumes a continuous time axis. None natively support the piecewise compressed-gap pattern. The visualization is discrete (dots, vertical lines, fixed-width segments) and does not need SVG, Canvas, or D3. Plain DOM is the cheapest, lightest, and most shadcn-consistent path. See section 7 for the rejected alternatives.

## 3. Initial Event Coverage

Phase 1 ships with two event types, both already emitted by existing resolvers:

| Topic | Source | Subject Kind |
|---|---|---|
| `credential.created` | `core/pkg/resolver/credential_resolver.go` (already emits) | `credential` |
| `wiki.document.created` | `core/pkg/resolver/wiki_document_resolver.go` (already emits) | `wiki_document` |

Phase 2+ will extend coverage by adding topics to the persistence subscriber's subscribe call. Candidates already on the bus that we will add later:

- `credential.updated`, `credential.deleted`, `credential.comment.added`
- `wiki.document.updated`, `wiki.document.soft_deleted`, `wiki.document.moved`, `wiki.document.restored`
- `operation.member.added`, `operation.member.removed`, `operation.member.updated`
- Future: scheme network point changes, implant check-ins, host scans, etc.

## 4. Data Model

### 4.1 MongoDB Collection: `operation_events`

```go
// core/pkg/models/operation_event.go

type OperationEvent struct {
    field.DefaultField `bson:",inline"`
    EventID     uuid.UUID  `bson:"event_id"     json:"eventId"`
    OperationID uuid.UUID  `bson:"operation_id" json:"operationId"`
    Topic       string     `bson:"topic"        json:"topic"`
    SubjectKind string     `bson:"subject_kind" json:"subjectKind"`
    SubjectID   uuid.UUID  `bson:"subject_id"   json:"subjectId"`
    SubjectName string     `bson:"subject_name" json:"subjectName"`
    ActorType   string     `bson:"actor_type"   json:"actorType"`
    ActorID     *uuid.UUID `bson:"actor_id,omitempty" json:"actorId,omitempty"`
    Metadata    bson.M     `bson:"metadata,omitempty" json:"-"`
    OccurredAt  time.Time  `bson:"occurred_at"  json:"occurredAt"` // UTC
}
```

### 4.2 Indexes

| Index | Purpose |
|---|---|
| `{event_id: 1}` unique | Idempotent insert (backfill safety) |
| `{operation_id: 1, occurred_at: -1}` | Primary timeline scan |
| `{operation_id: 1, subject_kind: 1, occurred_at: -1}` | Type filter |
| `{operation_id: 1, actor_id: 1, occurred_at: -1}` | Actor filter |

### 4.3 Deterministic Event IDs

```
EventID = uuidv5(namespace=DNS, name = topic + "|" + subject_id)  // for backfill
EventID = uuid.New()                                              // for live events
```

Backfill never duplicates because `(topic, subject_id)` is unique for the seed events.

## 5. Backend Architecture

### 5.1 Repository — `core/pkg/repository/operation_event_repository.go`

```go
type IOperationEventRepository interface {
    Insert(ctx context.Context, e *models.OperationEvent) error
    InsertMany(ctx context.Context, events []*models.OperationEvent) error
    Buckets(ctx context.Context, q BucketQuery) ([]Bucket, error)
    ListByDay(ctx context.Context, q DayQuery) ([]models.OperationEvent, string, error) // cursor pagination
    EnsureIndexes(ctx context.Context) error
    IsEmpty(ctx context.Context) (bool, error)
}

type BucketQuery struct {
    OperationID uuid.UUID
    From, To    time.Time
    Types       []string
    ActorIDs    []uuid.UUID
    Granularity string  // "day" | "week" | "month"
    Timezone    string  // IANA, e.g. "Europe/Berlin"
}

type Bucket struct {
    BucketStart time.Time // start of the day/week/month in the viewer's TZ
    Count       int
}

type DayQuery struct {
    OperationID uuid.UUID
    Date        time.Time // midnight in viewer TZ
    Timezone    string
    Types       []string
    ActorIDs    []uuid.UUID
    First       int
    After       string // opaque cursor
}
```

Bucket aggregation uses Mongo `$dateTrunc` with the viewer's IANA timezone:

```
{ $dateTrunc: { date: "$occurred_at", unit: "day", timezone: "Europe/Berlin" } }
```

### 5.2 Persistence Subscriber — `core/pkg/events/logger.go`

A new package `core/pkg/events/` owns the subscriber:

```go
type Logger struct {
    repo     repository.IOperationEventRepository
    users    repository.IUserRepository
    creds    repository.ICredentialRepository
    wikiDocs repository.IWikiDocumentRepository
    logger   *zap.Logger
}

// Handle is the eventbus.Handler. Translates topic → OperationEvent and inserts.
func (l *Logger) Handle(ctx context.Context, e eventbus.Event) { /* … */ }
```

The handler:
1. Switches on `e.Topic`.
2. Looks up the subject's current name (credential.Name or wikiDoc.Title) — needed for the `subject_name` snapshot.
3. Builds the `OperationEvent` row, persists it.
4. Logs and swallows errors (the bus must not block on failures); a failed insert just means the event won't appear on the timeline — it does not break the user flow.

### 5.3 Wiring in `app.go`

```go
// after bus initialization
eventLogger := events.NewLogger(
    repos.OperationEvent, repos.User, repos.Credential, repos.WikiDocument, l,
)
bus.Subscribe(
    []eventbus.Topic{
        eventbus.TopicCredentialCreated,
        eventbus.TopicWikiDocumentCreated,
        // future topics added here
    },
    eventLogger.Handle,
)

// after subscriber registration, but before server start
if err := eventLogger.BackfillIfEmpty(ctx); err != nil {
    l.Warn("event log backfill failed", zap.Error(err))
}
```

### 5.4 Backfill Implementation

```go
func (l *Logger) BackfillIfEmpty(ctx context.Context) error {
    empty, err := l.repo.IsEmpty(ctx)
    if err != nil || !empty {
        return err
    }
    // stream credentials in batches
    // stream wiki documents (including soft-deleted) in batches
    // build OperationEvent rows with deterministic EventIDs
    // InsertMany per batch
}
```

Batch size: 500 rows per insert. Backfill runs once on first deploy; the deterministic IDs make re-runs safe.

### 5.5 GraphQL Schema Additions

Append to `core/pkg/graphql/schema/schema.graphql`:

```graphql
enum TimelineGranularity {
  DAY
  WEEK
  MONTH
}

type OperationEvent {
  id: ID!
  operationId: ID!
  topic: String!
  subjectKind: String!
  subjectId: ID!
  subjectName: String!
  actor: User                  # null for system/service actors
  occurredAt: String!          # ISO 8601 UTC
  metadata: String             # JSON-encoded; introduce a JSON scalar later if needed
}

type OperationEventEdge {
  node: OperationEvent!
  cursor: String!
}

type OperationEventConnection {
  edges: [OperationEventEdge!]!
  pageInfo: PageInfo!
  totalCount: Int!
}

type OperationEventBucket {
  bucketStart: String!         # ISO 8601, midnight-aligned to granularity in given TZ
  count: Int!
}

extend type Query {
  operationEventBuckets(
    operationId: ID!
    from: String
    to: String
    granularity: TimelineGranularity = DAY
    timezone: String!
    types: [String!]
    actorIds: [ID!]
  ): [OperationEventBucket!]! @hasPermission(permission: "operation:member")

  operationEventsByDay(
    operationId: ID!
    date: String!              # "2026-05-23" in given timezone
    timezone: String!
    types: [String!]
    actorIds: [ID!]
    first: Int = 100
    after: String
  ): OperationEventConnection! @hasPermission(permission: "operation:member")
}

extend type Subscription {
  operationEventAdded(operationId: ID!): OperationEvent!
}
```

### 5.6 Live Updates

The subscription `operationEventAdded` pushes one `OperationEvent` per emitted event scoped to the requested operation. The frontend appends it to the current day's stack (or promotes a gap into an active segment) and bumps the bucket count. No refetch required.

## 6. Frontend Architecture

### 6.1 Route and Navigation

- New route `/timeline` in `App.tsx`, inside `<ProtectedRoute>` + `<AppLayout>`.
- Operation-scoped: when no operation is selected, redirect to `/operations` (same pattern as `dashboard.tsx:14-17`).
- New entry in `navigationItems` in `frontend/src/navigation.tsx` (the operation-scoped section). Icon: `ClockIcon` or `ActivityIcon` from lucide-react — final choice deferred to implementation.

### 6.2 Dependencies

Add: **`dayjs`** with `utc` and `timezone` plugins (~3 KB).

All other primitives are already installed: `@base-ui/react` (Radix Dialog/Tooltip/Popover), `lucide-react`, `@tanstack/react-virtual` (horizontal virtualization, only if needed), `tw-animate-css`.

**No timeline or charting library is added.** See section 7 for the evaluation that led to this decision.

### 6.3 File Layout

```
frontend/src/pages/timeline.tsx
frontend/src/components/timeline/
  ├─ timeline-canvas.tsx        # outer overflow-x container
  ├─ timeline-toolbar.tsx       # granularity toggle + filters
  ├─ piecewise-axis.ts          # pure layout function (testable)
  ├─ active-day-segment.tsx     # dot + vertical stack
  ├─ compressed-gap.tsx         # "↔ 23 days" segment
  ├─ event-dot.tsx              # one event in the stack, opens dialog
  ├─ event-details-dialog.tsx   # modal with full event detail
  ├─ event-summary.ts           # (event) → human string
  ├─ event-icons.ts             # subject_kind → lucide icon + color
  ├─ today-marker.tsx           # vertical "Today" indicator on right edge
  ├─ operation-created-marker.tsx
  └─ use-timeline-data.ts       # queries + subscription, merges live events

frontend/src/graphql/operations/timeline.ts  # gql documents
frontend/src/graphql/hooks/timeline.ts       # codegen-driven hooks
```

### 6.4 DOM Structure

```
<TimelineCanvas>                         overflow-x: auto
  <TimelineToolbar />
  <AxisRow>                              display: flex; flex-direction: row
    <OperationCreatedMarker />           left bookend
    <ActiveSegment date="2026-05-18">
      <EventStack>                       flex-col-reverse above the axis
        <EventDot event={…} />           hover → Tooltip; click → Dialog
        <EventDot event={…} />
      </EventStack>
      <AxisDot />                        the dot on the horizontal line
      <DateLabel />
    </ActiveSegment>
    <CompressedGap spanDays={23} />
    <ActiveSegment date="2026-06-10"> … </ActiveSegment>
    …
    <TodayMarker />                      right bookend
  </AxisRow>
</TimelineCanvas>
```

### 6.5 Layout Math — `piecewise-axis.ts`

Pure function, no DOM, unit-testable:

```ts
type Segment =
  | { kind: 'active'; date: string; count: number; widthPx: number }
  | { kind: 'gap'; fromDate: string; toDate: string; spanDays: number; widthPx: number }

const ACTIVE_WIDTH_PX = { day: 80, week: 120, month: 160 } as const
const GAP_WIDTH_PX = 56

function buildSegments(
  buckets: Bucket[],          // sorted, includes empty buckets between active ones
  granularity: 'day' | 'week' | 'month',
): Segment[]
```

Behavior:
- Walk buckets in order.
- Every bucket with `count > 0` → one `active` segment, width = `ACTIVE_WIDTH_PX[granularity]`.
- Every contiguous run of `count == 0` buckets → one `gap` segment, width = `GAP_WIDTH_PX`, span label = number of empty buckets.
- Cumulative `x` is implicit via flex layout — no manual positioning.

### 6.6 Live Updates

`use-timeline-data.ts`:
1. Issues `operationEventBuckets` once (for the axis).
2. Issues `operationEventsByDay` lazily, per active day, when its segment is mounted (or eagerly for all visible days on initial paint — implementation choice; eager is fine until we see lag).
3. Subscribes to `operationEventAdded` for the current operation.
4. On every pushed event:
   - If a bucket exists for that day → increment its `count` and append the event to the day's cached list.
   - Else → insert a new active bucket for that day (collapsing the surrounding gap if needed).

### 6.7 Today Marker

A vertical "Today" line anchored to the right edge of the axis row, with a small `Today` label. Rendered as a child of `AxisRow`. Always present.

### 6.8 Operation Created Marker

A vertical "Operation created" pseudo-event anchored to the left edge of the axis row. Computed client-side from `Operation.createdAt` — **not stored as an event row**. Always present, ensures the timeline never starts visually empty even when there are no events.

### 6.9 Filters

| Filter | UI |
|---|---|
| Granularity | Segmented toggle (`Day | Week | Month`) — same style as the Findings/Users tab switcher (`findings.tsx:36-48`) |
| Type | Multi-select checkbox group (Credentials, Wiki Docs) using existing combobox/popover patterns |
| Actor | User multi-select using the existing `userSuggestions` query (same UX as adding operation members) |
| Date range | Optional from/to picker; narrows the `operationEventBuckets` query |

All filter state lives in URL search params (e.g. `?gran=day&types=credential&actor=…`) so the view is shareable and deep-linkable, matching the existing Findings pattern.

### 6.10 Event Details Dialog

Click any `EventDot` → opens a Radix Dialog showing:
- Actor (avatar + username) — null = "System"
- Timestamp (absolute local time + relative — "2 hours ago")
- Topic, formatted ("Credential created")
- Subject name + subject kind
- Link to the live subject: `/wiki/<id>` for wiki docs; `/findings?credential=<id>` (or similar) for credentials
- Metadata, pretty-printed JSON (debug/advanced toggle)

### 6.11 Empty State

If the operation has zero persisted events: render only the `OperationCreatedMarker` and the `TodayMarker` with a single compressed gap between them, plus a centered helper message — "No events yet. Activity will appear here as you work."

### 6.12 Virtualization

Not implemented for MVP. If an operation produces more than ~500 active segments and panning lags, wire `@tanstack/react-virtual` horizontally inside `AxisRow`. The segment layout is already absolute-friendly because each segment owns a fixed width.

## 7. Rejected Alternatives — Frontend

| Library | Reason rejected |
|---|---|
| **vis-timeline** (+ react-vis-timeline) | Continuous time axis only; no piecewise compression. Heavy (~200 KB). Canvas/DOM hybrid hard to style consistently with shadcn. |
| **visx** (Airbnb) | Lovely D3+React primitives, but the piecewise mapping is not a standard d3 scale. We would write the layout ourselves anyway — the library buys little. |
| **Apache ECharts** | Powerful but ~900 KB, canvas-based, painful to skin to match the design system. Overkill for discrete dot rendering. |
| **Recharts** | A charting library — wrong primitives, no event-on-axis pattern. |
| **react-chrono** | Narrative story timelines, not data-dense activity logs. |
| **react-calendar-timeline** | Gantt scheduling — items have start+end durations. Our events are point-in-time. |
| **TimelineJS** | Slide-based narrative tool, not a component. |

Decision: plain React + Tailwind + shadcn/Radix primitives, plus `dayjs` for date math. See section 2.10.

## 8. Build Order

Stages are independently mergeable; the page only becomes visible after stage 7.

1. **Model + repository + indexes**
   `core/pkg/models/operation_event.go`, `core/pkg/repository/operation_event_repository.go`. Unit-tested with table-driven tests for `Buckets` and `ListByDay`.

2. **Persistence subscriber**
   `core/pkg/events/logger.go` translating bus events → repository inserts. Wired in `app.go`.

3. **Backfill**
   `BackfillIfEmpty` runs once on first startup. Idempotent via deterministic event IDs.

4. **GraphQL queries + subscription**
   Schema additions, resolvers, `make gqlgen`. Verifiable from the Altair playground before any frontend work.

5. **Frontend scaffold**
   Route, nav entry, empty `/timeline` page that fetches buckets and renders raw counts (no styling). Confirms the data pipe.

6. **Piecewise axis + active segments + gap segments**
   Static render — no filters, no live updates, no modal. Looks like the real thing.

7. **Visible to users**
   Add nav entry; the page is now reachable.

8. **Filters (type, actor, date range) + granularity toggle**
   URL-driven, refetches on change.

9. **Event details dialog + event summary function**
   Click handler on dots.

10. **Live updates via subscription**
    Append/promote logic in `use-timeline-data.ts`.

11. **Empty / loading / error states + polish**
    Today marker, operation-created marker, tooltips.

## 9. Risks and Open Items

- **No JSON GraphQL scalar today.** `metadata` ships as a JSON-encoded string. Introduce a proper scalar later if it becomes annoying.
- **Single-pod subscription assumption.** The event bus is in-process. Cross-pod scaling for `operationEventAdded` is a pre-existing limitation of all current subscriptions, not a new one. Persisted events are still complete because the writer also runs in the same pod that publishes — the limitation only affects who *sees* the live push.
- **Backfill cost on large existing datasets.** Streamed in batches of 500. Acceptable in current scale; revisit if any operation has tens of thousands of credentials or wiki docs.
- **Dense days may grow tall.** With "always render vertical stack" chosen, a day with 50 events produces a 50-tall stack. We will revisit only if it becomes a real problem; cheap fallback is a collapse-after-N affordance.
- **Pinch/wheel zoom between granularities** is out of scope. The Day/Week/Month toggle covers the use case; revisit only if the toggle feels clunky in practice.
- **`OperationCreatedMarker`** is purely client-side from `Operation.createdAt`. If we later want it queryable as an event, we can synthesize it server-side at the same point we backfill.

## 10. Glossary

| Term | Meaning |
|---|---|
| **Active segment** | A timeline segment representing a day/week/month that has at least one event. Fixed width per granularity. |
| **Gap segment** | A compressed timeline segment representing a contiguous run of zero-event days/weeks/months. Fixed width regardless of span. Labeled with the span (`↔ 23 days`). |
| **Bucket** | One unit on the time axis at the current granularity. Each bucket carries a count of events. The frontend may render it as either an active or gap segment. |
| **Subject** | The domain entity an event is about — a credential, a wiki document, etc. Identified by `subject_kind` + `subject_id`. |
| **Actor** | The originator of the event. Almost always a `User`; future system/service events have a null actor. |
| **Piecewise scale** | A time-to-pixel mapping with different ratios for different segments — active days at full width, empty runs collapsed to a fixed gap width. |
