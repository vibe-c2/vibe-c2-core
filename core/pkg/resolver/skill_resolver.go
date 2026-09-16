package resolver

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/vibe-c2/vibe-c2-core/core/pkg/auth/permissions"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/model"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/skills"
)

// ISkillResolver is the read and small-mutation surface for community skills.
// Publishing and downloading are not here: both move a zip, and both are REST.
type ISkillResolver interface {
	Registry(ctx context.Context) (*model.SkillRegistry, error)
	Versions(ctx context.Context, name string) ([]*model.SkillVersion, error)
	Snooze(ctx context.Context, name string, version int) (*model.Skill, error)
	SetUnpublished(ctx context.Context, name string, unpublished bool) (*model.Skill, error)
	Transfer(ctx context.Context, name string, userID string) (*model.Skill, error)
}

type skillResolver struct {
	svc      *skills.Service
	repo     repository.ISkillRepository
	subs     repository.ISkillSubscriptionRepository
	userRepo repository.IUserRepository
}

func NewSkillResolver(
	svc *skills.Service,
	repo repository.ISkillRepository,
	subs repository.ISkillSubscriptionRepository,
	userRepo repository.IUserRepository,
) ISkillResolver {
	return &skillResolver{svc: svc, repo: repo, subs: subs, userRepo: userRepo}
}

// Registry lists the published skills, decorated with what the caller has
// already downloaded and dismissed. One query rather than a field resolver per
// row: the subscription rows for one operator are a single small read, and a
// per-row lookup would be an N+1 on the page everybody opens.
func (r *skillResolver) Registry(ctx context.Context) (*model.SkillRegistry, error) {
	viewer, err := callerID(ctx)
	if err != nil {
		return nil, err
	}

	published, err := r.svc.List(ctx)
	if err != nil {
		return nil, err
	}
	subscriptions, err := r.svc.Subscriptions(ctx, viewer)
	if err != nil {
		return nil, err
	}

	out := make([]*model.Skill, 0, len(published))
	for _, skill := range published {
		sub, hasSub := subscriptions[skill.SkillID]
		out = append(out, toSkillModel(skill, viewer, sub, hasSub))
	}

	return &model.SkillRegistry{
		Skills:         out,
		MaxUploadBytes: int(r.svc.MaxSize()),
	}, nil
}

func (r *skillResolver) Versions(ctx context.Context, name string) ([]*model.SkillVersion, error) {
	skill, err := r.svc.Lookup(ctx, name)
	if err != nil {
		return nil, err
	}
	history, err := r.svc.Versions(ctx, skill.SkillID)
	if err != nil {
		return nil, err
	}

	out := make([]*model.SkillVersion, 0, len(history))
	for _, row := range history {
		out = append(out, &model.SkillVersion{
			Version:            row.Version,
			UploadedAt:         row.CreateAt.UTC().Format(time.RFC3339),
			UploadedByUsername: row.UploadedByName,
			SizeBytes:          int(row.SizeBytes),
			Notes:              row.Notes,
			ViaAgent:           row.ViaAgentKeyID != nil,
		})
	}
	return out, nil
}

// Snooze hides the update prompt for this skill until something newer than
// the given version is published.
func (r *skillResolver) Snooze(ctx context.Context, name string, version int) (*model.Skill, error) {
	viewer, err := callerID(ctx)
	if err != nil {
		return nil, err
	}
	skill, err := r.svc.Lookup(ctx, name)
	if err != nil {
		return nil, err
	}
	// Nobody has seen a version that does not exist, so a snooze cannot reach
	// past the current one and silence future prompts in advance.
	if version < 1 || version > skill.CurrentVersion {
		return nil, fmt.Errorf("%q has no version %d (current is %d)", skill.Name, version, skill.CurrentVersion)
	}
	if err := r.subs.Snooze(ctx, viewer, skill.SkillID, version); err != nil {
		return nil, fmt.Errorf("failed to snooze the update prompt: %w", err)
	}
	return r.reload(ctx, skill.Name, viewer)
}

// SetUnpublished retires or restores a skill. The author or an administrator
// may do it; the schema directive can only check that somebody is signed in,
// so the "mine or admin" half is enforced here.
func (r *skillResolver) SetUnpublished(ctx context.Context, name string, unpublished bool) (*model.Skill, error) {
	viewer, err := callerID(ctx)
	if err != nil {
		return nil, err
	}
	// A retired skill is invisible to Lookup, so restoring one has to read
	// through the repository rather than the service.
	normalized, err := skills.NormalizeName(name)
	if err != nil {
		return nil, fmt.Errorf("there is no skill called %q", name)
	}
	skill, err := r.repo.FindByName(ctx, normalized)
	if err != nil {
		return nil, fmt.Errorf("there is no skill called %q", normalized)
	}
	if skill.OwnerUserID != viewer && !callerIsAdmin(ctx) {
		return nil, fmt.Errorf("%q belongs to %s", skill.Name, skill.OwnerUsername)
	}

	var at *time.Time
	var by *uuid.UUID
	if unpublished {
		now := time.Now().UTC()
		at, by = &now, &viewer
	}
	if err := r.repo.SetUnpublished(ctx, skill.SkillID, at, by); err != nil {
		return nil, fmt.Errorf("failed to update %q: %w", skill.Name, err)
	}

	updated, err := r.repo.FindByName(ctx, normalized)
	if err != nil {
		return nil, fmt.Errorf("failed to re-read %q: %w", normalized, err)
	}
	sub, hasSub := r.subscription(ctx, viewer, updated.SkillID)
	return toSkillModel(updated, viewer, sub, hasSub), nil
}

// Transfer hands a claimed name to another operator.
func (r *skillResolver) Transfer(ctx context.Context, name string, userID string) (*model.Skill, error) {
	viewer, err := callerID(ctx)
	if err != nil {
		return nil, err
	}
	newOwnerID, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user id: %w", err)
	}
	newOwner, err := r.userRepo.FindByID(ctx, newOwnerID)
	if err != nil {
		return nil, fmt.Errorf("no such user: %w", err)
	}
	skill, err := r.svc.Lookup(ctx, name)
	if err != nil {
		return nil, err
	}
	if err := r.repo.Transfer(ctx, skill.SkillID, newOwnerID, newOwner.Username); err != nil {
		return nil, fmt.Errorf("failed to transfer %q: %w", skill.Name, err)
	}
	return r.reload(ctx, skill.Name, viewer)
}

func (r *skillResolver) reload(ctx context.Context, name string, viewer uuid.UUID) (*model.Skill, error) {
	skill, err := r.svc.Lookup(ctx, name)
	if err != nil {
		return nil, err
	}
	sub, hasSub := r.subscription(ctx, viewer, skill.SkillID)
	return toSkillModel(skill, viewer, sub, hasSub), nil
}

// subscription reads one row, treating a missing one as "never downloaded"
// rather than an error: that is the normal state for most skills.
func (r *skillResolver) subscription(ctx context.Context, viewer, skillID uuid.UUID) (models.SkillSubscription, bool) {
	sub, err := r.subs.Find(ctx, viewer, skillID)
	if err != nil {
		return models.SkillSubscription{}, false
	}
	return sub, true
}

func toSkillModel(skill models.Skill, viewer uuid.UUID, sub models.SkillSubscription, hasSub bool) *model.Skill {
	out := &model.Skill{
		ID:             skill.SkillID.String(),
		Name:           skill.Name,
		Description:    skill.Description,
		OwnerUserID:    skill.OwnerUserID.String(),
		OwnerUsername:  skill.OwnerUsername,
		CurrentVersion: skill.CurrentVersion,
		UpdatedAt:      skill.UploadedAt.UTC().Format(time.RFC3339),
		SizeBytes:      int(skill.SizeBytes),
		Mine:           skill.OwnerUserID == viewer,
		DownloadURL:    "/api/v1/skills/" + skill.Name + "/download",
	}
	if hasSub && sub.DownloadedVersion > 0 {
		downloaded := sub.DownloadedVersion
		at := sub.DownloadedAt.UTC().Format(time.RFC3339)
		out.DownloadedVersion = &downloaded
		out.DownloadedAt = &at
	}
	if hasSub && sub.SnoozedVersion > 0 {
		snoozed := sub.SnoozedVersion
		out.SnoozedVersion = &snoozed
	}
	return out
}

func callerID(ctx context.Context) (uuid.UUID, error) {
	id, err := uuid.Parse(gqlctx.AuthFromContext(ctx).UserID)
	if err != nil {
		return uuid.Nil, fmt.Errorf("invalid user ID in token: %w", err)
	}
	return id, nil
}

func callerIsAdmin(ctx context.Context) bool {
	return permissions.HasPermissionForRoles(gqlctx.AuthFromContext(ctx).Roles, permissions.AdminPermission)
}
