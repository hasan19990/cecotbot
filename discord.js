// --- CONFIGURATION ---
// We use process.env so you can paste these securely in Render settings
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN; 
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID; 
const MONGO_URI = process.env.MONGO_URI; 
const API_PORT = process.env.PORT || 3000;

// Defined Role IDs (The roles that give perks)
// UPDATE THESE WITH YOUR ACTUAL ROLE IDS BEFORE UPLOADING OR USE ENV VARS
const ROLE_MAP = {
    "111111111111111111": "isAdmin",  
    "222222222222222222": "isVIP", 
    "333333333333333333": "isBooster"
};

// --- MONGODB SETUP (Mongoose) ---
const mongoose = require('mongoose');

// 1. Define the Data Structure (Schema)
const UserSchema = new mongoose.Schema({
    discordId: { type: String, required: true, unique: true },
    robloxName: { type: String, required: true },
    robloxId: { type: String, default: null }, 
    verificationCode: { type: String, default: null },
    isVerified: { type: Boolean, default: false },
    perks: {
        isAdmin: { type: Boolean, default: false },
        isVIP: { type: Boolean, default: false },
        isBooster: { type: Boolean, default: false }
    },
    lastUpdated: { type: Date, default: Date.now }
});

const UserModel = mongoose.model('User', UserSchema);

// 2. Connect to Database
if (!MONGO_URI) {
    console.error("❌ ERROR: MONGO_URI is missing in Environment Variables!");
    process.exit(1);
}

mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ Connected to MongoDB"))
    .catch(err => console.error("❌ MongoDB Connection Error:", err));


// --- HELPER FUNCTIONS ---

function calculatePerks(member) {
    const perks = { isAdmin: false, isVIP: false, isBooster: false };
    member.roles.cache.forEach(role => {
        if (ROLE_MAP[role.id]) {
            perks[ROLE_MAP[role.id]] = true;
        }
    });
    return perks;
}

async function updatePlayerPerks(member) {
    try {
        const user = await UserModel.findOne({ discordId: member.id });
        if (user && user.isVerified) {
            user.perks = calculatePerks(member);
            user.lastUpdated = new Date();
            await user.save();
            console.log(`[Auto-Sync] Updated perks for ${member.user.tag}`);
        }
    } catch (err) {
        console.error("Error updating perks:", err);
    }
}

// --- DISCORD BOT LOGIC ---
const { Client, GatewayIntentBits, Partials, ActivityType } = require('discord.js');
const axios = require('axios'); 

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers, 
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel] 
});

client.on('ready', () => {
    console.log(`🤖 Bot Logged in as ${client.user.tag}`);
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
    if (oldMember.roles.cache.size !== newMember.roles.cache.size) {
        await updatePlayerPerks(newMember);
    }
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || message.channel.type !== 1) return; 

    const submittedCode = message.content.trim();

    try {
        const user = await UserModel.findOne({ discordId: message.author.id });

        if (user && user.verificationCode === submittedCode) {
            const guild = client.guilds.cache.get(DISCORD_GUILD_ID);
            if (guild) {
                const member = await guild.members.fetch(message.author.id);
                
                await member.setNickname(user.robloxName).catch(e => console.log("Missing permissions to set nickname"));

                user.perks = calculatePerks(member);
                user.verificationCode = null; 
                user.isVerified = true;
                await user.save();

                message.author.send(`✅ **Success!** Linked to **${user.robloxName}**. Your roles are now synced to the game!`);
            }
        } else if (user && user.verificationCode) {
            message.author.send("❌ **Incorrect Code.** Please check the code in the Roblox game and try again.");
        }
    } catch (err) {
        console.error("DM Error:", err);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand() || interaction.commandName !== 'verify') return;

    const robloxName = interaction.options.getString('roblox_username');
    const discordId = interaction.user.id;
    
    await interaction.deferReply({ ephemeral: true });

    try {
        const roRes = await axios.post('https://users.roblox.com/v1/usernames/users', {
            usernames: [robloxName],
            excludeBannedUsers: true
        });

        if (!roRes.data.data || roRes.data.data.length === 0) {
            return interaction.editReply("❌ Roblox user not found!");
        }

        const robloxId = roRes.data.data[0].id.toString(); 
        const code = Math.floor(100000 + Math.random() * 900000).toString();

        await UserModel.findOneAndUpdate(
            { discordId: discordId },
            { 
                discordId: discordId,
                robloxName: robloxName,
                robloxId: robloxId,
                verificationCode: code,
                isVerified: false, 
            },
            { upsert: true, new: true }
        );

        interaction.editReply(`Generated code for **${robloxName}**! Check your DMs.`);
        interaction.user.send(`**Verification Steps:**\n1. Join the Roblox Game.\n2. Enter the code: \`${code}\`\n3. Reply to me here with that code.`);

    } catch (error) {
        console.error(error);
        interaction.editReply("❌ Error connecting to Roblox API or Database.");
    }
});

client.login(DISCORD_BOT_TOKEN);


// --- API ENDPOINTS (Express) ---
const express = require('express');
const app = express();
app.use(express.json());

app.get('/api/v1/get-code/:robloxName', async (req, res) => {
    try {
        const user = await UserModel.findOne({ robloxName: req.params.robloxName });
        
        if (user && user.verificationCode) {
            res.json({ code: 200, verificationCode: user.verificationCode });
        } else {
            res.json({ code: 404, error: "No pending code found." });
        }
    } catch (err) {
        res.status(500).json({ error: "DB Error" });
    }
});

app.get('/api/v1/get-roles/:robloxId', async (req, res) => {
    try {
        const user = await UserModel.findOne({ 
            robloxId: req.params.robloxId.toString(),
            isVerified: true 
        });

        if (user) {
            res.json({ code: 200, status: user.perks });
        } else {
            res.json({ code: 404, status: {} });
        }
    } catch (err) {
        res.status(500).json({ error: "DB Error" });
    }
});

app.listen(API_PORT, () => console.log(`🌍 API running on port ${API_PORT}`));
