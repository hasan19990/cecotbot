const fs = require('fs').promises;
const config = require('./config');

class Store {
  constructor(filePath) {
    this.filePath = filePath || config.verification.dataFile;
    this.data = {
      users: {}, // discordId: { robloxUsername, robloxId, verifiedAt }
      pendingVerifications: {} // discordId: { code, createdAt }
    };
  }

  /**
   * Load data from the JSON file
   */
  async load() {
    try {
      const fileContent = await fs.readFile(this.filePath, 'utf8');
      this.data = { ...this.data, ...JSON.parse(fileContent) };
    } catch (error) {
      // If file doesn't exist or is invalid, use default data
      console.log('No existing data file found, using defaults');
      await this.save(); // Create the file with default data
    }
  }

  /**
   * Save data to the JSON file
   */
  async save() {
    try {
      await fs.writeFile(this.filePath, JSON.stringify(this.data, null, 2));
    } catch (error) {
      console.error('Error saving data:', error);
    }
  }

  /**
   * Get user data by Discord ID
   */
  getUser(discordId) {
    return this.data.users[discordId];
  }

  /**
   * Set user data
   */
  setUser(discordId, userData) {
    this.data.users[discordId] = userData;
  }

  /**
   * Get pending verification by Discord ID
   */
  getPendingVerification(discordId) {
    return this.data.pendingVerifications[discordId];
  }

  /**
   * Set pending verification
   */
  setPendingVerification(discordId, verificationData) {
    this.data.pendingVerifications[discordId] = verificationData;
  }

  /**
   * Remove pending verification
   */
  removePendingVerification(discordId) {
    delete this.data.pendingVerifications[discordId];
  }

  /**
   * Remove user data
   */
  removeUser(discordId) {
    delete this.data.users[discordId];
  }

  /**
   * Clean up expired verifications
   */
  cleanupExpiredVerifications() {
    const now = Date.now();
    const expirationTime = config.verification.codeExpirationMinutes * 60 * 1000;

    for (const discordId in this.data.pendingVerifications) {
      const verification = this.data.pendingVerifications[discordId];
      if (now - new Date(verification.createdAt).getTime() > expirationTime) {
        delete this.data.pendingVerifications[discordId];
      }
    }
  }
}

module.exports = Store;