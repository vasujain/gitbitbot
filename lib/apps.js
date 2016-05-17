/**
 * Helpers for configuring a bot as an app
 * https://api.slack.com/slack-apps
 */

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
        controller.on('create_bot', function (bot, config) {

            if (_bots[bot.config.token]) {
                // already online! do nothing.
            } else {

                bot.startRTM(function (err) {
                    if (err) {
                        die(err);
                    }

                    _trackBot(bot);

                    if (onInstallation) onInstallation(bot, config.createdBy);
                });
            }
        });


        controller.storage.teams.all(function (err, teams) {

            if (err) {
                throw new Error(err);
            }

            // connect all teams with bots up to slack!
            for (var t  in teams) {
                if (teams[t].bot) {
                    var bot = controller.spawn(teams[t]).startRTM(function (err) {
                        if (err) {
                            console.log('Error connecting bot to Slack:', err);
                        } else {
                            _trackBot(bot);
                        }
                    });
                }
            }

        });


        return controller;


    }
}
