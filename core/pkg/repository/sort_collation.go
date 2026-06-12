package repository

import "go.mongodb.org/mongo-driver/mongo/options"

// caseInsensitiveSortCollation is applied to string-sorted list queries so
// values order case-insensitively (strength 2 = compare letters and accents,
// ignore case). Without it Mongo sorts by byte value and every uppercase value
// lands before every lowercase one. The same collation is baked into the
// supporting indexes in each repository, and — because the collation applies
// to the whole query — the keyset cursor comparisons stay consistent with the
// sort order.
var caseInsensitiveSortCollation = &options.Collation{Locale: "en", Strength: 2}
