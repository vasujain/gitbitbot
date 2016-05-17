/**
 * GitBit Bot for Slack ! 
 * @author: Vasu Jain
 */

// Libraries
var https = require('https');
var BotConfig = require('./config.json');

var authTokenEncrypted = BotConfig.auth_token;
//var authTokenDecrypted = "token " + Buffer.from(authTokenEncrypted, 'base64').toString("ascii");

// For Node.js v5.11.1 and below
var buf = new Buffer(authTokenEncrypted, 'base64');
var authTokenDecrypted = "token " + buf.toString("ascii");

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
controller.on('rtm_open', function(bot, message) {
    console.log('** The RTM api just connected!');
                getListOfAllGithubReposInOrg(bot, message);

});

controller.on('rtm_close', function(bot) {
    console.log('** The RTM api just closed');
    // you may want to attempt to re-open
});

// Core bot logic !
controller.on('bot_channel_join', function(bot, message) {
    bot.reply(message, "Thank you for inviting me to your Slack Channel!")
});

controller.hears(['hello', 'hi', 'greetings'], ['direct_mention', 'mention', 'direct_message'], function(bot, message) {
    bot.reply(message, 'Hello!');
});

controller.hears('pr (.*)', ['direct_mention', 'mention', 'direct_message'], function(bot, message) {
    var repo = message.match[1];
    if (typeof repo !== 'undefined' && repo) {
        var githubRepo = BotConfig.repos[repo];
        var flagZeroPRComment = false;
        if (githubRepo) {
            flagZeroPRComment = true;
            githubGetPullRequest(githubRepo, bot, message, flagZeroPRComment);
        } else if (repo == 'custom') {
            for (var r in BotConfig.repos) {
                githubGetPullRequest(BotConfig.repos[r], bot, message, flagZeroPRComment);
            }
        } else if (repo == 'all') {
            getListOfAllGithubReposInOrg(bot, message);
        } else {
            bot.reply(message, "Invalid Repo or Repo not configured");
        }
    } else {
        bot.reply(message, "Repo is undefined -- Invalid request or Repo not configured");
    }
});

// Make a POST call to GITHUB API to fetch all OPEN PR's
function githubGetPullRequest(repo, bot, message, flagZeroPRComment) {
    console.log("Making a POST call to GITHUB API to fetch all OPEN PR's...");
    var request = require('request');
    var url = BotConfig.github_api_url + 'repos/' + BotConfig.repo_org + repo + '/pulls?state=open';
    console.log(url);
    request({
        headers: {
            'Accept': 'application/vnd.github.v3+json',
            'Authorization': authTokenDecrypted,
            'User-Agent': 'GitBit-slackbot'
        },
        uri: url,
        method: 'GET'
    }, function(err, res, body) {
        parseAndResponse(body, bot, message, repo, flagZeroPRComment);
    });
}

// Parse the pull response json and extract PR#, Title, User out of it.
function parseAndResponse(body, bot, message, repo, flagZeroPRComment) {
    console.log("Parsing the pull response json and extracting PR#, Title, User out of it...");
    var repoSource = BotConfig.repo_org + repo + " Open Pull Requests : ";
    var response = "";
    var obj = JSON.parse(body);
    var objLength = obj.length;
    if (objLength == 0) {
        if (!BotConfig.disable_zero_pr_repo) { //if false, then only display Repo with Zero PR 
            response = repoSource;
            if (flagZeroPRComment) {
                response += "No open PR's @ the moment ! Are you guys coding ?"
            } else {
                response += "0."
            }
            bot.reply(message, response);
        }
    } else {
        response = repoSource;
        for (var i = 0; i < objLength; i++) {
            response += "\nPR # " + obj[i].number + " - " + obj[i].title + " by " + obj[i].user.login;
            bot.reply(message, response);
        }
    }
    console.log(response);
    console.log("parseAndResponse for " + repo + " with " + objLength + " PR'(s) executed successfully.");
}

// Getting list of all Github Repos in an Org. Can be 100+. For the initial phase only top 100 results will display
function getListOfAllGithubReposInOrg(bot, message) {
    console.log("Getting list of all Github Repos in an Org. Can be 100+....");
    var ghArray = new Array();
    var url = BotConfig.github_api_url + 'orgs/' + BotConfig.repo_org + 'repos?per_page=' + BotConfig.max_page_count;
    console.log(url);
    var request = require('request');
    request({
        headers: {
            'Accept': 'application/vnd.github.v3+json',
            'Authorization': authTokenDecrypted,
            'User-Agent': 'GitBit-slackbot'
        },
        uri: url,
        method: 'GET'
    }, function(err, res, body) {
        ghArray = constructAllGithubRepoObject(body, bot, message);
    });
    console.log("getListOfAllGithubReposInOrg executed successfully.\n");
}

// Parse the Org Repos response json and extracting Repo details out of it.
function constructAllGithubRepoObject(body, bot, message) {
    console.log("Parsing the Org Repos response json and extracting Repo details out of it...");
    var orgGithubRepo = new Array();
    var obj = JSON.parse(body);
    var objLength = obj.length;
    for (var i = 0; i < objLength; i++) {
        orgGithubRepo.push(obj[i].name);
        githubGetPullRequest(obj[i].name, bot, message, false);
    }
    console.log("constructAllGithubRepoObject executed successfully.\n");
}

