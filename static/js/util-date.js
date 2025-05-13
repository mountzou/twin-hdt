// Add to static/js/util-date.js or include in a utility file

/**
 * Formats a date string into a display-friendly format
 * @param {string} dateString - ISO date string
 * @returns {string} Formatted date string (DD-MM HH:MM)
 */
function formatDate(dateString) {
    const date = new Date(dateString);
    return `${date.getDate().toString().padStart(2, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}