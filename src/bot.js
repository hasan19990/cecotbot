const { Client, GatewayIntentBits, Events, REST, Routes } = require('discord.js');
const config = require('./config');
const Store = require('./store');

/**
 * Initialize the Discord bot
 * @param {Store} store - The data store instance
 * @returns {Client} - The Discord client
 */
async function initBot(store) {
  // Create a new Discord client with required intents
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.DirectMessageReactions,
      GatewayIntentBits.DirectMessageTyping,
      GatewayIntentBits.GuildMessages
    ]
  });

  // Generate a random 4-digit verification code
  function generateCode() {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  // Register slash commands
  async function registerCommands() {
    const rest = new REST({ version: '10' }).setToken(config.discord.token);
    
    const commands = [
      {
        name: 'verify',
        description: 'Start the Roblox verification process',
        options: [
          {
            name: 'username',
            type: 3, // STRING
            description: 'Your Roblox username',
            required: true
          }
        ]
      },
      {
        name: 'confirm',
        description: 'Confirm your verification with a code',
        options: [
          {
            name: 'code',
            type: 3, // STRING
            description: 'The 4-digit verification code',
            required: true
          }
        ]
      },
      {
        name: 'logout',
        description: 'Remove your Roblox verification'
      }
    ];
    
    try {
      console.log('Started refreshing application (/) commands.');
      
      await rest.put(
        Routes.applicationCommands(config.discord.clientId),
        { body: commands }
      );
      
      console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
      console.error('Error registering commands:', error);
    }
  }

  // Handle the verify command
  async function handleVerify(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });
      
      const username = interaction.options.getString('username');
      
      // Check if user is already verified
      const existingUser = store.getUser(interaction.user.id);
      if (existingUser) {
        return await interaction.editReply({
          content: `You are already verified as \`${existingUser.robloxUsername}\`. Use /logout first if you want to change accounts.`
        });
      }
      
      // Clean up expired verifications
      store.cleanupExpiredVerifications();
      
      // Generate a new verification code
      const code = generateCode();
      
      // Store the pending verification
      store.setPendingVerification(interaction.user.id, {
        code: code,
        robloxUsername: username,
        createdAt: new Date().toISOString()
      });
      
      // Save to persistent storage
      await store.save();
      
      // Inform user to check in-game for the code
      await interaction.editReply({
        content: `Verification started! Please check your Roblox game screen for the 4-digit verification code.\nEnter \`/confirm ${code}\` in Discord when you have the code.\nThis code will expire in ${config.verification.codeExpirationMinutes} minutes.`
      });
    } catch (error) {
      console.error('Error in verify command:', error);
      try {
        await interaction.editReply({
          content: 'An error occurred while processing your verification. Please try again later.'
        });
      } catch (editError) {
        console.error('Error editing reply:', editError);
      }
    }
  }

  // Handle the confirm command
  async function handleConfirm(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });
      
      const code = interaction.options.getString('code');
      
      // Clean up expired verifications
      store.cleanupExpiredVerifications();
      
      // Find a pending verification with this code
      let foundVerification = null;
      let foundDiscordId = null;
      
      for (const discordId in store.data.pendingVerifications) {
        const verification = store.data.pendingVerifications[discordId];
        if (verification.code === code) {
          foundVerification = verification;
          foundDiscordId = discordId;
          break;
        }
      }
      
      if (!foundVerification) {
        return await interaction.editReply({
          content: '❌ Invalid or expired verification code. Please try again with a new code using `/verify`.'
        });
      }
      
      // Check if this command is from the user who requested verification
      if (foundDiscordId !== interaction.user.id) {
        return await interaction.editReply({
          content: '❌ This code was not issued to you. Please use `/verify` to get your own code.'
        });
      }
      
      // At this point, verification is successful
      try {
        // Update user data
        store.setUser(foundDiscordId, {
          robloxUsername: foundVerification.robloxUsername,
          robloxId: 'SIMULATED_ID_' + foundDiscordId, // In real implementation, this would come from Roblox API
          verifiedAt: new Date().toISOString()
        });
        
        // Remove pending verification
        store.removePendingVerification(foundDiscordId);
        await store.save();
        
        // Try to update the user's nickname to match their Roblox username
        let nicknameSuccess = false;
        try {
          const member = await interaction.member.fetch();
          if (member) {
            await member.setNickname(foundVerification.robloxUsername);
            nicknameSuccess = true;
          }
        } catch (nicknameError) {
          console.log('Could not update nickname:', nicknameError.message);
        }
        
        // Get user's roles for display
        let rolesInfo = '';
        try {
          const member = await interaction.member.fetch();
          if (member) {
            const roles = member.roles.cache
              .filter(role => role.name !== '@everyone')
              .map(role => `${role.name} (${role.id})`)
              .join('\n');
            
            if (roles) {
              rolesInfo = `\n\nYour Discord Roles:\n${roles}`;
            }
          }
        } catch (rolesError) {
          console.log('Could not fetch roles:', rolesError.message);
        }
        
        const nicknameMessage = nicknameSuccess 
          ? `\nI've updated your nickname to \`${foundVerification.robloxUsername}\`.`
          : '\nI couldn\'t update your nickname - I may not have permission.';
        
        await interaction.editReply({
          content: `✅ Verification successful!\nYou are now verified as \`${foundVerification.robloxUsername}\`.${nicknameMessage}${rolesInfo}`
        });
      } catch (error) {
        console.error('Error completing verification:', error);
        await interaction.editReply({
          content: 'An error occurred while completing your verification. Please try again.'
        });
      }
    } catch (error) {
      console.error('Error in confirm command:', error);
      try {
        await interaction.editReply({
          content: 'An error occurred while processing your confirmation. Please try again later.'
        });
      } catch (editError) {
        console.error('Error editing reply:', editError);
      }
    }
  }

  // Handle the logout command
  async function handleLogout(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });
      
      // Check if user is verified
      const user = store.getUser(interaction.user.id);
      if (!user) {
        return await interaction.editReply({
          content: 'You are not currently verified.'
        });
      }
      
      // Remove user data
      store.removeUser(interaction.user.id);
      await store.save();
      
      // Reset nickname if possible
      try {
        const guild = interaction.guild;
        if (guild && guild.members.me.permissions.has('ManageNicknames')) {
          const member = await guild.members.fetch(interaction.user.id);
          if (member) {
            await member.setNickname('');
          }
        }
      } catch (nicknameError) {
        // Not critical if we can't reset nickname
        console.log('Could not reset nickname:', nicknameError.message);
      }
      
      await interaction.editReply({
        content: `You have been logged out. Your verification as \`${user.robloxUsername}\` has been removed.`
      });
    } catch (error) {
      console.error('Error in logout command:', error);
      try {
        await interaction.editReply({
          content: 'An error occurred while logging you out. Please try again later.'
        });
      } catch (editError) {
        console.error('Error editing reply:', editError);
      }
    }
  }

  // Event handler when the bot is ready
  client.once(Events.ClientReady, async () => {
    console.log(`Ready! Logged in as ${client.user.tag}`);
    
    // Register commands when the bot starts
    await registerCommands();
  });

  // Event handler for slash commands
  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'verify') {
      await handleVerify(interaction);
    } else if (interaction.commandName === 'confirm') {
      await handleConfirm(interaction);
    } else if (interaction.commandName === 'logout') {
      await handleLogout(interaction);
    }
  });

  // Log in to Discord
  await client.login(config.discord.token);
  
  return client;
}

module.exports = { initBot };