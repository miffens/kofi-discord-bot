// Set up logging
const log4js = require('log4js');
const log4jsConfig = require('./log_config.json');
log4js.configure(log4jsConfig);
const logger = log4js.getLogger(); // Log info, error messages to console and write to debug.log
const debug = log4js.getLogger('debug'); // Write debug messages to debug.log

const util = require('util');
const fs = require('fs');
const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);

/**
 * @param {string} path path to JSON file
 * @returns {Object} JSON object read from file
 */
async function read(path) {
  logger.info(`Reading file ${path}.`);
  const fileContent = await _call(readFile(path, 'utf8'));
  debug.debug(`${fileContent ? fileContent.substring(0, 100) : fileContent}...`);
  return JSON.parse(fileContent);
}

/**
 * @desc Write JSON object to path. This will overwrite all previous file contents!
 * @param {Object} data JSON object to write to path
 * @param {string} path 
 */
async function write(data, path) {  
  const jsonString = JSON.stringify(data, null, 2);
  debug.debug(`Writing file ${path}: ${jsonString ? jsonString.substring(0, 100) : jsonString}...`);

  await _call(writeFile(path, jsonString));
  logger.info(`Successfully saved data to ${path}.`);
}

const _call = (promise) =>
  promise.then(r => r == null ? ({result: r}): r)
    .catch(err => logger.error(err));

module.exports = {read, write};