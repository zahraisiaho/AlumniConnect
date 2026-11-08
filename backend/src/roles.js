// Role is decided from graduation year: graduated before this calendar year means alumnus, otherwise student.
// Admins are never inferred; callers must not pass an admin through this.
export const roleFor = (gradYear, now = new Date()) => (Number(gradYear) < now.getFullYear() ? 'alumnus' : 'student')
