// Configuration file for the verification system
require('dotenv').config();

module.exports = {
  // Discord bot configuration
  discord: {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.DISCORD_CLIENT_ID,
  },

  // Server configuration
  server: {
    port: process.env.PORT || 3000,
    publicUrl: process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`,
  },

  // Verification settings
  verification: {
    // How long codes remain valid (in minutes)
    codeExpirationMinutes: parseInt(process.env.CODE_EXPIRATION_MINUTES) || 10,
    
    // Data storage file
    dataFile: './data.json',
  },

  // Roblox game settings
  roblox: {
    // This would be your game's place ID if you want to restrict verification to specific games
    // placeId: 1234567890,
  },
};