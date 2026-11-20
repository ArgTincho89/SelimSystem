// Display format of every date the server writes into user-facing text (alert messages, validation errors and
// activity-log descriptions): "DD-MM-AAAA", e.g. "20-11-2026". Stored data and API date fields stay ISO "YYYY-MM-DD".

// "YYYY-MM-DD" (or the date part of an ISO timestamp) -> "DD-MM-AAAA"; '' when the value is empty or not a date.
function formatDisplayDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(String(value == null ? '' : value).trim());
  return match ? `${match[3]}-${match[2]}-${match[1]}` : '';
}

module.exports = { formatDisplayDate };
