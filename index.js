/**
 * GitBit Bot for Slack ! 
 * @author: Vasu Jain
 */

// Libraries
var https = require('https');
var BotConfig = require('./config.json');
var Botkit = require("botkit");
var beepboop = require("beepboop-botkit");
var teamMap = Object.create(null);

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
        })
    };
} else {
    config = {
        json_file_store: ((process.env.TOKEN) ? './db_slack_bot_ci/' : './db_slack_bot_a/') //use a different name if an app or CI
    };
}

var token = process.env.SLACK_TOKEN;
var controller = Botkit.slackbot({
    debug: false
});

var slackTokenEncrypted = "eG94Yi00MjUyNzYwMzU5MC1DZ21YWXMxNk1RdXYyeVE2YTFORG1nalc=";
var slackTokenBuf = new Buffer(slackTokenEncrypted, 'base64');
var token = slackTokenBuf.toString("ascii");
console.log(token);

//default config variable would be read from config.json, would be overwrite, if custom config found
var REPO_ORG = BotConfig.github_pull_requests.repo_org;
var GITHUB_API_URL = BotConfig.github_pull_requests.api_url;
var GITHUB_AUTH_TOKEN = BotConfig.github_pull_requests.auth_token;
var MAX_PAGE_COUNT = BotConfig.github_pull_requests.max_page_count;
var DISABLE_ZERO_PR_REPO = BotConfig.github_pull_requests.disable_zero_pr_repo;
var authTokenDecrypted = "token " + new Buffer(GITHUB_AUTH_TOKEN, 'base64').toString("ascii");
var GITHUB_ISSUES_API_URL = BotConfig.github_issues.api_url;
var GITHUB_ISSUES_STATE = BotConfig.github_issues.issue_state;


if (token) {
    console.log("Starting in single-team mode");
    controller.spawn({
        token: token
    }).startRTM(function(err, bot, payload) {
        console.log("Loaded config parameters from config.json ");
        if (err) {
            console.log(err);
            throw new Error(err);
        }
    });
} else {
    console.log("Starting in Beep Boop multi-team mode");
    var beepboopboop = require('beepboop-botkit').start(controller, {
        debug: true
    });
    beepboopboop.on('add_resource', function(message) {
        console.log("Loading config parameters from Custom bot Config");
        REPO_ORG = message.resource.REPO_ORG;
        GITHUB_API_URL = message.resource.GITHUB_API_URL;
        GITHUB_AUTH_TOKEN = message.resource.GITHUB_AUTH_TOKEN;
        MAX_PAGE_COUNT = message.resource.MAX_PAGE_COUNT;
        DISABLE_ZERO_PR_REPO = message.resource.DISABLE_ZERO_PR_REPO;
        authTokenDecrypted = "token " + new Buffer(GITHUB_AUTH_TOKEN, 'base64').toString("ascii");
    });
}
//For debugging purposes
//console.log("REPO_ORG-" + REPO_ORG + " GITHUB_API_URL--" + GITHUB_API_URL);

// Handle events related to the websocket connection to Slack
controller.on('rtm_open', function(bot) {
    console.log('** The RTM api just connected!');
});

controller.on('rtm_close', function(bot) {
    console.log('** The RTM api just closed');
    // you may want to attempt to re-open
});

/* ************************* SLACK BOT CONTROLLER ******************************** */
// Core bot logic !
controller.hears('help', ['direct_mention', 'mention', 'direct_message'], function(bot, message) {
    console.log("Help !! -- Listing all the supported commands ...");
    var helpMsg = ":point_right: Use the following commands to use GitBit.\n";
    var helpCommand = "";
    helpCommand += ":pushpin: help - Gets list of all commands you can use with GitBit. \n";
    helpCommand += ":pushpin: pr {team_name} - Gets pull request for all repos for your team e.g. 'pr pelican'. \n";
    helpCommand += ":pushpin: pr custom - Gets pull request for all repos for your custom team. \n";
    helpCommand += ":pushpin: pr all - Gets pull request for all repos in your organization. \n";
    helpCommand += ":pushpin: github issues - Gets list of all Github issues in a repo with issue-label. \n";
    helpCommand += ":pushpin: sof issues - Get list of Stackoverflow questions with tag and intitle word. \n";
    helpCommand += ":pushpin: dev - Get Developer details. \n";
    bot.reply(message, {
        "attachments": [{
            "fallback": helpCommand,
            "color": "#FFFF00",
            "title": helpMsg,
            "text": helpCommand
        }]
    });
});

controller.on('bot_channel_join', function(bot, message) {
    bot.reply(message, "Thank you for inviting me to your Slack Channel!");
});

controller.hears(['hello', 'hi', 'greetings'], ['direct_mention', 'mention', 'direct_message'], function(bot, message) {
    bot.reply(message, 'Hello!');
});

controller.hears('pr (.*)', ['direct_mention', 'mention', 'direct_message'], function(bot, message) {
    var repo = message.match[1];
    if (typeof repo !== 'undefined' && repo) {
        var githubRepo = BotConfig.github_pull_requests.repos[repo];
        var flagZeroPRComment = false;
        //Check and throw error if team is invalid -- Object.keys(bb.repos.teams).length
        if (isValidTeam(repo, Object.keys(BotConfig.github_pull_requests.repos.teams))) {
            var key = repo,
                teamRepos;
            BotConfig.github_pull_requests.repos.teams.some((v) => Object.keys(v).indexOf(key) !== -1 && (teamRepos = v[key]), teamRepos);
            teamRepos.forEach(function(teamRepo) {
                githubGetPullRequest(teamRepo, bot, message, flagZeroPRComment);
            });
        } else if (repo == 'all') {
            getListOfAllGithubReposInOrg(bot, message);
        } else {
            botErrorHandler("Invalid Repo or Repo not configured", bot, message);
        }
    } else {
        botErrorHandler("Repo is undefined -- Invalid request or Repo not configured", bot, message);
    }
});

controller.hears(['github issues', 'gh issues'], ['direct_mention', 'mention', 'direct_message'], function(bot, message) {
    console.log("GitHub issues !! ");
    var labels = BotConfig.github_issues.labels;
    var organizations = BotConfig.github_issues.organizations;
    var orgSize = BotConfig.github_issues.organizations.length;
    var repos = new Array();
    for (var org = 0; org < orgSize; org++) {
        var repoOrg = Object.keys(BotConfig.github_issues.organizations[org]);
        var repos = BotConfig.github_issues.organizations[org].paypal;
        console.log("repos:" + repos);
        repos.forEach(function(repo) {
            githubGetIssuesWithLabel(repo, repoOrg, bot, message, labels[0]);
        });
    }
});

controller.hears(['sof issues', 'stack overflow issues', 'stack_overflow issues'], ['direct_mention', 'mention', 'direct_message'], function(bot, message) {
    console.log("Stack Overflow issues !! ");
    getStackoverflowIssues(bot, message);
});

controller.hears(['jira issues (.*)'], ['direct_mention', 'mention', 'direct_message'], function(bot, message) {
    console.log("Jira issues !! ");
    var assignee = message.match[1];
    if (typeof assignee !== 'undefined' && assignee) {
        getJiraIssues(bot, message, assignee);
    } else {
        botErrorHandler("assignee is undefined -- Invalid request or assignee does not exist", bot, message, assignee);
    }
});

controller.hears('dev', ['direct_mention', 'mention', 'direct_message'], function(bot, message) {
    console.log("Dev !! -- Listing developer Details ...");
    var devMsg = ":octocat: Dev Details \n";
    var devCommand = "";
    devCommand += ":tada: Bot brought to life by : Vasu Jain \n";
    devCommand += ":tada: Github Repo : https://github.com/vasujain/gitbitbot. \n";
    devCommand += ":tada: Bot Support : https://github.com/vasujain/gitbitbot/issues. \n";
    bot.reply(message, {
        "attachments": [{
            "fallback": devCommand,
            "color": "#36A64F",
            "title": devMsg,
            "text": devCommand
        }]
    });
});

/* ************************* GITHUB FUNCTIONS ******************************** */
// Make a POST call to GITHUB API to fetch all OPEN PR's
function githubGetPullRequest(repo, bot, message, flagZeroPRComment) {
    console.log("Making a GET call to GITHUB API to fetch all OPEN PR's...");
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
        //console.log("repo + body" + repo + body);   //For debugging purposes
        parseAndResponse(body, bot, message, repo, flagZeroPRComment);
    });
}

// Make a POST call to GITHUB API to fetch all Issues with specific Label's
function githubGetIssuesWithLabel(repo, repoOrg, bot, message, label) {
    console.log("Making a GET call to GITHUB API to fetch all Issues With Label");
    var url = GITHUB_ISSUES_API_URL + 'repos/' + repoOrg + '/' + repo + '/issues?labels=' + label + "&state=" + GITHUB_ISSUES_STATE;
    var request = require('request');
    request({
        headers: {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'GitBit-slackbot'
        },
        uri: url,
        method: 'GET'
    }, function(err, res, body) {
        //console.log("repo + body" + repo + body); //For debugging purposes
        parseAndResponseIssuesJson(body, bot, message, repo, repoOrg, label);
    });
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

function getStackoverflowIssues(bot, message) {
    var zlib = require("zlib");
    var https = require('https'); //Use NodeJS https module
    //'https://api.stackexchange.com/2.2/search?order=desc&sort=activity&tagged=paypal&intitle=webhooks&site=stackoverflow';
    var url = BotConfig.stackoverflow.api_url + '2.2/search' + '?order=' + BotConfig.stackoverflow.order + '&sort=' + BotConfig.stackoverflow.sort + '&tagged=' + BotConfig.stackoverflow.tag + '&intitle=' + BotConfig.stackoverflow.intitle + '&site=' + BotConfig.stackoverflow.site;
    https.get(url, function(response) {
        console.log("headers: ", response.headers);
        console.log(response.statusCode)
        if (response.statusCode == 200) {
            var gunzip = zlib.createGunzip();
            var jsonString = '';
            response.pipe(gunzip);
            gunzip.on('data', function(chunk) {
                jsonString += chunk;
            });
            gunzip.on('end', function() {
                parseAndResponseSOFJson(jsonString, bot, message, BotConfig.stackoverflow.tag);
            });
            gunzip.on('error', function(e) {
                console.log(e);
            });
        } else {
            console.log("Error");
        }
    });
}

function getJiraIssues(bot, message, assignee) {
    var url = BotConfig.jira.api_url + '2/search?jql=assignee=' + assignee;
    console.log(url);
    var request = require('request');
    var jiraAuthToken = 'Basic ' + BotConfig.jira.auth_token;
    request({
        headers: {
            'Authorization': jiraAuthToken
        },
        uri: url,
        method: 'GET'
    }, function(err, res, body) {
        console.log("repo + body" + body); //For debugging purposes
        parseAndResponseJiraJson(body, bot, message);
    });
}

/* ************************* API RESPONSE PARSERS ******************************** */
// Parse the pull response json and extract PR#, Title, User out of it.
function parseAndResponse(body, bot, message, repo, flagZeroPRComment) {
    console.log("Parsing the pull response json and extracting PR#, Title, User out of it...");
    //    console.log(body);    
    var repoSource = ":shipit: " + REPO_ORG + repo + " Open Pull Requests : ";
    var response = "";
    var obj = JSON.parse(body);
    var objLength = obj.length;
    if (obj.length == 0) {
        if (!DISABLE_ZERO_PR_REPO) { //if false, then only display Repo with Zero PR 
            response = repoSource;
            if (flagZeroPRComment) {
                response += "No open PR's @ the moment ! Are you guys coding ?";
            } else {
                response += "0.";
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

// Parse the issue response json and extracting details out of it.
function parseAndResponseIssuesJson(body, bot, message, repo, repoOrg, label) {
    console.log("Parsing the issue response json and extracting details out of it...");
    var repoSource = ":fire_engine: " + repoOrg + "/" + repo + " Issues with label : " + label;
    var response = "";
    var obj = JSON.parse(body);
    var objLength = obj.length;
    if (obj.length > 0) {
        for (var i = 0; i < objLength; i++) {
            var issue_icon = "";
            if (obj[i].state == "open") {
                issue_icon = ":no_entry:";
            } else {
                issue_icon = ":white_check_mark:";
            }
            response += "\n " + issue_icon + " Issue # " + obj[i].number + " - " + obj[i].title + " by " + obj[i].user.login;
            response += "\n " + obj[i].html_url;
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
    console.log("parseAndResponseIssuesJson for " + repo + " with " + objLength + " Issues'(s) executed successfully.");
}

function parseAndResponseSOFJson(body, bot, message, tag) {
    var obj = JSON.parse(body);
    var objLength = obj.items.length;
    var sofHeader = ":fire_engine: Current Issues with label : " + BotConfig.stackoverflow.tag;
    var response = "";
    for (var i = 0; i < objLength; i++) {
        var issue_icon = "";
        if (obj.items[i].is_answered) {
            issue_icon += ":white_check_mark:";
        } else {
            issue_icon += ":no_entry:";
        }
        response += "\n " + issue_icon + " Question # " + obj.items[i].question_id + " - " + obj.items[i].title + " by " + obj.items[i].owner.display_name;
        response += "\n " + obj.items[i].link;
    }
    bot.reply(message, {
        "attachments": [{
            "fallback": sofHeader,
            "color": "#36a64f",
            "title": sofHeader,
            "text": response
        }]
    });
}

function parseAndResponseJiraJson(body, bot, message, tag) {
    var obj = JSON.parse(body);
    var objLength = obj.issues;
    var jiraHeader = ":fire_engine: Current Issues : ";
    var response = "";
    for (var i = 0; i < objLength; i++) {
        var issue_icon = ":no_entry:";
        response += "\n " + issue_icon + " Ticket # " + obj.issues[i].key + " - " + BotConfig.jira.static_url + "/" + obj.issues[i].key;
    }
    bot.reply(message, {
        "attachments": [{
            "fallback": jiraHeader,
            "color": "#36a64f",
            "title": jiraHeader,
            "text": response
        }]
    });
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

/* ************************* UTILITY FUNCTIONS ******************************** */
// Bot Error Handler
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
}

// Check if a Valid team name slected in slack channel. Matches with config.json 
function isValidTeam(repo, teamObj) {
    var teamLength = teamObj.length;
    for (var i = 0; i < teamLength; i++) {
        var teamStr = Object.keys(BotConfig.github_pull_requests.repos.teams[i]);
        if (teamStr == repo) {
            console.log("isValidRepo:true\n");
            return true;
        }
    }
    console.log("isValidRepo:false\n");
    return false;
}