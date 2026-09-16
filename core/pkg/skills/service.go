package skills

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"time"

	"github.com/google/uuid"
	"github.com/qiniu/qmgo"
	"go.uber.org/zap"

	"github.com/vibe-c2/vibe-c2-core/core/pkg/blob"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
)

// rollbackTimeout bounds the compensating writes after a failed publish.
// They run on their own context, so they need their own deadline.
const rollbackTimeout = 10 * time.Second

// DefaultMaxSize is the cap when none is configured. A skill is prose and a
// little structure; ten megabytes is already generous, and the ceiling exists
// mainly so the zip check below can hold the whole bundle in memory.
const DefaultMaxSize = 10 << 20

// Service publishes and serves community skill bundles.
//
// The bundles are stored and returned byte for byte. The server never unpacks
// one, never reads a file out of one, and never renders any part of one in a
// page. That is the security posture in a sentence: a skill is instructions
// another operator's agent will follow, so the only safe thing to do with it
// here is move it around unchanged and be loud about who published it.
type Service struct {
	repo    repository.ISkillRepository
	subs    repository.ISkillSubscriptionRepository
	store   blob.ObjectStore
	maxSize int64
	logger  *zap.Logger
}

func NewService(repo repository.ISkillRepository, subs repository.ISkillSubscriptionRepository, store blob.ObjectStore, maxSize int64, logger *zap.Logger) *Service {
	if maxSize <= 0 {
		maxSize = DefaultMaxSize
	}
	if logger == nil {
		logger = zap.NewNop()
	}
	return &Service{repo: repo, subs: subs, store: store, maxSize: maxSize, logger: logger}
}

// MaxSize is the configured cap, exposed so handlers can reject an oversized
// body before reading all of it.
func (s *Service) MaxSize() int64 { return s.maxSize }

// PublishInput is one upload.
type PublishInput struct {
	// Name is the raw name as typed; it is normalized here.
	Name        string
	Description string
	Notes       string
	// Bytes is the complete zip. Held in memory because validating the
	// archive needs random access and the size cap keeps that bounded.
	Bytes []byte

	// PublisherID and PublisherName are the acting operator. For an agent
	// this is the key's owner, not the key: a skill an agent publishes is
	// published by the person who holds that key.
	PublisherID   uuid.UUID
	PublisherName string
	// ViaAgentKeyID records that an agent made the call. Nil for a person.
	ViaAgentKeyID *uuid.UUID
	// IsAdmin lets an administrator publish to a name they do not own, which
	// is the takeover half of being able to reassign one.
	IsAdmin bool
}

// PublishResult is what the caller tells the publisher.
type PublishResult struct {
	Skill   models.Skill
	Version models.SkillVersion
	// Claimed is true when this upload created the name rather than adding a
	// version to it. Worth saying out loud: it is the moment the publisher
	// becomes responsible for the name.
	Claimed bool
}

// Publish stores a new version of a skill, claiming the name if it is free.
func (s *Service) Publish(ctx context.Context, in PublishInput) (PublishResult, error) {
	name, err := NormalizeName(in.Name)
	if err != nil {
		return PublishResult{}, badRequest("%s", err.Error())
	}
	if err := s.validateBundle(in.Bytes); err != nil {
		return PublishResult{}, err
	}

	skill, claimed, err := s.claimOrLoad(ctx, name, in)
	if err != nil {
		return PublishResult{}, err
	}

	version, err := s.repo.ReserveNextVersion(ctx, skill.SkillID)
	if err != nil {
		return PublishResult{}, internal(err, "could not allocate a version number for %q", name)
	}

	row, err := s.storeVersion(ctx, skill, version, in)
	if err != nil {
		s.rollBackFailedPublish(ctx, skill, version, claimed)
		return PublishResult{}, err
	}

	// An omitted description means "unchanged", not "blank". Publishing a new
	// version is usually a `curl` with the name and the file, and losing the
	// listing text every time somebody does that would be a trap.
	description := TrimText(in.Description, MaxDescriptionLength)
	if description == "" {
		description = skill.Description
	}

	if err := s.repo.FinishPublish(ctx, skill.SkillID, repository.FinishPublishInput{
		Version:       version,
		SizeBytes:     row.SizeBytes,
		UploadedAt:    row.CreateAt,
		Description:   description,
		OwnerUsername: skill.OwnerUsername,
	}); err != nil {
		return PublishResult{}, internal(err, "stored the bundle but could not update %q", name)
	}

	skill.CurrentVersion = version
	skill.SizeBytes = row.SizeBytes
	skill.UploadedAt = row.CreateAt
	skill.Description = description

	return PublishResult{Skill: skill, Version: row, Claimed: claimed}, nil
}

// rollBackFailedPublish undoes as much of a failed publish as it safely can.
//
// The version number goes back so the next attempt does not leave a hole that
// makes the current version undownloadable. If this call also created the
// name, the row goes too: a first upload that never stored anything must not
// leave the name claimed. Without that, one storage outage permanently parks
// a name on an empty listing entry, and the publisher's obvious next move —
// retrying under a different name — parks another.
//
// Both steps are guarded in the repository against a publish that succeeded in
// the meantime, so a concurrent upload cannot be undone by this.
func (s *Service) rollBackFailedPublish(ctx context.Context, skill models.Skill, version int, claimed bool) {
	// Detached from the request. The failure that brings us here is usually a
	// slow one, and a slow failure is exactly when the client gives up or a
	// proxy times out — which cancels the request context. Rolling back on it
	// would then do nothing, leaving behind the very row this exists to
	// remove. Observed: an upload abandoned at the proxy left a reserved
	// version with no bundle.
	ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), rollbackTimeout)
	defer cancel()

	if err := s.repo.ReleaseVersion(ctx, skill.SkillID, version); err != nil {
		s.logger.Error("skills: could not release a reserved version after a failed publish",
			zap.String("skill", skill.Name), zap.Int("version", version), zap.Error(err))
		// The counter is still forward, so deleting the row would be refused
		// anyway. Stop here rather than guess.
		return
	}
	if !claimed {
		return
	}
	if err := s.repo.DeleteIfEmpty(ctx, skill.SkillID); err != nil && !isNotFound(err) {
		s.logger.Error("skills: could not release a claimed name after a failed publish",
			zap.String("skill", skill.Name), zap.Error(err))
	}
}

// claimOrLoad returns the skill row to publish against, creating it when the
// name is free and checking ownership when it is not.
func (s *Service) claimOrLoad(ctx context.Context, name string, in PublishInput) (models.Skill, bool, error) {
	existing, err := s.repo.FindByName(ctx, name)
	switch {
	case err == nil:
		// A row with no versions is a claim whose upload never completed.
		// Nobody has published under it, so nobody owns it: whoever gets a
		// bundle stored first takes the name. This is what makes a storage
		// outage self-correcting rather than leaving names parked forever.
		if existing.CurrentVersion < 1 {
			if existing.OwnerUserID != in.PublisherID {
				if err := s.repo.Transfer(ctx, existing.SkillID, in.PublisherID, in.PublisherName); err != nil {
					return models.Skill{}, false, internal(err, "could not claim the name %q", name)
				}
				existing.OwnerUserID = in.PublisherID
				existing.OwnerUsername = in.PublisherName
			}
			// Claimed by this call in every sense that matters to the
			// rollback: if this upload fails too, the row should go.
			return existing, true, nil
		}
		if existing.OwnerUserID != in.PublisherID && !in.IsAdmin {
			return models.Skill{}, false, forbidden(
				"%q belongs to %s. Pick a different name; only the operator who claimed a name publishes new versions of it.",
				name, existing.OwnerUsername)
		}
		if existing.IsUnpublished() {
			return models.Skill{}, false, forbidden("%q has been retired by an administrator. Ask them to restore it before publishing again.", name)
		}
		return existing, false, nil

	case isNotFound(err):
		skill := models.Skill{
			SkillID:        uuid.New(),
			Name:           name,
			Description:    TrimText(in.Description, MaxDescriptionLength),
			OwnerUserID:    in.PublisherID,
			OwnerUsername:  in.PublisherName,
			CurrentVersion: 0,
		}
		if createErr := s.repo.Create(ctx, &skill); createErr != nil {
			// Somebody claimed the same name between the lookup and the
			// insert. The unique index caught it; re-read and let the
			// ownership check above decide.
			if raced, findErr := s.repo.FindByName(ctx, name); findErr == nil {
				if raced.CurrentVersion >= 1 && raced.OwnerUserID != in.PublisherID && !in.IsAdmin {
					return models.Skill{}, false, forbidden("%q was just claimed by %s. Pick a different name.", name, raced.OwnerUsername)
				}
				return raced, false, nil
			}
			return models.Skill{}, false, internal(createErr, "could not claim the name %q", name)
		}
		return skill, true, nil

	default:
		return models.Skill{}, false, internal(err, "could not look up %q", name)
	}
}

// storeVersion writes the bytes and the version row, rolling the blob back if
// the row cannot be written. An orphaned blob is invisible and costs storage;
// a version row pointing at nothing is a download that fails for everyone.
func (s *Service) storeVersion(ctx context.Context, skill models.Skill, version int, in PublishInput) (models.SkillVersion, error) {
	key := objectKey(skill.SkillID, version)
	sum := sha256.Sum256(in.Bytes)

	if err := s.store.Put(ctx, key, bytes.NewReader(in.Bytes), int64(len(in.Bytes)), "application/zip"); err != nil {
		// Carry the object store's own words. "could not store the bundle" is
		// the same sentence for a missing bucket, a denied write and a full
		// volume, and the operator reading it is the one who has to tell them
		// apart. The caller is an authenticated operator, not the public.
		s.logger.Error("skills: storing a bundle failed",
			zap.String("skill", skill.Name), zap.String("key", key), zap.Error(err))
		return models.SkillVersion{}, internal(err, "could not store the bundle for %q", skill.Name)
	}

	row := models.SkillVersion{
		SkillVersionID: uuid.New(),
		SkillID:        skill.SkillID,
		Version:        version,
		UploadedByID:   in.PublisherID,
		UploadedByName: in.PublisherName,
		ViaAgentKeyID:  in.ViaAgentKeyID,
		ObjectKey:      key,
		SizeBytes:      int64(len(in.Bytes)),
		Checksum:       hex.EncodeToString(sum[:]),
		Notes:          TrimText(in.Notes, MaxNotesLength),
	}
	if err := s.repo.CreateVersion(ctx, &row); err != nil {
		if delErr := s.store.Delete(ctx, key); delErr != nil {
			s.logger.Error("skills: orphaned bundle left in the object store",
				zap.String("key", key), zap.Error(delErr))
		}
		return models.SkillVersion{}, internal(err, "could not record the new version of %q", skill.Name)
	}
	// qmgo stamps CreateAt during the insert; fall back rather than mirror a
	// zero time onto the skill row if that ever stops being true.
	if row.CreateAt.IsZero() {
		row.CreateAt = time.Now().UTC()
	}
	return row, nil
}

// validateBundle is the whole of the server's opinion about the contents: it
// fits, and it is a zip. Parsing the central directory does not extract
// anything, so there is no archive to traverse out of and no bomb to inflate.
func (s *Service) validateBundle(raw []byte) error {
	if len(raw) == 0 {
		return badRequest("the uploaded file is empty")
	}
	if int64(len(raw)) > s.maxSize {
		return tooLarge("the bundle is %d bytes; the limit is %d", len(raw), s.maxSize)
	}
	if _, err := zip.NewReader(bytes.NewReader(raw), int64(len(raw))); err != nil {
		return badRequest("that is not a readable zip archive: %s. A skill is uploaded as a zip of the skill directory.", err.Error())
	}
	return nil
}

// Download resolves a name and optional version to the stored bytes. Version
// zero means whatever is current.
func (s *Service) Download(ctx context.Context, name string, version int) (io.ReadCloser, models.Skill, models.SkillVersion, error) {
	skill, err := s.Lookup(ctx, name)
	if err != nil {
		return nil, models.Skill{}, models.SkillVersion{}, err
	}
	if version <= 0 {
		version = skill.CurrentVersion
	}
	row, err := s.repo.FindVersion(ctx, skill.SkillID, version)
	if err != nil {
		if isNotFound(err) {
			return nil, models.Skill{}, models.SkillVersion{}, notFound("%q has no version %d; the current one is %d.", skill.Name, version, skill.CurrentVersion)
		}
		return nil, models.Skill{}, models.SkillVersion{}, internal(err, "could not look up version %d of %q", version, skill.Name)
	}

	body, _, err := s.store.Get(ctx, row.ObjectKey)
	if err != nil {
		return nil, models.Skill{}, models.SkillVersion{}, internal(err, "could not read the stored bundle for %q", skill.Name)
	}
	return body, skill, row, nil
}

// Lookup resolves a name to a published skill.
func (s *Service) Lookup(ctx context.Context, name string) (models.Skill, error) {
	normalized, err := NormalizeName(name)
	if err != nil {
		return models.Skill{}, notFound("there is no skill called %q.", name)
	}
	skill, err := s.repo.FindByName(ctx, normalized)
	if err != nil {
		if isNotFound(err) {
			return models.Skill{}, notFound("there is no skill called %q.", normalized)
		}
		return models.Skill{}, internal(err, "could not look up %q", normalized)
	}
	if skill.IsUnpublished() {
		return models.Skill{}, notFound("%q has been retired.", normalized)
	}
	if skill.CurrentVersion < 1 {
		// The name exists because a publish started and never stored a
		// bundle. Saying "no version 0" would be true and useless.
		return models.Skill{}, notFound("nothing has been published under %q yet. The name is free to claim.", normalized)
	}
	return skill, nil
}

// List returns the published skills, newest upload first.
func (s *Service) List(ctx context.Context) ([]models.Skill, error) {
	out, err := s.repo.List(ctx, false)
	if err != nil {
		return nil, internal(err, "could not list skills")
	}
	return out, nil
}

// Versions returns a skill's history, newest first.
func (s *Service) Versions(ctx context.Context, skillID uuid.UUID) ([]models.SkillVersion, error) {
	out, err := s.repo.ListVersions(ctx, skillID)
	if err != nil {
		return nil, internal(err, "could not list versions")
	}
	return out, nil
}

// RecordDownload notes that an operator now holds this version. Best effort:
// the bytes are already on their way, and failing the request after that would
// be worse than losing one update prompt.
func (s *Service) RecordDownload(ctx context.Context, userID, skillID uuid.UUID, version int) {
	if s.subs == nil || userID == uuid.Nil {
		return
	}
	if err := s.subs.RecordDownload(ctx, userID, skillID, version, time.Now().UTC()); err != nil {
		s.logger.Warn("skills: could not record a download",
			zap.String("skill_id", skillID.String()), zap.Error(err))
	}
}

// Subscriptions returns one operator's download and snooze state, keyed by
// skill id, for decorating a listing.
func (s *Service) Subscriptions(ctx context.Context, userID uuid.UUID) (map[uuid.UUID]models.SkillSubscription, error) {
	rows, err := s.subs.FindByUser(ctx, userID)
	if err != nil {
		return nil, internal(err, "could not read your skill subscriptions")
	}
	out := make(map[uuid.UUID]models.SkillSubscription, len(rows))
	for _, row := range rows {
		out[row.SkillID] = row
	}
	return out, nil
}

// Filename is what a download should be saved as.
func Filename(name string, version int) string {
	return fmt.Sprintf("%s-skill-v%d.zip", name, version)
}

func objectKey(skillID uuid.UUID, version int) string {
	return fmt.Sprintf("skills/%s/%d.zip", skillID, version)
}

func isNotFound(err error) bool {
	return errors.Is(err, qmgo.ErrNoSuchDocuments)
}
