const express = require('express');
const bodyParser = require('body-parser');
const EventEmitter = require('events');
// Set up logging
const log4js = require('log4js');
const log4jsConfig = require('./log_config.json');
log4js.configure(log4jsConfig);
const debug = log4js.getLogger('debug'); // Write debug messages to debug.log
const logger = log4js.getLogger(); // Log info, error messages to console and write to debug.log

const PORT = process.env.PORT || 80;

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

class WebhookListener extends EventEmitter {
  listen() {
    app.post('/kofi', (req, res) => {
      try {
        // For some reason, the data is a string when sent from Kofi.
        // It's correctly an object when sent from Postman.
        const data = typeof(req.body.data) === 'string' ? JSON.parse(req.body.data) : req.body.data;
        const { message, timestamp } = data;
        const amount = parseFloat(data.amount);
        const senderName = data.from_name;
        const paymentId = data.message_id;
        const paymentSource = 'Ko-fi';

        // The OK is just for us to see in devlopment. Ko-fi doesn't care
        // about the response body, it just wants a 200.
        res.send({ status: 'OK' });

        debug.debug(`Received POST: ${
          JSON.stringify({paymentSource,
            paymentId,
            timestamp,
            amount,
            senderName,
            message})
        }`);

        this.emit(
          'donation',
          paymentSource,
          paymentId,
          timestamp,
          amount,
          senderName,
          message,
        );
      } catch(err) {
        logger.error(err);
      }
    });

    app.listen(PORT);
    logger.info(`Port ${PORT} open`);
  }
}

const listener = new WebhookListener();
listener.listen();

module.exports = listener;