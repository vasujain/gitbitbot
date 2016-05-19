/**
 * Helpers for configuring a bot as an app
 * https://api.slack.com/slack-apps
 */

var beepboop = require('beepboop-botkit').start(controller, { debug: true });
var Botkit = require('botkit');
var _bots = {};

function _trackBot(bot) {
    _bots[bot.config.token] = bot;
}

function die(err) {
    console.log(err);
    process.exit(1);
}

module.exports = {
    configure: function (port, clientId, clientSecret, config, onInstallation) {
        var controller = Botkit.slackbot(config);
        controller.storage.teams.all(function (err, teams) {
            if (err) {
                throw new Error(err);
            }

        });

    }
}
