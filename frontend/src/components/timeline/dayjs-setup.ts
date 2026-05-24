import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"
import timezonePlugin from "dayjs/plugin/timezone"
import utc from "dayjs/plugin/utc"

// dayjs.extend is idempotent but every timeline file calling extend(...)
// at import time duplicates the boilerplate and reads like setup leakage.
// Centralise it here and have every timeline module import dayjs through
// this file so the plugin set is registered once, in one place.
dayjs.extend(utc)
dayjs.extend(timezonePlugin)
dayjs.extend(relativeTime)

export { dayjs }
