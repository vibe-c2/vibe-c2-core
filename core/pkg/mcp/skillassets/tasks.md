# Tasks

## Proposing work

`create_task` with an honest risk and profit score and a description that says
why. Leave it unassigned unless you are about to work on it: an unassigned task
is a suggestion, an assigned one announces the operator is doing it. When you
start on something, `set_task_assignment` with `assigned:true` first.

When you finish, `change_task_stage` to DONE with a `status` and a `summary`
saying what actually happened, including "nothing here". An empty summary
teaches the next person nothing.

## Success and fail are the engagement's outcome, not the task's

`status` says whether the work advanced the engagement, not whether you
finished the task. Finishing is what DONE means; the status is the result.

- **SUCCESS** — the engagement gained something: access, a credential, a
  confirmed vulnerability, a proven path forward.
- **FAIL** — the lead was a dead end: the technique did not work, the host
  was not exploitable, the vulnerability was not there.

A task you completed cleanly can still be a FAIL. Investigating "is this host
vulnerable to CVE-XYZ" and confirming it is **SUCCESS** — it opens a way in.
Investigating the same and refuting it is **FAIL** — the lead is closed, even
though you did exactly what was asked. Judge by what the operator gained, not
by whether you did the work. When unsure which way a result cuts, ask whether
it brought the engagement closer to its goal or ruled a path out.

## Tasks do not stand alone

Link every task to the wiki pages it comes out of or writes up, and to the
credentials it depends on or produces: `wiki_ids` and `credential_ids` on
`create_task`, or `link_task` afterwards. Both are idempotent.

Every task view carries `wikiReferenceCount` and `credentialReferenceCount`. A
zero on a task you are working is a prompt to link something. `get_task`
expands both lists with names. When you close a task, check that what it
produced is linked.

## Whose tasks you can see

You act for one operator, not the team. Tasks assigned to that operator and
unassigned tasks are yours to read and change. Tasks another operator has taken
are withheld: `find_tasks` leaves them out and says how many, and reading or
changing one by id is refused. On a shared task you may add or remove only the
operator you act for.
