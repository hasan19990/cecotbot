// Main entry point for the Roblox-Discord Verification Bot
require('dotenv').config();
const config = require('./config');
const Store = require('./store');
const { initBot } = require('./bot');
const { initApi } = require('./api');

async function main() {
  console.log('Starting Roblox-Discord Verification Bot...');
  
  // Initialize the data store
  const store = new Store();
  await store.load();
  console.log('Data store initialized');
  
  // Initialize the Discord bot
  console.log('Initializing Discord bot...');
  const client = await initBot(store);
  
  // Initialize the Express API
  console.log('Initializing Express API...');
  const app = initApi(store);
  
  // Start the Express server
  const server = app.listen(config.server.port, () => {
    console.log(`Express API server running on port ${config.server.port}`);
    console.log(`Public URL should be: ${config.server.publicUrl}`);
  });
  
  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down gracefully...');
    try {
      // Save data before shutting down
      await store.save();
      console.log('Data saved');
      
      // Close server
      server.close(() => {
        console.log('Server closed');
      });
      
      // Destroy Discord client
      client.destroy();
      console.log('Discord client destroyed');
      
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  });
  
  // Periodic cleanup of expired verifications
  setInterval(() => {
    store.cleanupExpiredVerifications();
  }, 60000); // Run every minute
}

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start the application
main().catch(console.error);