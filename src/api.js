const express = require('express');
const config = require('./config');
const Store = require('./store');

/**
 * Initialize the Express API server
 * @param {Store} store - The data store instance
 * @returns {express.Application} - The Express app
 */
function initApi(store) {
  const app = express();
  
  // Middleware to parse JSON bodies
  app.use(express.json());
  
  // Health check endpoint
  app.get('/', (req, res) => {
    res.json({ 
      status: 'OK', 
      message: 'Roblox-Discord Verification API is running',
      timestamp: new Date().toISOString()
    });
  });
  
  // Endpoint for Roblox game to get verification code
  app.post('/api/get-code', async (req, res) => {
    try {
      const { discordId } = req.body;
      
      if (!discordId) {
        return res.status(400).json({ 
          error: 'Missing discordId in request body' 
        });
      }
      
      // Check if there's a pending verification for this user
      const pending = store.getPendingVerification(discordId);
      
      if (!pending) {
        return res.status(404).json({ 
          error: 'No pending verification found for this user' 
        });
      }
      
      // Return the verification code
      res.json({ 
        code: pending.code,
        createdAt: pending.createdAt
      });
    } catch (error) {
      console.error('Error in /api/get-code:', error);
      res.status(500).json({ 
        error: 'Internal server error' 
      });
    }
  });
  
  // Endpoint for Roblox game to verify user
  app.post('/api/verify-user', async (req, res) => {
    try {
      const { discordId, robloxUsername, robloxId } = req.body;
      
      // Validate required fields
      if (!discordId || !robloxUsername || !robloxId) {
        return res.status(400).json({ 
          error: 'Missing required fields: discordId, robloxUsername, robloxId' 
        });
      }
      
      // Check if there's a pending verification for this user
      const pending = store.getPendingVerification(discordId);
      
      if (!pending) {
        return res.status(404).json({ 
          error: 'No pending verification found for this user' 
        });
      }
      
      // Store the verified user data
      store.setUser(discordId, {
        robloxUsername,
        robloxId,
        verifiedAt: new Date().toISOString()
      });
      
      // Remove the pending verification
      store.removePendingVerification(discordId);
      
      // Save to persistent storage
      await store.save();
      
      res.json({ 
        success: true,
        message: 'User verified successfully'
      });
    } catch (error) {
      console.error('Error in /api/verify-user:', error);
      res.status(500).json({ 
        error: 'Internal server error' 
      });
    }
  });
  
  // Endpoint for Roblox game to check if user is verified
  app.get('/api/is-verified/:discordId', (req, res) => {
    try {
      const { discordId } = req.params;
      
      if (!discordId) {
        return res.status(400).json({ 
          error: 'Missing discordId parameter' 
        });
      }
      
      const user = store.getUser(discordId);
      
      if (!user) {
        return res.status(404).json({ 
          error: 'User not found or not verified' 
        });
      }
      
      res.json({ 
        verified: true,
        robloxUsername: user.robloxUsername,
        robloxId: user.robloxId,
        verifiedAt: user.verifiedAt
      });
    } catch (error) {
      console.error('Error in /api/is-verified:', error);
      res.status(500).json({ 
        error: 'Internal server error' 
      });
    }
  });
  
  // Handle 404 for undefined routes
  app.use((req, res) => {
    res.status(404).json({ 
      error: 'Route not found' 
    });
  });
  
  return app;
}

module.exports = { initApi };