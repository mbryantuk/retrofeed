/**
 * Utility functions for Retrofeed
 */

/**
 * Sanitizes a string to be a valid feature phone filename.
 * Constraints:
 * - Max 255 characters (leaving room for .mp3 extension, so max 250)
 * - Alphanumeric + underscores + hyphens + spaces (if allowed)
 * - No emojis or weird special characters
 * 
 * @param {string} name - The original filename or title
 * @param {boolean} preserveSpaces - If true, keeps spaces instead of making them underscores
 * @returns {string} The sanitized filename
 */
export function sanitizeFilename(name, preserveSpaces = false) {
    if (!name) return 'unknown_audio';

    let sanitized = name;
    
    if (preserveSpaces) {
        // Keep spaces, alphanumeric, hyphens, and underscores. Replace others with empty string or space.
        sanitized = sanitized.replace(/[^a-zA-Z0-9 _-]/g, '');
        // Collapse multiple spaces
        sanitized = sanitized.replace(/\s+/g, ' ');
    } else {
        // Replace spaces and invalid characters with underscores
        sanitized = sanitized.replace(/[^a-zA-Z0-9_-]/g, '_');
        // Remove consecutive underscores
        sanitized = sanitized.replace(/_+/g, '_');
    }

    // Trim leading/trailing whitespace/underscores/hyphens
    sanitized = sanitized.replace(/^[\s_-]+|[\s_-]+$/g, '');

    if (!sanitized) return 'audio';

    // Truncate to leave room for '.mp3' (255 - 4 = 251, let's use 240 to be safe)
    if (sanitized.length > 240) {
        sanitized = sanitized.substring(0, 240);
    }

    return sanitized;
}

/**
 * Generates a filename based on a template and episode metadata.
 * Variables supported: {YYYY}, {MM}, {DD}, {SHOW}, {TITLE}
 * 
 * @param {string} template e.g., "{YYYY}{MM}{DD} - {SHOW} - {TITLE}"
 * @param {Object} metadata { pubDate: "string", showTitle: "string", epTitle: "string" }
 * @returns {string} Fully formatted and sanitized filename
 */
export function generateFormattedFilename(template, metadata) {
    let filename = template;
    let d = new Date();
    
    if (metadata.pubDate) {
        const parsed = new Date(metadata.pubDate);
        if (!isNaN(parsed)) d = parsed;
    }

    const yyyy = d.getFullYear().toString();
    const mm = (d.getMonth() + 1).toString().padStart(2, '0');
    const dd = d.getDate().toString().padStart(2, '0');
    
    const show = sanitizeFilename(metadata.showTitle || 'Unknown Show', true);
    const title = sanitizeFilename(metadata.epTitle || 'Unknown Title', true);

    filename = filename.replace(/{YYYY}/g, yyyy);
    filename = filename.replace(/{MM}/g, mm);
    filename = filename.replace(/{DD}/g, dd);
    filename = filename.replace(/{SHOW}/g, show);
    filename = filename.replace(/{TITLE}/g, title);

    // Final sanitization of the compiled template (allowing spaces)
    return sanitizeFilename(filename, true);
}

/**
 * Returns the first meaningful initial of a podcast title,
 * skipping "The " at the beginning.
 * 
 * @param {string} title - The podcast title
 * @returns {string} The first letter
 */
export function getPodcastInitial(title) {
    if (!title) return 'P';
    const cleaned = title.trim().replace(/^the\s+/i, '');
    return (cleaned.charAt(0) || 'P').toUpperCase();
}
