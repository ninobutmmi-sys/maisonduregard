// ============================================
// La Maison du Regard — ICS Calendar Generator
// ============================================

const config = require('../config/env');

/**
 * Generate an ICS calendar file content for a booking
 * @param {object} booking - Booking details
 * @param {string} booking.id - Booking UUID
 * @param {string} booking.date - Date (YYYY-MM-DD)
 * @param {string} booking.start_time - Start time (HH:MM)
 * @param {string} booking.end_time - End time (HH:MM)
 * @param {string} booking.service_name - Service name
 * @returns {string} ICS file content
 */
function generateICS(booking) {
  const startDate = formatICSDate(booking.date, booking.start_time);
  const endDate = formatICSDate(booking.date, booking.end_time);
  const now = formatICSDateNow();
  const uid = `${booking.id}@lamaisonduregard.fr`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LaMaisonDuRegard//Booking//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${startDate}`,
    `DTEND:${endDate}`,
    `SUMMARY:${booking.service_name} - ${config.salon.name}`,
    `DESCRIPTION:${booking.service_name}\\n${config.salon.name}`,
    `LOCATION:${config.salon.address}`,
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'TRIGGER:-PT1H',
    'ACTION:DISPLAY',
    'DESCRIPTION:RDV La Maison du Regard dans 1 heure',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

/**
 * Format date + time to ICS format (YYYYMMDDTHHMMSS)
 * Assumes Europe/Paris timezone
 */
function formatICSDate(date, time) {
  const [year, month, day] = date.split('-');
  const [hour, minute] = time.split(':');
  return `${year}${month}${day}T${hour}${minute}00`;
}

function formatICSDateNow() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}T${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

module.exports = { generateICS };
