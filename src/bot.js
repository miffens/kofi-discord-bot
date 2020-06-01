// Import utilities
const config = require('../config.json');
const webhookListener = require('./webhook_listener.js');
const jsonUtil = require('./json_util.js');
// Set constants for this file
const DB_PATH = './database.json';
const C = '`';
const BLK = '```';
// Set up logging
const log4js = require('log4js');
const log4jsConfig = require('./log_config.json');
log4js.configure(log4jsConfig);
const logger = log4js.getLogger(); // Log info, error messages to console and write to debug.log
const debug = log4js.getLogger('debug'); // Write debug messages to debug.log
// Set up Discord bot
const eris = require('eris');
const bot = new eris.Client(config.BOT_TOKEN);

/**
 * @desc Record unknown user to 'unknown' section of database.json
 * @param {string} timestampStr
 * @param {number} paymentAmount
 */
async function registerUnknown(timestampStr, paymentAmount) {
  debug.debug(`Run registerUnknown with args  ${JSON.stringify({timestampStr, paymentAmount}, null, 2)}`);
  const db = await jsonUtil.read(DB_PATH);
  const tier = getTier(paymentAmount);
  const expireDate = getExpireDate(timestampStr);
  const entry = {
    tier,
    expireDate,
    paymentAmount
  };

  db['unknown'].push(entry);

  return await jsonUtil.write(db, DB_PATH)
    .then(() => message(`:floppy_disk: Could not find user in message. Saving as ${hl('unknown')} member: ${formatJson(entry)}`))
    .catch((err) => alertError(err, 'database write'));
}

/**
 * @desc Record Discord user that isn't in the server to the "pending" section of the database.
 * @param {string} timestampStr
 * @param {number} paymentAmount
 * @param {string} userId user#0000
 */
async function registerPending(timestampStr, paymentAmount, userId) {
  debug.debug(`Run registerPending with args ${JSON.stringify({timestampStr, paymentAmount, userId}, null, 2)}`);
  const db = await jsonUtil.read(DB_PATH);
  const tier = getTier(paymentAmount);
  const expireDate = getExpireDate(timestampStr);

  if (db['pending'][userId]) {
    message(`:information_source: ${userId} already exists as an entry in the database. Their past data will be overwritten: ${formatJson(db['pending'][userId])}`);
  }

  db['pending'][userId] = {
    tier,
    expireDate,
    paymentAmount
  };

  return await jsonUtil.write(db, DB_PATH)
    .then(() => message(`:floppy_disk: ${userId} is not a member in the server. Saving as ${hl('pending')} member: ${
      formatJson(db['pending'][userId])
    }`))
    .catch((err) => logger.error(err));
}

/**
 * @desc Register member in "members" database and assign tier roles.
 * @param {Object} guild Eris guild object
 * @param {Object} member Eris member object
 * @param {number} paymentAmount
 * @param {string} timestampStr
 */
async function registerMember(guild, member, paymentAmount, timestampStr) {
  debug.debug('Run registerMember with args', {
    guild: guild ? guild.name : 'null',
    member: `${member ? getUserId(member.user) : member}`,
    paymentAmount
  });

  const db = await jsonUtil.read(DB_PATH);
  const userId = getUserId(member.user);
  if (db['members'][userId]) {
    message(`:information_source: ${hl(userId)} already exists as an entry in the database. Their past data will be overwritten: ${
      formatJson(db['members'][userId])
    }`);
  }

  const tierStr = getTier(paymentAmount);
  const expireDate = getExpireDate(timestampStr);
  if (!tierStr) {
    message(`:information_source: No tiers match ${hl(userId)}'s donation of ${hl(paymentAmount)}. Their past roles will be removed.`);
    replaceRole(guild, member, null);
  } else {
    // If tier is found, match tier name to role data object
    let newRole = getRoleByName(guild, tierStr);
    if (!newRole) {
      message(`:warning: Tried giving role ${hl(tierStr)} to ${hl(userId)}, but it was not found. Has it been created yet?\nRemoving user's past roles.`);
      replaceRole(guild, member, null);
    } else {
      replaceRole(guild, member, newRole);
    }
  }

  // Write to database
  db['members'][userId] = {
    expireDate,
    paymentAmount
  };

  return await jsonUtil.write(db, DB_PATH)
    .then(() => message(`:floppy_disk: Saved to ${hl('members')}: ${
      formatJson(db['members'][userId])
    }`))
    .catch((err) => logger.error(err));
}

/**
 * @desc Get tier to assign to user based on their payment
 * @param {number} paymentAmount
 * @returns {(string | undefined)} matching role name
 */
function getTier(paymentAmount) {
  const tiers = config.TIERS.sort((a, b) => a.amount - b.amount);
  debug.debug(`Fetched tiers ${JSON.stringify(tiers)}`);

  let roleName;
  tiers.forEach((tier) => {
    if (paymentAmount >= tier.amount) {
      roleName = tier.name;
    }
  });
  return roleName;
}

/**
 * @desc Get expiration date based on payment date
 * @param {string} timestampStr
 * @returns {string} date exactly 1 month after inputted date, formatted as "M/D/YYYY"
 */
function getExpireDate(timestampStr) {
  const paymentDate = new Date(timestampStr);
  let expireDate;
  if (paymentDate.getMonth() == 11) {
    expireDate = new Date(paymentDate.getFullYear() + 1, 0, 1);
  } else {
    expireDate = new Date(paymentDate.getFullYear(), paymentDate.getMonth() + 1, paymentDate.getDate());
  }

  return `${expireDate.getMonth() + 1}/${expireDate.getDate()}/${expireDate.getFullYear()}`;
}

/**
 * @param {Object} guild Eris guild object
 * @param {string} roleName
 * @returns {Object | undefined} Eris role object of the inputted name
 */
function getRoleByName(guild, roleName) {
  return Array.from(guild.roles.values()).find(role => role.name === roleName);
}

/**
 * @param {Object} guild Eris guild object
 * @param {string} roleId
 * @returns {Object | undefined} Eris role object of the inputted role id string
 */
function getRoleById(guild, roleId) {
  return Array.from(guild.roles.values()).find(role => role.id === roleId);
}

/**
 * @desc Replace given member's tier roles with new role. This will only modify roles specified in config.json.
 * If newRole is not specified, this will just remove all of the member's tier roles.
 * @param {Object} guild Eris guild object
 * @param {Object} member Eris member object
 * @param {(Object | undefined)} newRole Eris role object
 */
async function replaceRole(guild, member, newRole) {
  // Get list of "tier" roles assigned to the current user
  // This is so role removal does not interfere with other roles that are unrelated to subscription tier
  const tierNames = config.TIERS.map((tier) => tier.name);
  // List of member's current role ID numbers
  const memberTierRoles = member.roles.filter(roleId =>
    tierNames.includes(guild.roles.get(roleId).name)
  );
  // Roles queued for removal
  let rolesToRemove = [...memberTierRoles];

  if (newRole && memberTierRoles.includes(newRole.id)) {
    // Do not include role that will carry over in the removal queue
    // For example, if user already has roles [1, 2, 3] and their new role is 3, only queue [1, 2] for removal
    rolesToRemove = rolesToRemove.filter(roleId => roleId !== newRole.id);
    message(`${getUserId(member.user)} already has role ${newRole.name}. No role added.`);
  } else if (newRole) {
    await member.addRole(newRole.id)
      .then(() => message(`:star: Set role ${hl(newRole.name)} for member ${hl(getUserId(member.user))}`))
      .catch((err) => alertError(err, 'role adding'));
  }

  rolesToRemove.forEach(async (oldRoleId) => {
    const oldRoleObj = getRoleById(guild, oldRoleId);
    await member.removeRole(oldRoleId)
      .then(() => message(`:no_entry_sign: Removed role ${hl(oldRoleObj.name)} for member ${hl(getUserId(member.user))}`))
      .catch((err) => alertError(err, 'role removal'));
  });
}

/**
 * @desc Goes through "members" database checking if any expirationDates have passed.
 * If found, removes member's tier roles and database entry.
 */
async function checkExpired() {
  message(':information_source: Running check for expired members...');
  const db = await jsonUtil.read(DB_PATH);
  // This must finish running before we write to the DB.
  await Object.keys(db['members']).forEach(async (userId) => {
    debug.debug(`Checking member ${JSON.stringify(userId)}`);
    const expireDate = db['members'][userId]['expireDate'];
    if (new Date() >= new Date(expireDate)) {
      message(`User ${hl(userId)}'s membership expired on ${expireDate}.`);

      const [userName, userDiscriminator] = userId.split('#');
      const user = bot.users.find(user => user.username.toLowerCase() === userName && user.discriminator === userDiscriminator);
      if (!user) {
        message(`:warning: Could not find user ${hl(userId)} in server. Maybe they left?`);
        message(`:no_entry_sign: Removing ${hl(userId)} from database: ${formatJson(db['members'][userId])}`);
        delete db['members'][userId];
        return;
      }

      const guild = bot.guilds.find(guild => guild.members.has(user.id));
      const member = guild.members.get(user.id);
      replaceRole(guild, member, null).then(() => {
        message(`:no_entry_sign: Removing ${hl(userId)} from database: ${formatJson(db['members'][userId])}`);
        delete db['members'][userId];
      });
    } else {
      debug.debug('Member has not expired yet');
    }
  });
  return await jsonUtil.write(db, DB_PATH)
    .then(() => message(':white_check_mark: Expired member check complete.'));
}

/**
 * @param {Object} object
 * @returns {string} inputted object formatted as a pretty-printed json code block
 */
function formatJson(object) {
  return `${BLK}json\n${JSON.stringify(object, null, 2)}${BLK}`;
}

/**
 * @param {string} str
 * @returns {string} inputted string wrapped in ``
 */
function hl(str) {
  return `${C}${str}${C}`;
}

/**
 * @desc Look for a username in the form of username#0000
 * @param {string} str
 * @returns {(string | null)}
 */
function findUserInString(str) {
  const re = /[\w\d]+#[\d]{4}/;
  const matches = str.match(re);
  return matches ? matches[0] : null;
}

/**
 * @param {User} user object from Eris API
 * @returns {string} Discord user id in the format 'username#0000'
 */
function getUserId(user) {
  return `${user.username.toLowerCase()}#${user.discriminator}`;
}

/**
 * @param {string} userId Discord user id in the format 'username#0000'
 * @returns {(string | undefined)} Eris user object
 */
function getUser(userId) {
  return bot.users.find(
    user => userId === `${user.username.toLowerCase()}#${user.discriminator}`
  );
}

/**
 * @returns future Date object based on settings in config.json: (today + [EXPIRE_CHECK_INTERVAL]) EXPIRE_CHECK_HOUR:00:00.
 */
function getNextTaskTime() {
  const now = new Date();
  const nextTaskTime = new Date();
  nextTaskTime.setDate(now.getDate() + parseInt(config.EXPIRE_CHECK_INTERVAL));
  nextTaskTime.setHours(config.EXPIRE_CHECK_HOUR, 0, 0, 0);
  return nextTaskTime;
}

/**
 * @desc Executes and queues next expired members checks.
 */
function queueNextExpireCheck() {
  const nextTaskTime = getNextTaskTime();
  message(`:information_source: Queuing next expired members check at ${hl(nextTaskTime)} (${((nextTaskTime - new Date()) / 3600000).toFixed(1)} hours).`);
  setTimeout(() => {
    checkExpired()
      .catch((err) => alertError(err, 'expiration check'))
      .finally(() => queueNextExpireCheck());
  }, nextTaskTime - new Date());
}

/**
 * @desc Send message to the channel and log message to the console/ debug.log
 * @param {string} msg
 */
async function message(msg) {
  logger.info(msg);
  await bot.createMessage(config.LOG_CHANNEL_ID, msg)
    .catch((err) => {
      logger.error(`Failed to message server: ${msg}`);
      debug.debug(err);
    });
}

/**
 * @desc logs error and messages server
 * @param {string} err the error object
 * @param {string?} source a description of the error's source
 */
function alertError(err, source) {
  logger.error(err);
  message(`:bangbang: ${hl(err.name)}: ${hl(err.message)}${source ? ` in ${source}` : ''}`);
}

/**
 * @desc Message channel about received donation
 * @param {(string | undefined)} member
 * @param {number} paymentAmount
 * @param {(string | undefined)} paymentSource
 * @param {(string | undefined)} paymentId
 * @param {(string | undefined)} senderName
 * @param {(string | undefined)} message
 * @param {string} timestampStr
 */
async function logDonation(member, paymentAmount, paymentSource, paymentId, senderName, message, timestampStr) {
  const isKnownMember = !!member;
  const memberName = isKnownMember ? getUserId(member.user) : 'Unknown';
  const color = isKnownMember ? 0x67d894 : 0xFF5733;

  const logMessage = {
    embed: {
      title: 'Donation received',
      color,
      timestampStr,
      fields: [
        { name: 'Payment Source', value: paymentSource || 'null', inline: true },
        { name: 'Payment ID', value: paymentId || 'null', inline: true },
        { name: 'Sender', value: senderName || 'null', inline: true },
        { name: 'Donor Discord name', value: memberName || 'null', inline: true },
        { name: 'Donation amount', value: paymentAmount.toString(), inline: true },
        { name: 'Message', value: message || 'null', inline: true },
      ],
    }
  };

  // Not using standard message function due to special format
  await bot.createMessage(config.LOG_CHANNEL_ID, logMessage)
    .catch((err) => {
      logger.error('Failed to message server.');
      logger.error(err);
    });
}

// Bot will post a message when it connects, and queue the regular job checking for expired members.
bot.on('ready', () => {
  message(config.BOT_MSG.connected);
  queueNextExpireCheck();
});

// Bot will respond if it is mentioned.
bot.on('messageCreate', (msg) => {
  const botWasMentioned = msg.mentions.find(
    mentionedUser => mentionedUser.id === bot.user.id,
  );

  if (botWasMentioned) {
    message(config.BOT_MSG.mention_response);
  }
});

bot.on('error', err => {
  logger.error(err);
});

// When a new member joins the server, the bot will look for the user in the "pending" database.
// If there's a match, it will assign the corresponding role.
bot.on('guildMemberAdd', async (guild, member) => {
  const db = await jsonUtil.read(DB_PATH);
  const userId = getUserId(member.user);
  const userDbEntry = db['pending'][userId];
  if (userDbEntry) {
    message(`:information_source: Found member ${hl(userId)} in ${hl('pending')} records: ${formatJson(userDbEntry)}`);
    // Give the new user their role
    const tierName = getTier(userDbEntry['paymentAmount']);
    const role = getRoleByName(guild, tierName);
    replaceRole(guild, member, role);

    // Update database: register user in 'members' section and delete from 'pending'
    db['members'][userId] = {
      expireDate: userDbEntry['expireDate'],
      paymentAmount: userDbEntry['paymentAmount']
    };
    delete db['pending'][userId];

    return await jsonUtil.write(db, DB_PATH)
      .then(() => message(`:floppy_disk: Removed from ${hl('pending')} and saved to ${hl('members')}: ${
        formatJson(db['members'][userId])
      }`))
      .catch((err) => alertError(err, 'database write'));
  } else {
    message(`:warning: User ${hl(userId)} not found in the ${hl('pending')} database. No roles assigned. Maybe they didn't include their Discord ID in their message, or they're not a supporter?`);
  }
});

async function onDonation(
  paymentSource,
  paymentId,
  timestampStr,
  paymentAmount,
  senderName,
  message,
) {
  logger.info(`Received donation: ${paymentAmount}`);
  debug.debug({
    paymentSource,
    paymentId,
    timestampStr,
    paymentAmount,
    senderName,
    message});
  try {
    // If Discord ID cannot be found in the Kofi message, save the info to the "unknown" section to the database
    const userId = findUserInString(message);
    if (!userId) {
      return await Promise.all([
        logDonation(null, paymentAmount, paymentSource, paymentId, senderName, message, timestampStr),
        registerUnknown(timestampStr, paymentAmount)
      ]);
    }
    // If Discord ID is found but it doesn't exist in the server, log the user to the "pending" section of the database
    const user = getUser(userId);
    const guild = user ? bot.guilds.find(guild => guild.members.has(user.id)) : null;
    const guildMember = guild ? guild.members.get(user.id) : null;
    if (!guild) {
      return await Promise.all([
        logDonation(null, paymentAmount, paymentSource, paymentId, senderName, message, timestampStr),
        registerPending(timestampStr, paymentAmount, userId)
      ]);
    }
    // If there is a Discord ID and the member exists, set their role and save their info to the "members" section of the database
    return await Promise.all([
      logDonation(guildMember, paymentAmount, paymentSource, paymentId, senderName, message, timestampStr),
      registerMember(guild, guildMember, paymentAmount, timestampStr)
    ]);
  } catch (err) {
    alertError(err, 'updating donor role and logging donation');
  }
}

webhookListener.on('donation', onDonation);
bot.connect();