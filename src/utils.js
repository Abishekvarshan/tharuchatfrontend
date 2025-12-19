// utils.js
// Generate a deterministic daily room ID based on secret + date

export function getDailyRoomID() {
    const secretWord = 'ourSecret123'; // Only you two know this
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const text = secretWord + today;

    // Simple hash function to convert string to short ID
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
        hash = (hash << 5) - hash + text.charCodeAt(i);
        hash = hash & hash; // Convert to 32-bit integer
    }
    // Convert to positive number + string
    return 'room-' + Math.abs(hash);
}
