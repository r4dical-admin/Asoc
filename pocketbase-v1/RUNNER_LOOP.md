# Runner Loop and Delegate Lifecycle

## 1) Goal

Define the v1 runner behavior for the PocketBase architecture where:

- one runner container connects to one tenant PocketBase instance,
- the runner continuously claims runnable tasks,
- each claimed task is executed inside its own short-lived delegate container running next to the runner,
- prompts and execution context are assembled from task record data, agent profile data, template markdown, and referenced resources,
- the runner remains the control plane for task state, lifecycle events, heartbeats, retries, and cleanup.

This document is intentionally narrower than `SPECS.md`: it focuses on the runner loop, the task lifecycle, and the runner lifecycle.

---

## 2) Operating Model

### 2.1 Control Plane vs Execution Plane

- `PocketBase` is the source of truth for tasks, lifecycle records, templates, profiles, and streamed interaction state.
- `Runner` is a long-lived control process per tenant connection.
- `Delegate container` is a short-lived execution sandbox for one task attempt.

The runner does not execute agent logic in-process. Its job is to:

1. discover runnable tasks,
2. claim capacity for them,
3. materialize an execution bundle,
4. start one delegate container per task,
5. stream lifecycle and output back into PocketBase,
6. decide task completion, retry, timeout, cancellation, and cleanup.

### 2.2 One Task Attempt == One Delegate Container

Each task attempt gets:

- one container,
- one isolated working directory or mounted scratch volume,
- one prompt bundle derived from the task/profile/template/context,
- one stream session,
- one terminal outcome.

If a task retries, the retry is a new attempt and therefore a new delegate container.

---

## 3) Recommended Collections Contract

The current v1 collections are enough to prototype the loop, but the runner behavior becomes cleaner if we treat the following fields as part of the contract.

### 3.1 `tasks`

Existing core fields remain:

- `status`: `queued|claimed|preparing|starting|running|finalizing|succeeded|failed|canceled|timed_out`
- `claimed_by_runner_id`
- `priority`
- `profile_id`
- `template_id`
- `context_refs_json`

Recommended additions:

- `attempt_no`
- `max_attempts`
- `next_eligible_at`
- `lease_expires_at`
- `delegate_container_id`
- `started_at`
- `finished_at`
- `cancel_requested_at`
- `result_summary_json`
- `error_code`

### 3.2 `task_lifecycle`

Use append-only rows for every meaningful transition and stream event.

Recommended state/event names:

- `queued`
- `claimed`
- `preparing`
- `bundle.ready`
- `delegate.starting`
- `running`
- `heartbeat`
- `stdout`
- `stderr`
- `stdin.request`
- `stdin.provided`
- `cancel.requested`
- `delegate.exited`
- `artifact.persisted`
- `retry.scheduled`
- `succeeded`
- `failed`
- `canceled`
- `timed_out`
- `abandoned`

### 3.3 `runner_registrations`

Treat the runner registration as a renewable lease, not just a startup announcement.

Recommended metadata:

- `runner_id`
- `display_name`
- `status`: `online|degraded|draining|offline`
- `heartbeat_at`
- `max_parallel_tasks`
- `active_task_count`
- `capabilities_json`
- `tenant_base_url`
- `version`

### 3.4 `task_stream_sessions`

One open session per active attempt.

Recommended fields:

- `task_id`
- `runner_id`
- `attempt_no`
- `status`: `open|closing|closed`
- `opened_at`
- `closed_at`
- `last_event_at`

---

## 4) Runner Main Loop

### 4.1 High-Level Loop

The runner should maintain three cooperating loops:

1. `registration loop`
2. `scheduler loop`
3. `supervision loop`

### 4.2 Registration Loop

Runs every few seconds:

- upsert `runner_registrations` for this runner,
- refresh `heartbeat_at`,
- publish `active_task_count`,
- mark status:
  - `online` when healthy,
  - `degraded` when PocketBase is reachable but execution capacity is impaired,
  - `draining` when shutting down and not accepting new work.

### 4.3 Scheduler Loop

Runs continuously with short polling plus optional realtime wakeups:

1. compute free slots: `max_parallel_tasks - active_task_count`,
2. if no free slots, sleep briefly,
3. fetch candidate tasks ordered by:
   - `priority desc`
   - `next_eligible_at asc`
   - `created asc`
4. attempt atomic claim for one task at a time,
5. on claim success:
   - set `claimed_by_runner_id`,
   - increment or initialize `attempt_no`,
   - set `lease_expires_at`,
   - append `claimed` lifecycle row,
   - hand task to the supervision loop.

The scheduler must assume multiple runners are racing. A failed claim is normal and should not be logged as an error.

### 4.4 Supervision Loop

Maintains an in-memory map of active attempts by `task_id`.

For each active attempt it advances the attempt through:

1. `preparing`
2. `starting`
3. `running`
4. `finalizing`
5. terminal cleanup

This loop also:

- renews task leases,
- forwards user input into delegates,
- records heartbeats,
- handles delegate exits,
- enforces timeout and cancellation,
- schedules retries when policy allows.

---

## 5) Task Attempt Lifecycle

### 5.1 State Machine

Recommended lifecycle:

`queued -> claimed -> preparing -> starting -> running -> finalizing -> succeeded|failed|canceled|timed_out`

Notes:

- `claimed` means the runner owns the task slot but has not yet built the execution bundle.
- `preparing` means the runner is resolving template/profile/context and staging files.
- `starting` means the delegate container create/start call has been issued.
- `running` means the delegate is alive and the task stream is open.
- `finalizing` means the delegate has exited and the runner is persisting outputs and deciding the final state.

### 5.2 Prepare Phase

During `preparing`, the runner must:

1. load the task record,
2. load the referenced profile,
3. load the template markdown file and parse frontmatter,
4. validate role compatibility and tool allowlists,
5. resolve referenced resources and incident context,
6. assemble the final prompt bundle,
7. create a scratch workspace,
8. write staged files for the delegate container.

The output of this phase is an execution bundle that includes:

- `system_prompt`
- `task_prompt`
- `template_instructions`
- `resource_context`
- `incident_context`
- `stdin/stdout` stream config
- `runtime policy`:
  - timeout,
  - tool allowlist,
  - network policy,
  - artifact output paths

If preparation fails, the runner should move directly to `failed` or `retry.scheduled` depending on policy.

### 5.3 Start Phase

During `starting`, the runner:

1. creates `task_stream_sessions` row,
2. starts a delegate container with:
   - tenant-scoped credentials,
   - mounted scratch directory,
   - task attempt metadata,
   - a narrow runtime policy,
3. records the delegate container ID on the task,
4. appends `delegate.starting`,
5. switches the task to `running` only after container startup succeeds.

### 5.4 Running Phase

While `running`, the runner:

- tails delegate stdout/stderr,
- writes ordered lifecycle events,
- refreshes task lease,
- emits `heartbeat`,
- checks for `cancel_requested_at`,
- accepts UI-provided stdin events and forwards them into the delegate,
- monitors wall-clock timeout and idle timeout if configured.

The runner should be able to survive noisy delegates by batching or rate-limiting lifecycle writes while still preserving order.

### 5.5 Finalize Phase

When the delegate exits, the runner:

1. captures exit code and stop reason,
2. persists final transcript/artifact pointers,
3. closes stream session,
4. determines terminal state,
5. clears runner ownership fields that should not survive completion,
6. appends terminal lifecycle rows,
7. destroys the delegate container and scratch workspace.

Terminal-state mapping:

- exit code `0` with valid outputs -> `succeeded`
- explicit user cancellation -> `canceled`
- timeout enforced by runner -> `timed_out`
- infra or execution failure -> `failed`

---

## 6) Delegate Container Lifecycle

### 6.1 Delegate Responsibilities

The delegate container is intentionally simple. It should:

- boot with a single-task payload,
- start the agent process,
- expose stdout/stderr to the runner,
- optionally consume stdin forwarded by the runner,
- write result files/artifacts into the mounted workspace,
- exit once the attempt is complete.

The delegate should not claim tasks directly and should not write task state back to PocketBase on its own. The runner remains the single writer for task state transitions.

### 6.2 Delegate Inputs

The runner provides:

- task metadata,
- resolved prompt files,
- policy/config JSON,
- credentials needed for allowed tools,
- mounted output directory.

### 6.3 Delegate Outputs

The delegate emits:

- stdout/stderr stream,
- structured result file,
- optional transcript file,
- optional artifacts,
- final exit code.

---

## 7) Runner Lifecycle

### 7.1 Startup

On startup, the runner should:

1. generate or load stable `runner_id`,
2. connect to PocketBase,
3. register itself,
4. reconcile abandoned work from any previous crash of the same runner identity,
5. enter `online` state,
6. start scheduler and supervision loops.

### 7.2 Healthy Operation

In steady state, the runner:

- keeps its registration fresh,
- claims work only up to configured parallelism,
- maintains one active delegate container per claimed running attempt,
- treats PocketBase as source of truth for control state.

### 7.3 Draining

When asked to stop gracefully, the runner:

1. marks itself `draining`,
2. stops claiming new tasks,
3. allows active delegates to finish up to a grace period,
4. cancels or requeues remaining tasks if grace expires,
5. marks itself `offline`.

### 7.4 Crash Recovery

If the runner crashes:

- delegates may still be alive temporarily,
- task leases eventually expire,
- another runner may reclaim orphaned tasks after lease expiration,
- old delegates should be garbage-collected by the local container runtime or a cleanup job.

Recovery rules:

- if a task is `claimed|preparing|starting|running` and `lease_expires_at` is in the past, it is eligible for abandonment handling,
- abandonment should append `abandoned`,
- policy decides whether to set the task back to `queued` or to `failed`.

---

## 8) Retry Policy

Retries should be controlled by task/profile/template policy rather than being implicit.

Recommended rules:

- validation failures during prepare: usually `failed`, no retry,
- transient infra failures during delegate start: retry,
- model/tool transient failures: retry with backoff,
- deterministic policy violations: no retry,
- user cancellation: no retry,
- runner crash with expired lease: retry if attempts remain.

Suggested retry action:

- increment `attempt_no`,
- set `next_eligible_at`,
- clear `delegate_container_id`,
- set status back to `queued`,
- append `retry.scheduled`.

---

## 9) Scheduling and Claiming Details

### 9.1 Claim Rule

The runner should only claim tasks where:

- `status = queued`
- `next_eligible_at <= now` or null
- task role is supported by runner capability

### 9.2 Capacity Rule

`max_parallel_tasks` is a runner-level limit.

Each active task consumes one slot from claim until final cleanup completes. This keeps the runner from overcommitting container starts and artifact persistence.

### 9.3 Priority Rule

Default ordering:

1. higher `priority`
2. earlier `next_eligible_at`
3. older creation time

### 9.4 Fairness Rule

If role classes or templates have very different runtimes, the runner may reserve sub-capacity by capability group later, but v1 should start with a single shared pool.

---

## 10) Prompt and Context Assembly

The final delegate prompt should be assembled in layers:

1. base system behavior from agent profile,
2. task objective from the task record,
3. template instructions from template markdown,
4. incident context from related incident records and sections,
5. referenced resources from `context_refs_json`,
6. runtime constraints from profile/template policy.

Assembly rules:

- template frontmatter is policy and metadata,
- template markdown body is instruction content,
- runner is responsible for producing the final normalized prompt bundle before delegate startup,
- delegates should receive resolved inputs, not raw collection references when avoidable.

This keeps delegate images generic and allows prompt assembly logic to evolve centrally in the runner.

---

## 11) Pseudocode

```text
runner.start():
  register_runner()
  recover_stale_attempts()
  spawn registration_loop()
  spawn scheduler_loop()
  spawn supervision_loop()

scheduler_loop():
  while not shutting_down:
    if free_slots() == 0:
      sleep(short_interval)
      continue

    task = fetch_next_queued_task()
    if not task:
      wait_for_poll_or_realtime_signal()
      continue

    if !atomic_claim(task):
      continue

    active_attempts.add(new Attempt(task))

supervision_loop():
  while not shutting_down:
    for attempt in active_attempts:
      switch attempt.phase:
        claimed -> prepare_attempt()
        preparing -> await_prepare_result()
        starting -> await_container_running()
        running -> supervise_streams_and_timeouts()
        finalizing -> persist_outputs_and_finish()
        terminal -> cleanup_attempt()
    sleep(tick_interval)

prepare_attempt():
  load task/profile/template/resources
  validate policy
  write prompt bundle
  transition task to preparing

start_delegate():
  create stream session
  container_id = runtime.start_container(bundle)
  transition task to running

supervise_running():
  forward stdout/stderr/stdin
  renew lease
  emit heartbeat
  if cancel requested: stop delegate
  if timeout: kill delegate and mark timed_out
  if exited: move to finalizing

finalize_attempt():
  persist artifacts
  close stream session
  decide terminal state
  delete container
  release slot
```

---

## 12) v1 Implementation Guidance

To evolve the current prototype runner toward this model, the implementation sequence should be:

1. introduce explicit attempt phases beyond `queued|claimed|running|succeeded`,
2. add lease and heartbeat handling,
3. separate scheduler logic from execution supervision,
4. add prompt/context bundle assembly from template and profile records,
5. replace in-process fake execution with per-task delegate container launch,
6. add stream session open/close behavior,
7. add timeout, cancellation, and retry paths,
8. add stale-attempt recovery on startup.

If we keep one principle fixed, it should be this:

The runner owns orchestration state; the delegate owns task execution; PocketBase owns durable truth.
