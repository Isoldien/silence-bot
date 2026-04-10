# silence

A Discord bot that automatically server mutes you when a state of a device changes, and unmutes — powered by Home Assistant. Includes slash commands for manual control and direct access to Home Assistant Assist from Discord.

---

## How It Works

```
Door opens
    ↓
Home Assistant detects sensor change
    ↓
Fires a webhook → POST http://your-pc-ip:3000/webhook?state=open
    ↓
Express server receives the request
    ↓
Bot mutes you in the voice channel + sends a notification
    ↓
Door closes → reverse happens
```

---

## Features

- **Auto mute/unmute** based on sensor state via Home Assistant
- **Notification messages** sent to a Discord channel on every mute/unmute event
- **`/mute` and `/unmute`** slash commands as a manual failsafe (user restricted)
- **`/assist`** slash command to talk to Home Assistant Assist directly from Discord (user restricted)

---

## Prerequisites

- [Node.js LTS](https://nodejs.org) (v18)
- A Discord account and server which you own or have a high-level roles
- Home Assistant with a sensor configured (a simple door/window contact sensor works good, for more functionality mmWave presence sensors along with the contact sensors would provide more accessibility)

---

## Installation

### 1. Clone or download this project

```bash
git clone https://github.com/Isoldien/silence-bot
cd silence-bot
```

### 2. Install dependencies

```bash
npm init -y
npm install discord.js express
```

### 3. Set up your config

Copy the example config and fill in your values:

```bash
copy config.json.example config.json
```

Open `config.json` and fill in all the values — see [Configuration](#configuration) below.

### 4. Run the bot

```bash
node bot.js
```

You should see:

```
Webhook server on http://localhost:3000
Slash commands registered!
Bot ready as YourBot#1234
```

### 5. Keep it running 

Using a tool like [Screen](https://www.gnu.org/software/screen/manual/screen.html) and [PM2](https://pm2.keymetrics.io/)

```bash
screen -S silence-bot
npm install -g pm2
pm2 start bot.js --name discordbot
pm2 startup
pm2 save
^A ^D (to detach the screen)
```

---

## Configuration

Copy `config.json.example` to `config.json` and fill in your values:

```json
{
  "BOT_TOKEN": "your-bot-token",
  "TARGET_USER_ID": "discord-user-id-to-mute",
  "TARGET_ROLE_ID": "discord-role-id-for-slash-commands",
  "GUILD_ID": "your-server-id",
  "NOTIFICATION_CHANNEL_ID": "channel-id-for-notifications",
  "PORT": 3000,
  "HA_URL": "http://your-homeassistant-ip:8123",
  "HA_TOKEN": "your-long-lived-access-token",
  "HA_AGENT_ID": "conversation.home_assistant"
}
```

| Field | Description |
|---|---|
| `BOT_TOKEN` | Your bot token from the Discord Developer Portal |
| `TARGET_USER_ID` | The Discord user ID of the person to mute/unmute |
| `TARGET_ROLE_ID` | Role ID allowed to use `/mute` and `/unmute` slash commands |
| `GUILD_ID` | Your Discord server ID |
| `NOTIFICATION_CHANNEL_ID` | Channel ID where the bot sends mute/unmute notifications |
| `PORT` | Port the webhook server listens on (default: 3000) |
| `HA_URL` | Your Home Assistant local URL including port |
| `HA_TOKEN` | Long-lived access token from your HA profile page |
| `HA_AGENT_ID` | The conversation agent to use for `/assist` |

### Getting your IDs

Enable **Developer Mode** in Discord (Settings → Advanced → Developer Mode), then right-click any user, role, or server to copy its ID.

### Getting your HA token

In Home Assistant, click your username (bottom left) → scroll to the bottom → **Long-Lived Access Tokens** → **Create Token**.

### Finding your HA agent ID

Go to **Developer Tools → Template** in HA and paste:

```jinja
{{ integration_entities('conversation') }}
```

Common values:

| Agent | `HA_AGENT_ID` |
|---|---|
| Built-in Assist | `conversation.home_assistant` |
| OpenAI / ChatGPT | `conversation.chatgpt` |
| Google Generative AI | `conversation.google_generative_ai` |
| Ollama (local) | `conversation.ollama` |

---

## Discord Bot Setup

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications) → **New Application**
2. Go to **Bot** → **Add Bot** → copy the **Token** into `config.json`
3. Under **Privileged Gateway Intents**, enable **Server Members Intent**
4. Go to **OAuth2 → URL Generator**, select scopes: `bot` and `applications.commands`
5. Select permissions: **Mute Members** and **Send Messages**
6. Use the generated URL to invite the bot to your server

---

## Home Assistant Setup

Add the following to your `configuration.yaml`:

```yaml
rest_command:
  discord_mute:
    url: "http://YOUR_PC_LOCAL_IP:3000/webhook?state=open"
    method: POST
  discord_unmute:
    url: "http://YOUR_PC_LOCAL_IP:3000/webhook?state=closed"
    method: POST
```

Then add these automations (replace the `device_id` and `entity_id` with your own sensor values):

```yaml
- alias: Discord Mute on Door Open
  triggers:
    - type: opened
      device_id: YOUR_DEVICE_ID
      entity_id: YOUR_ENTITY_ID
      domain: binary_sensor
      trigger: device
  conditions: []
  actions:
    - action: rest_command.discord_mute
      data: {}

- alias: Discord Unmute on Door Close
  triggers:
    - type: closed
      device_id: YOUR_DEVICE_ID
      entity_id: YOUR_ENTITY_ID
      domain: binary_sensor
      trigger: device
  conditions: []
  actions:
    - action: rest_command.discord_unmute
      data: {}
```

Restart Home Assistant after editing `configuration.yaml`.

---

## Slash Commands

| Command | Description | Who can use it |
|---|---|---|
| `/mute` | Manually server mutes you as a failsafe | Members with `TARGET_USER_ID` |
| `/unmute` | Manually server unmutes you as a failsafe | Members with `TARGET_USER_ID` |
| `/assist <message>` | Sends a message to Home Assistant Assist and replies with the response | `TARGET_USER_ID` only |

All slash command replies are ephemeral (only visible to the person who used them). Mute/unmute events are always logged to the notification channel.

---

## Troubleshooting

**Bot is reachable in the browser but HA automations don't fire**
- Verify the IP in `rest_command` matches your PC's local network IP (check with `ipconfig`)
- Go to **Developer Tools → Actions** in HA, search `rest_command`, and test `discord_mute` manually
- Check **Settings → System → Logs** in HA for connection errors after triggering

**"Unknown action: rest_command.discord_mute" error**
- The `rest_command` block in `configuration.yaml` is not at the top level, or there is a YAML indentation error
- Go to **Developer Tools → Check Configuration** to validate before restarting

**Slash commands not appearing in Discord**
- Make sure `applications.commands` scope was included when inviting the bot
- Slash commands are registered per-server on startup — restart the bot and wait up to 1 hour for Discord to propagate them (usually instant)

**Running on WSL2**
- WSL2 has a separate virtual network — Home Assistant cannot reach it directly
- The recommended solution is to run the bot on Windows natively using [Node.js for Windows](https://nodejs.org) to avoid networking issues entirely

---

## Project Structure

```
discordbot/
├── bot.js               # Main bot file
├── config.json          # Your local config (never commit this)
├── config.json.example  # Safe template to share
├── package.json         # Node.js project file
└── README.md
```

---

## Dependencies

| Package | Purpose |
|---|---|
| [discord.js](https://discord.js.org) | Discord bot framework |
| [express](https://expressjs.com) | HTTP server for receiving HA webhooks |

---

## License
MIT 
