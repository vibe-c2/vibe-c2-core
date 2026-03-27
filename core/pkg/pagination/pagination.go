package pagination

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/v2/bson"
)

// PageInfo contains pagination metadata following the Relay Connection spec.
// Mapped directly to the GraphQL PageInfo type via gqlgen.yml.
type PageInfo struct {
	HasNextPage     bool    `json:"hasNextPage"`
	HasPreviousPage bool    `json:"hasPreviousPage"`
	StartCursor     *string `json:"startCursor"`
	EndCursor       *string `json:"endCursor"`
}

// Cursor represents a position in a paginated list.
// It encodes the sort field (CreateAt) and a tiebreaker (_id) to handle
// documents with identical timestamps.
type Cursor struct {
	CreateAt time.Time          `json:"c"`
	ID       primitive.ObjectID `json:"i"`
}

// EncodeCursor serializes a cursor to an opaque base64url string.
func EncodeCursor(createAt time.Time, id primitive.ObjectID) string {
	c := Cursor{CreateAt: createAt, ID: id}
	data, _ := json.Marshal(c)
	return base64.RawURLEncoding.EncodeToString(data)
}

// DecodeCursor deserializes a cursor string back into its components.
func DecodeCursor(s string) (Cursor, error) {
	data, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return Cursor{}, fmt.Errorf("invalid cursor: %w", err)
	}
	var c Cursor
	if err := json.Unmarshal(data, &c); err != nil {
		return Cursor{}, fmt.Errorf("invalid cursor: %w", err)
	}
	return c, nil
}

// Args holds the normalized pagination arguments parsed from GraphQL input.
type Args struct {
	Limit   int64
	Cursor  *Cursor
	Forward bool // true = first/after (descending), false = last/before (ascending)
}

// ParseArgs validates and normalizes Relay connection arguments.
// Only one direction (first/after or last/before) may be used at a time.
func ParseArgs(first *int, after *string, last *int, before *string) (Args, error) {
	if first != nil && last != nil {
		return Args{}, fmt.Errorf("cannot use both 'first' and 'last'")
	}

	args := Args{Forward: true, Limit: 20}

	if last != nil {
		args.Forward = false
		if *last <= 0 {
			return Args{}, fmt.Errorf("'last' must be positive")
		}
		args.Limit = int64(*last)
	}

	if first != nil {
		if *first <= 0 {
			return Args{}, fmt.Errorf("'first' must be positive")
		}
		args.Limit = int64(*first)
	}

	// Parse the cursor for the active direction.
	cursorStr := after
	if !args.Forward {
		cursorStr = before
	}
	if cursorStr != nil {
		c, err := DecodeCursor(*cursorStr)
		if err != nil {
			return Args{}, err
		}
		args.Cursor = &c
	}

	return args, nil
}

// BuildCursorFilter returns a MongoDB filter that selects documents
// after (or before) the given cursor position.
//
// For forward pagination (descending createAt, descending _id):
//
//	{$or: [{createAt: {$lt: t}}, {createAt: t, _id: {$lt: id}}]}
//
// For backward pagination (ascending createAt, ascending _id):
//
//	{$or: [{createAt: {$gt: t}}, {createAt: t, _id: {$gt: id}}]}
func BuildCursorFilter(cursor *Cursor, forward bool) bson.M {
	if cursor == nil {
		return bson.M{}
	}

	op := "$lt"
	if !forward {
		op = "$gt"
	}

	return bson.M{"$or": bson.A{
		bson.M{"createAt": bson.M{op: cursor.CreateAt}},
		bson.M{
			"createAt": cursor.CreateAt,
			"_id":      bson.M{op: cursor.ID},
		},
	}}
}

// SortFields returns the MongoDB sort fields for the given direction.
func SortFields(forward bool) []string {
	if forward {
		return []string{"-createAt", "-_id"}
	}
	return []string{"createAt", "_id"}
}
