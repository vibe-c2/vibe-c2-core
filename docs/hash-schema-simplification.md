# Hash schema simplification

The Hash entity was trimmed to: `value`, `status`, `comment`, `tags`,
`credentialId`. Dropped fields: `hashType`, `hashcatMode`, `username`,
`domain`, `source`, `properties`, threaded `comments`, `crackingMeta`.

## Mongo migration

Run once against the `hashes` collection. Existing rows lose the dropped
fields and gain an empty `comment`.

```js
db.hashes.updateMany({}, {
  $unset: {
    hash_type: "",
    hashcat_mode: "",
    username: "",
    domain: "",
    source: "",
    properties: "",
    comments: "",
    cracking_meta: ""
  },
  $set: { comment: "" }
})

// Drop the index that backed the removed `hash_type` filter. The other
// hash indexes are still in use.
db.hashes.dropIndex("operation_id_1_hash_type_1")
```

The unique `operation_id + value` index, the `operation_id + status` index,
the `operation_id + credential_id` index, the `operation_id + tags` index,
and the pagination index are unchanged.

## Behaviour changes

- Threaded hash comments are gone. The single `comment` string replaces them.
  Historical threads are discarded by the migration above.
- `markHashCracked` no longer accepts `plaintext`, `tool`, `wordlist`,
  `rules`, or `durationSec`. It only links a credential and sets status to
  `CRACKED`.
- `bulkImportHashes` accepts plain text only (one hash per line) plus tags.
  The `secretsdump` and `pwdump` parsers were removed.
- `updateHash`'s `credentialId` field accepts the empty string `""` to clear
  the link; omitting the field leaves it unchanged.
