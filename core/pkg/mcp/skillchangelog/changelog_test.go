package skillchangelog

import (
	"reflect"
	"testing"
)

func TestValidate(t *testing.T) {
	if err := Validate(); err != nil {
		t.Fatal(err)
	}
}

func TestCurrentIsLast(t *testing.T) {
	all := Releases()
	if got, want := Current(), all[len(all)-1].Version; got != want {
		t.Fatalf("Current() = %d, want %d", got, want)
	}
}

func TestSince(t *testing.T) {
	cur := Current()
	tests := []struct {
		name string
		v    int
		want int
	}{
		{"never downloaded sees everything", 0, cur},
		{"negative sees everything", -1, cur},
		{"current sees nothing", cur, 0},
		{"ahead sees nothing", cur + 5, 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := len(Since(tt.v)); got != tt.want {
				t.Fatalf("len(Since(%d)) = %d, want %d", tt.v, got, tt.want)
			}
		})
	}
	// Ascending, and every entry newer than the cut.
	if cur > 1 {
		got := Since(1)
		for i, r := range got {
			if r.Version <= 1 {
				t.Fatalf("Since(1) returned version %d", r.Version)
			}
			if i > 0 && got[i-1].Version >= r.Version {
				t.Fatalf("Since(1) is not ascending: %v", got)
			}
		}
	}
}

func TestReleasesIsACopy(t *testing.T) {
	a := Releases()
	a[0].Notes = nil
	if reflect.DeepEqual(a[0], Releases()[0]) {
		t.Fatal("mutating the returned slice changed the package state")
	}
}
