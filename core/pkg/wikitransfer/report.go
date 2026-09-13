package wikitransfer

import "github.com/google/uuid"

// SkipRecord names one page (or chip) the pipeline could not carry across,
// and why. Path is a slash-joined title trail so a reader can find it.
type SkipRecord struct {
	Path   string `json:"path"`
	Reason string `json:"reason"`
}

// ImportReport summarises one materialisation. Returned to the caller and
// stored on the transfer job.
type ImportReport struct {
	BundleID uuid.UUID `json:"bundleId"`
	// TargetParentID is the document the imported roots were placed under;
	// nil means the operation root.
	TargetParentID *uuid.UUID `json:"targetParentId,omitempty"`
	// RootIDs are the created top-level pages, in order.
	RootIDs []uuid.UUID `json:"rootIds"`

	TotalDocs   int `json:"totalDocs"`
	CreatedDocs int `json:"createdDocs"`
	SkippedDocs int `json:"skippedDocs"`

	ImagesIngested int `json:"imagesIngested"`
	FilesIngested  int `json:"filesIngested"`

	CredentialsReused     int `json:"credentialsReused"`
	CredentialsCreated    int `json:"credentialsCreated"`
	CredentialsTombstoned int `json:"credentialsTombstoned"`
	CredentialsSkipped    int `json:"credentialsSkipped"`

	// ChipsRemapped counts id attributes rewritten to target ids;
	// ChipsDropped counts chips lowered to plain text because nothing on
	// the target corresponds to them.
	ChipsRemapped int `json:"chipsRemapped"`
	ChipsDropped  int `json:"chipsDropped"`

	Skipped  []SkipRecord `json:"skipped,omitempty"`
	Warnings []SkipRecord `json:"warnings,omitempty"`
}

func (r *ImportReport) skip(path, reason string) {
	r.SkippedDocs++
	r.Skipped = append(r.Skipped, SkipRecord{Path: path, Reason: reason})
}

func (r *ImportReport) warn(path, reason string) {
	r.Warnings = append(r.Warnings, SkipRecord{Path: path, Reason: reason})
}

// ExportReport summarises one export run, whichever format produced it.
// Written into the archive as REPORT.json and stored on the job.
type ExportReport struct {
	BundleID  uuid.UUID `json:"bundleId"`
	Format    string    `json:"format"`
	Scope     string    `json:"scope"` // "tree" or "subtree"
	RootTitle string    `json:"rootTitle"`

	TotalDocs    int `json:"totalDocs"`
	ExportedDocs int `json:"exportedDocs"`
	SkippedDocs  int `json:"skippedDocs"`

	ImagesExported int `json:"imagesExported"`
	FilesExported  int `json:"filesExported"`

	CredentialsExported   int `json:"credentialsExported"`
	CredentialsTombstoned int `json:"credentialsTombstoned"`

	Skipped  []SkipRecord `json:"skipped,omitempty"`
	Warnings []SkipRecord `json:"warnings,omitempty"`
}

// Skip records a page that did not make it into the archive.
func (r *ExportReport) Skip(path, reason string) {
	r.SkippedDocs++
	r.Skipped = append(r.Skipped, SkipRecord{Path: path, Reason: reason})
}

// Warn records a non-fatal problem with a page that was still exported.
func (r *ExportReport) Warn(path, reason string) {
	r.Warnings = append(r.Warnings, SkipRecord{Path: path, Reason: reason})
}
