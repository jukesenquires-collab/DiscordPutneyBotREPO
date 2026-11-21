require('dotenv').config();
const {
  Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder,
  PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');
const Database = require('better-sqlite3');

const cfg = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID || '1573740106349678672',
  homeGuildId: process.env.HOME_GUILD_ID || '1572627634159091773',
  panelChannelId: process.env.WHITELIST_PANEL_CHANNEL_ID || '1572627634666479758',
  whitelistLogId: process.env.WHITELIST_LOG_CHANNEL_ID || '1572924000592728084',
  modLogId: process.env.MOD_LOG_CHANNEL_ID || '1572656988784042176',
  groupId: process.env.ROBLOX_GROUP_ID || '913323905',
  verifiedRoleId: process.env.VERIFIED_ROLE_ID || '1572629435465867415',
  prRoleId: process.env.PUBLIC_RELATIONS_ROLE_ID || '',
  prRoleName: process.env.PUBLIC_RELATIONS_ROLE_NAME || 'Public Relations Member',
  invite: process.env.MEMBERS_SERVER_INVITE || 'https://discord.gg/m4AnYf7T5M'
};
if (!cfg.token) {
  console.error('Missing DISCORD_TOKEN. Add it in your hosting Environment settings.');
  process.exit(1);
}

const db = new Database('./data/putney.sqlite');
db.pragma('journal_mode = WAL');
db.exec(`CREATE TABLE IF NOT EXISTS applications (
 id INTEGER PRIMARY KEY AUTOINCREMENT, discord_id TEXT NOT NULL, roblox_name TEXT NOT NULL,
 roblox_id TEXT NOT NULL, challenge TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, reviewed_by TEXT, reason TEXT
)`);
const insertApp = db.prepare(`INSERT INTO applications (discord_id,roblox_name,roblox_id,challenge,status) VALUES (?,?,?,?,?)`);
const latestApp = db.prepare('SELECT * FROM applications WHERE discord_id=? ORDER BY id DESC LIMIT 1');
const updateApp = db.prepare('UPDATE applications SET status=?, reviewed_by=?, reason=? WHERE id=?');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const commands = [
  new SlashCommandBuilder().setName('whitelistpanel').setDescription('Post the whitelist application panel').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('whitelist').setDescription('Approve a pending whitelist application').addUserOption(o=>o.setName('user').setDescription('Applicant').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder().setName('whitelistreject').setDescription('Reject a whitelist application').addUserOption(o=>o.setName('user').setDescription('Applicant').setRequired(true)).addStringOption(o=>o.setName('reason').setDescription('Reason').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder().setName('whiteliststatus').setDescription('Check your whitelist application status'),
  new SlashCommandBuilder().setName('ban').setDescription('Ban a member').addUserOption(o=>o.setName('user').setDescription('Member').setRequired(true)).addStringOption(o=>o.setName('reason').setDescription('Reason')),
  new SlashCommandBuilder().setName('kick').setDescription('Kick a member').addUserOption(o=>o.setName('user').setDescription('Member').setRequired(true)).addStringOption(o=>o.setName('reason').setDescription('Reason')),
  new SlashCommandBuilder().setName('timeout').setDescription('Timeout a member').addUserOption(o=>o.setName('user').setDescription('Member').setRequired(true)).addIntegerOption(o=>o.setName('minutes').setDescription('Duration in minutes').setRequired(true).setMinValue(1).setMaxValue(40320)).addStringOption(o=>o.setName('reason').setDescription('Reason'))
].map(c=>c.toJSON());

async function sendLog(guild, channelId, embed) {
  if (!channelId) return;
  const ch = await guild.channels.fetch(channelId).catch(()=>null);
  if (ch && ch.isTextBased()) await ch.send({embeds:[embed]}).catch(()=>{});
}
function logEmbed(title, description, colour=0x5865F2) {
  return new EmbedBuilder().setColor(colour).setTitle(title).setDescription(description).setTimestamp();
}
function panelPayload() {
  const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('Putney | Whitelist Applications')
    .setDescription('Apply for access to the Putney community.\\n\\n**Before applying:**\\n1. Be a member of the Roblox group.\\n2. Have your Roblox account ready.\\n3. Follow the verification instructions.')
    .setFooter({text:'Putney Portal'});
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('wl_start').setLabel('Start application').setStyle(ButtonStyle.Primary)
  );
  return {embeds:[embed],components:[row]};
}
async function robloxUser(name) {
  const r = await fetch('https://users.roblox.com/v1/usernames/users', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({usernames:[name],excludeBannedUsers:false})
  });
  if (!r.ok) throw new Error('Roblox lookup failed. Try again later.');
  const j = await r.json();
  if (!j.data?.length) throw new Error('I could not find that Roblox username.');
  return j.data[0];
}
async function inGroup(id) {
  const r = await fetch(`https://groups.roblox.com/v1/users/${id}/groups/roles`);
  if (!r.ok) throw new Error('Could not check Roblox group membership. Try again later.');
  const j = await r.json();
  return j.data?.some(x=>String(x.group?.id)===String(cfg.groupId)) || false;
}
async function bioHasCode(id, code) {
  const r = await fetch(`https://users.roblox.com/v1/users/${id}`);
  if (!r.ok) throw new Error('Could not check your Roblox profile. Try again later.');
  const j = await r.json();
  return String(j.description || '').includes(code);
}
async function replyError(i, message) {
  const payload={content:`❌ ${message}`,ephemeral:true};
  if (i.deferred || i.replied) return i.followUp(payload).catch(()=>{});
  return i.reply(payload).catch(()=>{});
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log(`Serving ${client.guilds.cache.size} Discord server(s).`);
  const rest = new REST({version:'10'}).setToken(cfg.token);
  try {
    for (const guild of client.guilds.cache.values()) {
      await rest.put(Routes.applicationGuildCommands(cfg.clientId,guild.id),{body:commands});
    }
    console.log('Slash commands registered.');
  } catch(e) { console.error('Command registration failed:',e.message); }
  const home = await client.guilds.fetch(cfg.homeGuildId).catch(()=>null);
  if (home && cfg.panelChannelId) {
    const ch = await home.channels.fetch(cfg.panelChannelId).catch(()=>null);
    if (ch && ch.isTextBased()) {
      const recent = await ch.messages.fetch({limit:20}).catch(()=>null);
      if (!recent?.some(m=>m.author.id===client.user.id && m.components?.length)) {
        await ch.send(panelPayload()).catch(e=>console.error('Panel post failed:',e.message));
      }
    }
  }
});

client.on('interactionCreate', async i => {
  try {
    if (i.isChatInputCommand()) {
      const reason = i.options.getString('reason') || 'No reason supplied';
      if (i.commandName==='whitelistpanel') {
        await i.reply({content:'Whitelist panel posted.',ephemeral:true});
        return i.channel.send(panelPayload());
      }
      if (i.commandName==='whiteliststatus') {
        const app=latestApp.get(i.user.id);
        return i.reply({content:app?`Your latest application is **${app.status}** for Roblox account **${app.roblox_name}**.`:'You have not submitted an application yet.',ephemeral:true});
      }
      if (i.commandName==='whitelist' || i.commandName==='whitelistreject') {
        const user=i.options.getUser('user');
        const app=latestApp.get(user.id);
        if (!app || app.status!=='pending') return i.reply({content:'No pending application was found for that user.',ephemeral:true});
        if (i.commandName==='whitelist') {
          const member=await i.guild.members.fetch(user.id).catch(()=>null);
          if (!member) return i.reply({content:'That user is not in this server.',ephemeral:true});
          let role=cfg.prRoleId ? i.guild.roles.cache.get(cfg.prRoleId) : null;
          if (!role) role=i.guild.roles.cache.find(r=>r.name===cfg.prRoleName);
          if (!role) return i.reply({content:`Could not find the role "${cfg.prRoleName}". Set PUBLIC_RELATIONS_ROLE_ID or create the role.`,ephemeral:true});
          await member.roles.add(role);
          if (cfg.verifiedRoleId) {
            const vr=i.guild.roles.cache.get(cfg.verifiedRoleId);
            if (vr) await member.roles.add(vr).catch(()=>{});
          }
          updateApp.run('approved',i.user.id,'',app.id);
          await user.send(`Your Putney whitelist application has been approved. ${cfg.invite}`).catch(()=>{});
          await sendLog(i.guild,cfg.whitelistLogId,logEmbed('Whitelist approved',`${user.tag} approved by ${i.user.tag}\\nRoblox: ${app.roblox_name}`,0x57F287));
          return i.reply({content:`Approved ${user.tag} and assigned ${role.name}.`,ephemeral:true});
        } else {
          const why=i.options.getString('reason');
          updateApp.run('rejected',i.user.id,why,app.id);
          await user.send(`Your Putney whitelist application was rejected. Reason: ${why}`).catch(()=>{});
          await sendLog(i.guild,cfg.whitelistLogId,logEmbed('Whitelist rejected',`${user.tag} rejected by ${i.user.tag}\\nReason: ${why}`,0xED4245));
          return i.reply({content:`Rejected ${user.tag}.`,ephemeral:true});
        }
      }
      if (['ban','kick','timeout'].includes(i.commandName)) {
        const user=i.options.getUser('user');
        const member=await i.guild.members.fetch(user.id).catch(()=>null);
        if (!member) return i.reply({content:'Member not found in this server.',ephemeral:true});
        if (i.commandName==='ban') {
          if (!i.memberPermissions.has(PermissionFlagsBits.BanMembers)) return i.reply({content:'You need Ban Members permission.',ephemeral:true});
          await member.ban({reason});
        } else if (i.commandName==='kick') {
          if (!i.memberPermissions.has(PermissionFlagsBits.KickMembers)) return i.reply({content:'You need Kick Members permission.',ephemeral:true});
          await member.kick(reason);
        } else {
          if (!i.memberPermissions.has(PermissionFlagsBits.ModerateMembers)) return i.reply({content:'You need Moderate Members permission.',ephemeral:true});
          const mins=i.options.getInteger('minutes');
          await member.timeout(mins*60000,reason);
        }
        await sendLog(i.guild,cfg.modLogId,logEmbed(`Member ${i.commandName}ed`,`${user.tag}\\nModerator: ${i.user.tag}\\nReason: ${reason}`,0xED4245));
        return i.reply({content:`Successfully ${i.commandName}ed ${user.tag}.`,ephemeral:true});
      }
    }

    if (i.isButton() && i.customId==='wl_start') {
      const modal=new ModalBuilder().setCustomId('wl_username').setTitle('Roblox verification');
      const field=new TextInputBuilder().setCustomId('username').setLabel('Your Roblox username').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(20);
      modal.addComponents(new ActionRowBuilder().addComponents(field));
      return i.showModal(modal);
    }
    if (i.isModalSubmit() && i.customId==='wl_username') {
      await i.deferReply({ephemeral:true});
      const username=i.fields.getTextInputValue('username').trim();
      const user=await robloxUser(username);
      if (!await inGroup(user.id)) return i.editReply(`Your Roblox account **${user.name}** is not in the required Roblox group. Join group ${cfg.groupId}, then apply again.`);
      const code='PTNY-'+Array.from({length:12},()=>Math.floor(Math.random()*10)).join('');
      const row=insertApp.run(i.user.id,user.name,String(user.id),code,'pending');
      const appId=Number(row.lastInsertRowid);
      const verifyRow=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`wl_verify_${appId}`).setLabel('Verify Roblox bio').setStyle(ButtonStyle.Success));
      return i.editReply(`Found **${user.name}** and confirmed group membership.\\n\\nAdd this exact code to your Roblox profile About/Bio:\\n**${code}**\\n\\nThen return here and click Verify Roblox bio.`);
    }
    if (i.isButton() && i.customId.startsWith('wl_verify_')) {
      await i.deferReply({ephemeral:true});
      const id=Number(i.customId.split('_').pop());
      const app=db.prepare('SELECT * FROM applications WHERE id=? AND discord_id=?').get(id,i.user.id);
      if (!app) return i.editReply('Application not found. Start a new application.');
      if (!await bioHasCode(app.roblox_id,app.challenge)) return i.editReply('I cannot see your verification code in your Roblox About/Bio yet. Add it, save your profile, and try again.');
      const duplicate=db.prepare('SELECT * FROM applications WHERE id=?').get(id);
      db.prepare("UPDATE applications SET status='pending' WHERE id=?").run(id);
      await sendLog(i.guild,cfg.whitelistLogId,logEmbed('New whitelist application',`${i.user.tag}\\nRoblox: ${app.roblox_name}\\nApplication ID: ${id}`));
      return i.editReply('Roblox verification successful. Your whitelist application has been sent to staff for review.');
    }
  } catch(e) {
    console.error(e);
    await replyError(i,e.message || 'Something went wrong.');
  }
});

client.login(cfg.token);
