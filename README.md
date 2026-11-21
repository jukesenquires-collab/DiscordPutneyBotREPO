# Putney Portal

Discord.js v14 whitelist and moderation bot.

## Install
1. Upload this ZIP to `/home/container` and extract it there.
2. Copy `putney-portal-system/src/index.js` to `/home/container/src/index.js`.
3. Copy `putney-portal-system/package.json` to `/home/container/package.json`.
4. Run `npm install --no-fund --no-audit`.
5. Set startup file to `src/index.js` and restart.

Keep your existing `data` folder and hosting Environment variables. Set `DISCORD_TOKEN` in hosting Environment settings; never put your live token in this ZIP.

## Commands
`/whitelistpanel`, `/whitelist`, `/whitelistreject`, `/whiteliststatus`, `/ban`, `/kick`, `/timeout`.

The bot checks Roblox username and group membership, then provides a PTNY verification code for the user's Roblox profile bio. Staff approval assigns the Public Relations role and optionally the Verified role.

This is an initial implementation. Test in a private server before relying on it for live moderation. The channel and role IDs are configured for the home server.
