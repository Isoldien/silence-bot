const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const express = require('express');
const { BOT_TOKEN, TARGET_USER_ID, TARGET_USER_ID_2, GUILD_ID, NOTIFICATION_CHANNEL_ID, PORT, HA_URL, HA_TOKEN, HA_AGENT_ID} = require('./config.json');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMembers]
});

// Register slash commands
const commands = [
  new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Manually mute yourself as a failsafe'),
  new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Manually unmute yourself as a failsafe'),
  new SlashCommandBuilder()
    .setName('assist')
    .setDescription('Talk to Home Assistant Assist')
    .addStringOption(option =>
      option
        .setName('message')
        .setDescription('What do you want to ask Home Assistant?')
        .setRequired(true)
    ),
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);

client.once('ready', async () => {
  console.log(`Bot ready as ${client.user.tag}`);
  try {
    console.log('Registering slash commands...');
    await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), { body: commands });
    console.log('Slash commands registered!');
  } catch (err) {
    console.error('Failed to register slash commands:', err);
  }
});

// Query Home Assistant Assist
async function queryAssist(message) {
  try {
    const response = await fetch(`${HA_URL}/api/conversation/process`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HA_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: message,
        language: 'en',
	agent_id: HA_AGENT_ID
      })
    });

    if (!response.ok) {
      console.error('HA Assist error:', response.status, await response.text());
      return null;
    }

    const data = await response.json();
    // Extract the response text from HA's response structure
    return data?.response?.speech?.plain?.speech || null;
  } catch (err) {
    console.error('Failed to reach Home Assistant:', err);
    return null;
  }
}

// Handle slash commands
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // Auth check for all commands
  if (interaction.user.id !== TARGET_USER_ID) {
    return interaction.reply({
      content: 'You are not authorised to use this command.',
      ephemeral: true
    });
  }

  if (interaction.commandName === 'mute') {
    const success = await setMute(true, true);
    await interaction.reply({
      content: success ? '🔇 You have been **manually muted**.' : '⚠️ You are not in a voice channel!',
      ephemeral: true
    });
  }

  if (interaction.commandName === 'unmute') {
    const success = await setMute(false, true);
    await interaction.reply({
      content: success ? '🔊 You have been **manually unmuted**.' : '⚠️ You are not in a voice channel!',
      ephemeral: true
    });
  }

  if (interaction.commandName === 'assist') {
    const message = interaction.options.getString('message');

    // Defer reply as HA might take a moment to respond
    await interaction.deferReply({ ephemeral: false });

    const assistReply = await queryAssist(message);

    if (assistReply) {
      await interaction.editReply({
        content: `🏠 **Assist:** ${assistReply}`
      });
    } else {
      await interaction.editReply({
        content: '⚠️ Could not reach Home Assistant or no response received.'
      });
    }
  }
});

async function setMute(muted, manual = false) {
  const guild = await client.guilds.fetch(GUILD_ID);
  const member = await guild.members.fetch(TARGET_USER_ID);
  const channel = await client.channels.fetch(NOTIFICATION_CHANNEL_ID);

  if (!member.voice.channel) {
    console.log('User is not in a voice channel, skipping mute.');
    if (!manual) {
      await channel.send(`⚠️ <@${TARGET_USER_ID}> Door was ${muted ? 'opened' : 'closed'} but you aren't in a voice channel!`)
    }
    return false;
  }

  await member.voice.setMute(muted, muted ? 'Door opened' : 'Door closed');

  if (!manual) {
    if (muted) {
      await channel.send(`🔇 <@${TARGET_USER_ID}> You have been **muted** — door was opened!`);
    } else {
      await channel.send(`🔊 <@${TARGET_USER_ID}> You have been **unmuted** — door was closed!`);
    }
  } else {
    if (muted) {
      await channel.send(`🔇 <@${TARGET_USER_ID}> Manually **muted** via failsafe command.`);
    } else {
      await channel.send(`🔊 <@${TARGET_USER_ID}> Manually **unmuted** via failsafe command.`);
    }
  }

  console.log(`User ${muted ? 'muted' : 'unmuted'} (${manual ? 'manual' : 'door trigger'})`);
  return true;
}

const app = express();
app.use(express.json());

app.post('/webhook', async (req, res) => {
  const state = req.query.state || req.body.state;
  if (state === 'open') {
    await setMute(true);
    res.json({ action: 'muted' });
  } else if (state === 'closed') {
    await setMute(false);
    res.json({ action: 'unmuted' });
  } else {
    res.status(400).json({ error: 'Use ?state=open or ?state=closed' });
  }
});

app.get('/webhook', async (req, res) => {
  const state = req.query.state;
  if (state === 'open') {
    await setMute(true);
    res.json({ action: 'muted' });
  } else if (state === 'closed') {
    await setMute(false);
    res.json({ action: 'unmuted' });
  } else {
    res.status(400).json({ error: 'Use ?state=open or ?state=closed' });
  }
});

app.listen(PORT, () => console.log(`Webhook server on http://localhost:${PORT}`));
client.login(BOT_TOKEN);
