# Kofi Discord Bot

A Discord bot that simulates Patreon tier role management for your server. This bot utilizes the Kofi API to listen to payment notifications, link payments to a Discord ID, and assign roles based on payment amount.

Built on top of Randall Schmidt's Kofi bot tutorial: https://github.com/mistval/premium-bot/.

# Features

## Role assignment on transaction

When a donation is made, the bot will attempt to find the supporter's Discord ID in their Kofi message. If it is found and matched to an existing member on the server, the bot will give the corresponding reward tier to the user.

## Role matching on joining the server

Often, a new supporter will join the Discord a little while after donating. The bot remembers past transactions and matches new members to their transaction and reward tier.

## Role refreshing

When a supporter renews every month, the bot will automatically update their role (if any changes are needed) and their expiration date.

## Role expiration

Each donation offers a supporter 1 month of access to your server with the corresponding reward tier role. If the supporter's month is up and they have not renewed, the bot will remove their reward tier role.

## Simple database management

If the bot fails to set a role or there is some other special scenario, its database is easy to adjust by hand.

# Get Started

1. Prepare the host machine for the bot to live on, such as a virtual private server. If you intend to use this for your supporter Discord server, the bot must be online 24/7, else it will miss any Kofi alerts sent to it while it is offline.
2. Download the code to your desired host machine, then fill in the fields in config.json:

    `BOT_TOKEN`: Your Discord bot token

    `LOG_CHANNEL_ID`: Channel ID of the channel you want the bot to send messages to

    `EXPIRE_CHECK_INTERVAL`: Number, in days, that you want the bot to look through your current server members and check for expired memberships. Daily (1) by default.

    `EXPIRE_CHECK_HOUR`: The hour (24) that you want the bot to check for expired members. Based on your host machine's local time.

    `TIERS`: A list of your reward tiers. Specify your role's name and the minimum payment to qualify for the role.

    The syntax must be exact for this file to work: words and numbers must be wrapped by `""`, and each inputted tier must be wrapped with `{}`

3. Go to your [Kofi webhook settings](https://ko-fi.com/manage/webhooks) and provide a URL that is able to forward Kofi's post requests to your host machine's local port 80.
4. Fire up your bot:

    ```jsx
    node bot.js
    ```

5. Your bot should be displaying as online on your server and sent a connection confirmation message to the specified channel. Send a test request from Kofi to make sure the bot is receiving it correctly.
6. Your supporters can now send kofi's with their Discord ID's provided in their thank-you message, and get rewarded!

# FAQ

## What if a supporter "upgrades" their monthly donation?

The bot will treat it as a renewal and overwrite their past information. Their renewal date will be 1 month from the upgraded donation.

For cases where this is not the desired outcome, the bot's owner can go in the database and edit manually.

## Can the bot process transactions that occurred while it was off?

The bot has to be online to actively listen for transaction notifications. Kofi does not offer it a way to receive past transaction history.

## Is this actually usable?

There are several major limitations:

1. The one major use case it currently is unable to handle is monthly renewals. To link a Kofi payment to a Discord user, the bot examines the message field of the donation. However, this message is only provided in one-time payments. In subsequent monthly payments, the bot will only see a new transaction with a blank message, and will not be able to connect it to an existing Discord user. There is presently no workaround for this.
2. The Kofi API does not provide the user message's contents to the bot if they select the option to make their message private. The workaround is to ask supporters to not select that box, and for the creator to delete their message shortly after so that their Discord ID is not publicly displayed.
3. Without some technical knowledge, the hosting and port forwarding setup is difficult to understand and set up.