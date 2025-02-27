class InMemorySessionStore {
  constructor() {
    this.sessions = new Map(); // Store sessions in memory
  }

  // Save a session
  saveSession(sessionID, data) {
    this.sessions.set(sessionID, data);
  }

  // Find a session by ID
  findSession(sessionID) {
    return this.sessions.get(sessionID);
  }

  // Set session data (alias for saveSession)
  set(sessionID, data) {
    this.saveSession(sessionID, data);
  }

  // Get session data (alias for findSession)
  get(sessionID) {
    return this.findSession(sessionID);
  }

  // Delete a session
  deleteSession(sessionID) {
    this.sessions.delete(sessionID);
  }

  // Get all sessions (optional, for debugging)
  getAllSessions() {
    return Array.from(this.sessions.entries());
  }
}

module.exports = { InMemorySessionStore };

