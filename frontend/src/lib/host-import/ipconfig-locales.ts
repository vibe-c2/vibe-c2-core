// Windows ipconfig localization tables. Microsoft ships ipconfig output via
// fixed per-language resource strings, so each display language is a known,
// finite vocabulary — not free text. Mapping localized field labels back to
// canonical English keys lets the single parser in ipconfig.ts handle any
// language WITHOUT guessing a value's meaning from its shape: Default Gateway,
// DHCP Server and DNS Servers are all bare IPv4 addresses, indistinguishable
// without the key. The key is the only reliable signal, so we translate it.
//
// To add a language: capture `ipconfig /all` on that display language and add
// its lowercased field labels here. Lookups are exact (after lowercasing and
// whitespace collapse), so script differences (Cyrillic vs Latin) keep the one
// merged map collision-free. If two Latin locales ever assign the same phrase
// different meanings, this is the seam to split into per-locale detection.

// Localized field-label (lowercased, whitespace-collapsed, leader/colon already
// stripped) → canonical key. Only labels the parser acts on are listed; every
// other label falls through as noise, exactly as in English. Canonical keys
// match what parseIpconfig switches on, including the `endsWith` families
// ("... ipv4 address", "... ipv6 address").
export const IPCONFIG_KEY_ALIASES: Record<string, string> = {
  // --- Russian (ru-RU) ---
  "имя компьютера": "host name",
  "описание": "description",
  "физический адрес": "physical address",
  "состояние среды": "media state",
  "ipv4-адрес": "ipv4 address",
  "автонастройка ipv4-адрес": "autoconfiguration ipv4 address",
  "ipv6-адрес": "ipv6 address",
  "временный ipv6-адрес": "temporary ipv6 address",
  "локальный ipv6-адрес канала": "link-local ipv6 address",
  "маска подсети": "subnet mask",
  "основной шлюз": "default gateway",
  "dns-серверы": "dns servers",
}

// The localized words that head an adapter section ("Ethernet adapter X:",
// "Адаптер Ethernet X:"). Used to locate the section name and detect tunnel
// sections; matched as lowercased substrings (not \b regex, which is ASCII-only
// and would not bound Cyrillic). Order-independent: the keyword may lead the
// line (Russian) or follow the type (English).
export const ADAPTER_KEYWORDS = ["adapter", "адаптер"]

// Substrings (lowercased) marking a tunnel section — Teredo/ISATAP/6to4, no
// pivot value. Recognized but never imported, like a loopback interface.
export const TUNNEL_KEYWORDS = ["tunnel", "туннельн"]

// Substrings (lowercased) of a "Media disconnected" value in any supported
// language — the adapter is down and is dropped like a DOWN `ip a` interface.
export const MEDIA_DISCONNECTED_KEYWORDS = ["disconnected", "недоступ", "отключ"]
