package repository

import (
	"errors"
	"fmt"
	"testing"

	"github.com/qiniu/qmgo"
	"go.mongodb.org/mongo-driver/mongo"
)

func TestIsNotFound(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want bool
	}{
		{"nil is not a miss", nil, false},
		{"own sentinel", ErrNotFound, true},
		{"own sentinel wrapped", fmt.Errorf("load user: %w", ErrNotFound), true},
		{"qmgo miss", qmgo.ErrNoSuchDocuments, true},
		{"qmgo miss wrapped", fmt.Errorf("find by id: %w", qmgo.ErrNoSuchDocuments), true},
		{"raw driver miss", mongo.ErrNoDocuments, true},
		{"raw driver miss wrapped", fmt.Errorf("find: %w", mongo.ErrNoDocuments), true},
		// The whole point: a failure to answer must not read as an empty answer.
		{"timeout is not a miss", errors.New("context deadline exceeded"), false},
		{"connection error is not a miss", errors.New("server selection error"), false},
		{"decode error is not a miss", errors.New("cannot decode"), false},
		{"other repository sentinel", ErrLastAdmin, false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := IsNotFound(tc.err); got != tc.want {
				t.Errorf("IsNotFound(%v) = %v, want %v", tc.err, got, tc.want)
			}
		})
	}
}
