// Turns whatever a customer types into one standard form, so
// "0612345678", "+212 612-345-678" and "212612345678" are the same person.
// Returns digits only in international format (e.g. "212612345678"),
// or null if it doesn't look like a real phone number.
function normalizePhone(input) {
  let d = String(input || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);                 // 00212... -> 212...
  if (d.length === 10 && d.startsWith('0')) d = '212' + d.slice(1); // 06XXXXXXXX -> 2126XXXXXXXX
  else if (d.length === 9 && /^[5-8]/.test(d)) d = '212' + d;       // 6XXXXXXXX  -> 2126XXXXXXXX
  if (d.length < 8 || d.length > 15) return null;
  return d;
}

module.exports = { normalizePhone };
