/**
 * GitBit Bot for Slack ! 
 * @author: Vasu Jain
 */

// Libraries
var https = require('https');
var BotConfig = require('./config.json');
var Botkit = require("botkit");
var beepboop = require("beepboop-botkit");

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

var token = process.env.SLACK_TOKEN
var controller = Botkit.slackbot({
    debug: false
});

//slackTokenEncrypted = "eG94Yi00MjUyNzYwMzU5MC0wakp0M3JoNEc5WDN5VmNNdU1HWXRBVWM=";
//var slackTokenBuf = new Buffer(slackTokenEncrypted, 'base64');
//var token = slackTokenBuf.toString("ascii");
//console.log(token);

//default config variable would be read from config.json, would be overwrite, if custom config found
var REPO_ORG = BotConfig.repo_org;
var GITHUB_API_URL = BotConfig.github_api_url;
var GITHUB_AUTH_TOKEN = BotConfig.auth_token;
var MAX_PAGE_COUNT = BotConfig.max_page_count;

if (token) {
    console.log("Starting in single-team mode")
    controller.spawn({
        token: token
    }).startRTM(function(err, bot, payload) {
        console.log("Loaded config parameters from config.json ")
        if (err) {
            console.log(err);
            throw new Error(err);
        }
    });
} else {
    console.log("Starting in Beep Boop multi-team mode")
    var beepboopboop = require('beepboop-botkit').start(controller, {
        debug: true
    });
    //Not working :(
    beepboopboop.on('add_resource', function(message) {
        console.log("Loading config parameters from Custom bot Config")
        REPO_ORG = message.resource.REPO_ORG;
        GITHUB_API_URL = message.resource.GITHUB_API_URL;
        GITHUB_AUTH_TOKEN = message.resource.GITHUB_AUTH_TOKEN;
        MAX_PAGE_COUNT = message.resource.MAX_PAGE_COUNT;
    });
}
console.log("REPO_ORG-" + REPO_ORG + " GITHUB_API_URL--" + GITHUB_API_URL + " GITHUB_AUTH_TOKEN-" + GITHUB_AUTH_TOKEN + " MAX_PAGE_COUNT-" + MAX_PAGE_COUNT);

var authTokenEncrypted = GITHUB_AUTH_TOKEN;
//var authTokenDecrypted = "token " + Buffer.from(authTokenEncrypted, 'base64').toString("ascii");
// For Node.js v5.11.1 and below
var buf = new Buffer(authTokenEncrypted, 'base64');
var authTokenDecrypted = "token " + buf.toString("ascii");

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
            botErrorHandler("Invalid Repo or Repo not configured", bot, message);
        }
    } else {
        botErrorHandler("Repo is undefined -- Invalid request or Repo not configured", bot, message);
    }
});

// Make a POST call to GITHUB API to fetch all OPEN PR's
function githubGetPullRequest(repo, bot, message, flagZeroPRComment) {
    console.log("Making a POST call to GITHUB API to fetch all OPEN PR's...");
    var request = require('request');
    var url = GITHUB_API_URL + 'repos/' + REPO_ORG + repo + '/pulls?state=open';
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
    //    console.log(body);    
    var repoSource = ":shipit: " + REPO_ORG + repo + " Open Pull Requests : ";
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
        for (var i = 0; i < objLength; i++) {
            response += "\n :construction: PR # " + obj[i].number + " - " + obj[i].title + " by " + obj[i].user.login;
        }
        bot.reply(message, {
            "attachments": [{
                "fallback": repoSource,
                "color": "#36a64f",
                "title": repoSource,
                "text": response
            }]
        });
    }
    console.log(response);
    console.log("parseAndResponse for " + repo + " with " + objLength + " PR'(s) executed successfully.");
}

// Getting list of all Github Repos in an Org. Can be 100+. For the initial phase only top 100 results will display
function getListOfAllGithubReposInOrg(bot, message) {
    console.log("Getting list of all Github Repos in an Org. Can be 100+....");
    var ghArray = new Array();
    var url = GITHUB_API_URL + 'orgs/' + REPO_ORG + 'repos?per_page=' + MAX_PAGE_COUNT;
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
        if (err)
            botErrorHandler(err, bot, message);
        else
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

function botErrorHandler(err, bot, message) {
    console.log("\n" + err);
    var errText = ":rotating_light: " + err;
    bot.reply(message, {
        "attachments": [{
            "fallback": err,
            "color": "#FF0000",
            "title": Error,
            "text": errText
        }]
    });
    process.exit(1);
}