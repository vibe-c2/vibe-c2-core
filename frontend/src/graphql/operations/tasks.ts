import { graphql } from "@/graphql/gql"

// TaskFields is the canonical task fragment used by the kanban + matrix views
// and the details dialog. Lookups for relations (assignees, wiki/credential
// references) are batched in the field resolvers — the cost is one extra
// repo call per row, which is fine at pet-scale and avoids per-feature
// fragment proliferation.
export const TaskFields = graphql(`
  fragment TaskFields on Task {
    id
    operationId
    name
    description
    riskScore
    riskDescription
    profitScore
    profitDescription
    stage
    status
    assignees {
      id
      username
    }
    wikiReferences {
      id
      title
      emoji
    }
    credentialReferences {
      id
      name
      type
    }
    createdBy {
      id
      username
    }
    lastUpdatedBy {
      id
      username
    }
    lastUpdatedAt
    deletedAt
    doneAt
    createdAt
    updatedAt
  }
`)

// TaskBacklinkFields is the lite shape used by the cross-domain backlink lists
// (wiki editor footer, credential details dialog). Keeps the row payload tight:
// title + stage/status for the badge, scores for visual weight, assignees so
// readers can see who owns it. We deliberately skip descriptions, references,
// timestamps — clicking the row opens the full edit dialog which fetches the
// canonical TaskFields shape via useTask.
export const TaskBacklinkFields = graphql(`
  fragment TaskBacklinkFields on Task {
    id
    operationId
    name
    stage
    status
    riskScore
    profitScore
    assignees {
      id
      username
    }
  }
`)

// --- Queries ---

export const TaskQuery = graphql(`
  query Task($id: ID!) {
    task(id: $id) {
      ...TaskFields
    }
  }
`)

export const TasksQuery = graphql(`
  query Tasks(
    $operationId: ID!
    $stage: TaskStage
    $excludeStages: [TaskStage!]
    $riskScoreMin: Int
    $riskScoreMax: Int
    $profitScoreMin: Int
    $profitScoreMax: Int
    $search: String
    $first: Int
    $after: String
  ) {
    tasks(
      operationId: $operationId
      stage: $stage
      excludeStages: $excludeStages
      riskScoreMin: $riskScoreMin
      riskScoreMax: $riskScoreMax
      profitScoreMin: $profitScoreMin
      profitScoreMax: $profitScoreMax
      search: $search
      first: $first
      after: $after
    ) {
      edges {
        node {
          ...TaskFields
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
      totalCount
    }
  }
`)

export const TaskTrashQuery = graphql(`
  query TaskTrash(
    $operationId: ID!
    $first: Int
    $after: String
  ) {
    taskTrash(operationId: $operationId, first: $first, after: $after) {
      edges {
        node {
          ...TaskFields
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
      totalCount
    }
  }
`)

// Cross-domain backlinks: tasks that reference a given wiki document or
// credential. Returned ordered by -updateAt, capped at 200 server-side.
// Trashed tasks are excluded. Used by the wiki editor footer ("Task backlinks"
// list) and the credential details dialog ("Referenced by tasks" list).
export const TasksReferencingWikiDocumentQuery = graphql(`
  query TasksReferencingWikiDocument($documentId: ID!) {
    tasksReferencingWikiDocument(documentId: $documentId) {
      ...TaskBacklinkFields
    }
  }
`)

export const TasksReferencingCredentialQuery = graphql(`
  query TasksReferencingCredential($credentialId: ID!) {
    tasksReferencingCredential(credentialId: $credentialId) {
      ...TaskBacklinkFields
    }
  }
`)

// --- Mutations ---

export const CreateTaskMutation = graphql(`
  mutation CreateTask($input: CreateTaskInput!) {
    createTask(input: $input) {
      ...TaskFields
    }
  }
`)

export const UpdateTaskMutation = graphql(`
  mutation UpdateTask($id: ID!, $input: UpdateTaskInput!) {
    updateTask(id: $id, input: $input) {
      ...TaskFields
    }
  }
`)

export const ChangeTaskStageMutation = graphql(`
  mutation ChangeTaskStage($input: ChangeTaskStageInput!) {
    changeTaskStage(input: $input) {
      ...TaskFields
    }
  }
`)

export const SetTaskAssigneesMutation = graphql(`
  mutation SetTaskAssignees($taskId: ID!, $assigneeIds: [ID!]!) {
    setTaskAssignees(taskId: $taskId, assigneeIds: $assigneeIds) {
      ...TaskFields
    }
  }
`)

export const SetTaskWikiReferencesMutation = graphql(`
  mutation SetTaskWikiReferences($taskId: ID!, $wikiIds: [ID!]!) {
    setTaskWikiReferences(taskId: $taskId, wikiIds: $wikiIds) {
      ...TaskFields
    }
  }
`)

// AddTaskWikiReference appends a single wiki doc to a task's reference list.
// Atomic on the server ($addToSet) — idempotent and race-free against
// concurrent edits coming from the task edit dialog. Used by the wiki
// editor's "Add to task" picker, which only knows the *current* wiki id
// and shouldn't have to fetch+replace the task's full reference array.
export const AddTaskWikiReferenceMutation = graphql(`
  mutation AddTaskWikiReference($taskId: ID!, $wikiId: ID!) {
    addTaskWikiReference(taskId: $taskId, wikiId: $wikiId) {
      ...TaskFields
    }
  }
`)

export const SetTaskCredentialReferencesMutation = graphql(`
  mutation SetTaskCredentialReferences(
    $taskId: ID!
    $credentialIds: [ID!]!
  ) {
    setTaskCredentialReferences(
      taskId: $taskId
      credentialIds: $credentialIds
    ) {
      ...TaskFields
    }
  }
`)

export const DeleteTaskMutation = graphql(`
  mutation DeleteTask($id: ID!) {
    deleteTask(id: $id)
  }
`)

export const RestoreTaskMutation = graphql(`
  mutation RestoreTask($id: ID!) {
    restoreTask(id: $id) {
      ...TaskFields
    }
  }
`)

export const PurgeTaskMutation = graphql(`
  mutation PurgeTask($id: ID!) {
    purgeTask(id: $id)
  }
`)

// --- Subscription ---

// Real-time task changes scoped to an operation. The server pushes the full
// task object for non-DELETED actions; the hook layer uses that to keep the
// detail cache hot without a follow-up query.
export const TaskChangedSubscription = graphql(`
  subscription TaskChanged($operationId: ID!) {
    taskChanged(operationId: $operationId) {
      action
      taskId
      operationId
      task {
        ...TaskFields
      }
    }
  }
`)
