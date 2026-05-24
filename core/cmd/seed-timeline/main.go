// Command seed-timeline writes mock OperationEvent rows directly into the
// operation_events collection so the Timeline page can be stress-tested
// against a realistic volume + spread of activity.
//
// It bypasses the event bus on purpose: pumping tens of thousands of bus
// events would cascade through events.Logger and double-insert, and would
// also thrash any live subscriber. The seeder talks to the repository
// directly with InsertMany batches.
//
// Usage:
//
//	go run ./cmd/seed-timeline -op test -years 2 -events-per-day 50
//
// All flags have sensible defaults. The operation is found by name; if the
// caller has more than one with the same name, the first match wins.
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"math/rand"
	"time"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/database"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
	"go.mongodb.org/mongo-driver/v2/bson"
)

func main() {
	var (
		opName        = flag.String("op", "test", "Operation name to seed")
		years         = flag.Int("years", 2, "How many years back from today to span")
		eventsPerDay  = flag.Int("events-per-day", 50, "Average events per day (jittered)")
		batchSize     = flag.Int("batch", 500, "InsertMany batch size")
		seed          = flag.Int64("seed", time.Now().UnixNano(), "RNG seed for reproducibility")
		dryRun        = flag.Bool("dry-run", false, "Don't write — just print stats")
		anchorActorID = flag.String("actor", "", "Force a specific actor user-id (UUID); empty = pick first op admin")
	)
	flag.Parse()

	if *years <= 0 {
		log.Fatalf("-years must be > 0 (got %d)", *years)
	}
	if *eventsPerDay <= 0 {
		log.Fatalf("-events-per-day must be > 0 (got %d)", *eventsPerDay)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	rng := rand.New(rand.NewSource(*seed))
	log.Printf("rng seed: %d", *seed)

	// Dry-run is fully offline: no Mongo connection, no operation lookup.
	// Useful for verifying the generator's distribution before pointing it
	// at a real environment.
	if *dryRun {
		opID := uuid.New()
		var actor uuid.UUID
		if *anchorActorID != "" {
			u, err := uuid.Parse(*anchorActorID)
			if err != nil {
				log.Fatalf("invalid -actor uuid: %v", err)
			}
			actor = u
		}
		rows := generateEvents(opID, actor, *years, *eventsPerDay, rng)
		log.Printf("dry-run: %d events generated (avg %.1f/day across %d years)",
			len(rows),
			float64(len(rows))/float64(*years*365),
			*years)
		printTopicMix(rows)
		return
	}

	db, err := database.NewDatabase(ctx)
	if err != nil {
		log.Fatalf("connect mongo: %v", err)
	}

	// Look up the operation by name. There is no FindByName helper on the
	// repo, so a direct collection read is the simplest path — this is a
	// dev tool, not a hot path.
	var op models.Operation
	if err := db.Collection("operations").FindOne(ctx, bson.M{"name": *opName}).One(&op); err != nil {
		log.Fatalf("find operation %q: %v", *opName, err)
	}
	log.Printf("operation: %s (%s) created at %s",
		op.Name, op.OperationID, op.CreateAt.Format(time.RFC3339))

	actor, err := pickActor(&op, *anchorActorID)
	if err != nil {
		log.Fatalf("%v", err)
	}
	log.Printf("actor: %s", actor)

	rows := generateEvents(op.OperationID, actor, *years, *eventsPerDay, rng)
	log.Printf("generated %d events spanning %d years (avg %d/day, actual %.1f/day)",
		len(rows), *years, *eventsPerDay,
		float64(len(rows))/float64(*years*365))

	eventRepo := repository.NewOperationEventRepository(db)
	start := time.Now()

	inserted := 0
	for i := 0; i < len(rows); i += *batchSize {
		end := i + *batchSize
		if end > len(rows) {
			end = len(rows)
		}
		batch := rows[i:end]
		if err := eventRepo.InsertMany(ctx, batch); err != nil {
			log.Fatalf("insert batch [%d:%d]: %v", i, end, err)
		}
		inserted += len(batch)
		if inserted%(10*(*batchSize)) == 0 || inserted == len(rows) {
			log.Printf("inserted %d/%d (%.0f%%)",
				inserted, len(rows),
				100*float64(inserted)/float64(len(rows)))
		}
	}

	log.Printf("done: %d rows inserted in %s (%.0f rows/s)",
		inserted, time.Since(start).Round(time.Millisecond),
		float64(inserted)/time.Since(start).Seconds())
	printTopicMix(rows)
}

// pickActor returns the user id to stamp on every generated event. An
// explicit --actor override wins; otherwise the operation's first admin
// member is used. Falls back to the first member of any role, then to
// uuid.Nil with a warning so the seeder never aborts on an empty op.
func pickActor(op *models.Operation, override string) (uuid.UUID, error) {
	if override != "" {
		u, err := uuid.Parse(override)
		if err != nil {
			return uuid.Nil, fmt.Errorf("invalid -actor uuid %q: %w", override, err)
		}
		return u, nil
	}
	for _, m := range op.Members {
		if m.Role == models.OperationRoleAdmin {
			return m.UserID, nil
		}
	}
	if len(op.Members) > 0 {
		return op.Members[0].UserID, nil
	}
	log.Printf("warning: operation %s has no members; events will have nil actor", op.OperationID)
	return uuid.Nil, nil
}

// generateEvents builds the full event list in chronological order.
// Daily volume is jittered around the mean so the timeline shows realistic
// "quiet stretches" and "burst days" rather than a uniform tape.
func generateEvents(
	opID uuid.UUID,
	actor uuid.UUID,
	years, avgPerDay int,
	rng *rand.Rand,
) []*models.OperationEvent {
	totalDays := years * 365
	endDate := time.Now().UTC()
	startDate := endDate.AddDate(-years, 0, 0)

	// Rough capacity: avg × days × jitter headroom. Over-allocating is fine
	// — the slice grows lazily anyway, but giving it a hint avoids the
	// 8 reallocations a 35k-item append loop would otherwise do.
	rows := make([]*models.OperationEvent, 0, totalDays*avgPerDay)

	// Counter for synthetic subject names so they're unique and readable.
	counters := map[models.SubjectKind]int{}

	for d := 0; d < totalDays; d++ {
		day := startDate.AddDate(0, 0, d)

		// Daily density: a heavy-tailed jitter so a few days have very high
		// counts (a 951-event import-style day) while most hover near the
		// mean. Probability ~5% of "burst" days at 5–15× the mean.
		var count int
		if rng.Float64() < 0.05 {
			count = avgPerDay * (5 + rng.Intn(11))
		} else {
			// Triangular-ish: mean ± 60%.
			deviation := int(float64(avgPerDay) * 0.6)
			count = avgPerDay - deviation + rng.Intn(2*deviation+1)
			if count < 0 {
				count = 0
			}
		}
		// 10% of days are entirely empty (operator's day off).
		if rng.Float64() < 0.10 {
			count = 0
		}

		for i := 0; i < count; i++ {
			kind, topic := pickSubjectKind(rng)
			counters[kind]++
			row := buildRow(opID, actor, kind, topic, counters[kind], day, rng)
			rows = append(rows, row)
		}
	}

	return rows
}

// pickSubjectKind chooses a subject kind for one event using a weighted
// roll. Weights track roughly what the timeline filter UI currently
// supports — credentials and wiki docs dominate, custom annotations are
// the minority.
func pickSubjectKind(rng *rand.Rand) (models.SubjectKind, string) {
	roll := rng.Float64()
	switch {
	case roll < 0.45:
		return models.SubjectKindCredential, "credential.created"
	case roll < 0.85:
		return models.SubjectKindWikiDocument, "wiki.document.created"
	default:
		return models.SubjectKindCustomEvent, "timeline.custom.created"
	}
}

// buildRow constructs one OperationEvent. occurred_at is the supplied day
// plus a random time-of-day so events spread across the 24-hour cycle and
// the DAY-level bucketing groups them naturally.
func buildRow(
	opID, actor uuid.UUID,
	kind models.SubjectKind,
	topic string,
	counter int,
	day time.Time,
	rng *rand.Rand,
) *models.OperationEvent {
	occurredAt := day.Add(
		time.Duration(rng.Intn(24)) * time.Hour,
	).Add(
		time.Duration(rng.Intn(60)) * time.Minute,
	).Add(
		time.Duration(rng.Intn(60)) * time.Second,
	)

	eventID := uuid.New()
	subjectID := eventID
	if kind != models.SubjectKindCustomEvent {
		// For credential / wiki rows the subject is a separate entity even
		// if synthetic. Random UUIDs land in the right shape for the
		// timeline's subject-id-as-link path (which already 404s gracefully
		// when the entity is missing).
		subjectID = uuid.New()
	}

	var actorPtr *uuid.UUID
	if actor != uuid.Nil {
		a := actor
		actorPtr = &a
	}

	row := &models.OperationEvent{
		EventID:     eventID,
		OperationID: opID,
		Topic:       topic,
		SubjectKind: kind,
		SubjectID:   subjectID,
		SubjectName: synthName(kind, counter),
		ActorType:   models.EventActorUser,
		ActorID:     actorPtr,
		OccurredAt:  occurredAt.UTC(),
	}
	if kind == models.SubjectKindCustomEvent {
		row.Metadata = map[string]any{
			"description": fmt.Sprintf("Seeded annotation #%d", counter),
		}
	}
	return row
}

// synthName produces a readable subject_name keyed off the kind so the
// timeline reads as plausible activity rather than UUID soup.
func synthName(kind models.SubjectKind, counter int) string {
	switch kind {
	case models.SubjectKindCredential:
		hosts := []string{"prod-db", "staging-api", "edge-node", "dmz-jump", "ops-bastion"}
		return fmt.Sprintf("%s/svc_%04d", hosts[counter%len(hosts)], counter)
	case models.SubjectKindWikiDocument:
		topics := []string{
			"Recon notes", "Target profile", "Lateral move plan", "C2 traffic shape",
			"Phishing template", "Cleanup checklist", "OPSEC review", "Pivot diagram",
		}
		return fmt.Sprintf("%s — #%d", topics[counter%len(topics)], counter)
	case models.SubjectKindCustomEvent:
		actions := []string{
			"Initial access gained",
			"Credentials harvested",
			"Lateral movement confirmed",
			"Persistence established",
			"Domain admin reached",
			"Data exfil window",
			"Operator handoff",
			"Cleanup sweep",
		}
		return actions[counter%len(actions)]
	}
	return fmt.Sprintf("Event #%d", counter)
}

// printTopicMix dumps the subject-kind histogram so a dry-run shows the
// generator's actual distribution.
func printTopicMix(rows []*models.OperationEvent) {
	mix := map[models.SubjectKind]int{}
	for _, r := range rows {
		mix[r.SubjectKind]++
	}
	for k, n := range mix {
		log.Printf("  %-15s %d (%.1f%%)", k, n, 100*float64(n)/float64(len(rows)))
	}
}
