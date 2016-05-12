/**
 * GitBit Bot for Slack ! 
 * @author: Vasu Jain
 */

// Libraries
var https = require('https');
var BotConfig = require('./config.json');

function onInstallation(bot, installer) {
    if (installer) {
        bot.startPrivateConversation({
            user: installer
        }, function(err, convo) {
            if (err) {
                console.log(err);
            } else {
                convo.say('I am GitBit bot that has just joined your team');
                convo.say('You must now /invite me to a channel so that I can be of use!');
            }
        });
    }
}

// Configure the persistence options
var config = {};
if (process.env.MONGOLAB_URI) {
    var BotkitStorage = require('botkit-storage-mongo');
    config = {
        storage: BotkitStorage({
            mongoUri: process.env.MONGOLAB_URI
        }),
    };
} else {
    config = {
        json_file_store: ((process.env.TOKEN) ? './db_slack_bot_ci/' : './db_slack_bot_a/'), //use a different name if an app or CI
    };
}

if (process.env.TOKEN || process.env.SLACK_TOKEN) {
    //Treat this as a custom integration
    var customIntegration = require('./lib/custom_integrations');
    var token = (process.env.TOKEN) ? process.env.TOKEN : process.env.SLACK_TOKEN;
    var controller = customIntegration.configure(token, config, onInstallation);
} else if (process.env.CLIENT_ID && process.env.CLIENT_SECRET && process.env.PORT) {
    //Treat this as an app
    var app = require('./lib/apps');
    var controller = app.configure(process.env.PORT, process.env.CLIENT_ID, process.env.CLIENT_SECRET, config, onInstallation);
} else {
    console.log('Error: If this is a custom integration, please specify TOKEN in the environment. If this is an app, please specify CLIENTID, CLIENTSECRET, and PORT in the environment');
    process.exit(1);
}


/**
 * A demonstration for how to handle websocket events. In this case, just log when we have and have not
 * been disconnected from the websocket. In the future, it would be super awesome to be able to specify
 * a reconnect policy, and do reconnections automatically. In the meantime, we aren't going to attempt reconnects,
 * WHICH IS A B0RKED WAY TO HANDLE BEING DISCONNECTED. So we need to fix this.
 *
 * TODO: fixed b0rked reconnect behavior
 */
// Handle events related to the websocket connection to Slack
controller.on('rtm_open', function(bot) {
    console.log('** The RTM api just connected!');
});

controller.on('rtm_close', function(bot) {
    console.log('** The RTM api just closed');
    // you may want to attempt to re-open
});

// Core bot logic !
controller.on('bot_channel_join', function(bot, message) {
    bot.reply(message, "I'm here!")
});

controller.hears(['hello', 'hi', 'greetings'], ['direct_mention', 'mention', 'direct_message'], function(bot, message) {
    bot.reply(message, 'Hello!');
});

controller.hears('pr (.*)', ['direct_mention', 'mention', 'direct_message'], function(bot, message) {
    var repo = message.match[1];
    if (typeof repo !== 'undefined' && repo) {
        var githubRepo = BotConfig.repos[repo];
        console.log(githubRepo);
        if (githubRepo) {
            githubGetPullRequest(githubRepo, bot, message);
        } else if (repo == 'all') {
            for (var r in BotConfig.repos) {
                githubGetPullRequest(BotConfig.repos[r], bot, message);
            }
        } else {
            bot.reply(message, "Invalid request or Repo not configured");
        }
    } else {
        bot.reply(message, "Invalid request or Repo not configured");
    }
});

// Make a POST call to GITHUB API to fetch all OPEN PR's
function githubGetPullRequest(repo, bot, message) {
    console.log("Making a POST call to GITHUB API to fetch all OPEN PR's...");
    var token = BotConfig.auth_token;
    var request = require('request');
    var url = BotConfig.github_api_url + 'repos/' + BotConfig.repo_org + repo + '/pulls?state=open';
    console.log(url);
    request({
        headers: {
            'Accept': 'application/vnd.github.v3+json',
            'Authorization': token,
            'User-Agent': 'GitBit-slackbot'
        },
        uri: url,
        method: 'GET'
    }, function(err, res, body) {
        parseAndResponse(body, bot, message, repo);
    });
}

// Parse the pull response json and extract PR#, Title, User out of it.
function parseAndResponse(body, bot, message, repo) {
    var repoSource = BotConfig.repo_org + repo + " Open Pull Requests : \n";
    bot.reply(message, repoSource);
    console.log("Parsing the pull response json and extracting PR#, Title, User out of it...");
    var obj = JSON.parse(body);
    var objLength = obj.length;
    var response = "";
    if (objLength == 0) {
        response += "No open PR's @ the moment ! Are you guys coding ?"
    } else {
        for (var i = 0; i < objLength; i++) {
            response += "PR # " + obj[i].number + " - " + obj[i].title + " by " + obj[i].user.login + "\n";
        }
    }
    bot.reply(message, response);
    console.log(response);
}