// Same rule as the server (backend/src/roles.js): graduated before this calendar year means alumnus.
// A blank year counts as student so alumni-only fields stay hidden until a year is entered.
export const roleFor = (gradYear) => (gradYear && Number(gradYear) < new Date().getFullYear() ? 'alumnus' : 'student')
