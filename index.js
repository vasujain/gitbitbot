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

var slackTokenEncrypted = BotConfig.admin_config.slack.slack_token_encrypted;
var slackTokenBuf = new Buffer(slackTokenEncrypted, 'base64');
var token = slackTokenBuf.toString("ascii");
console.log(token);

//default config variable would be read from config.json, would be overwrite, if custom config found
var REPO_ORG = BotConfig.github_pull_requests.repo_org;
var GITHUB_API_URL = BotConfig.github_pull_requests.api_url;
var GITHUB_AUTH_TOKEN = BotConfig.github_pull_requests.auth_token;
var MAX_PAGE_COUNT = BotConfig.github_pull_requests.max_page_count;
var DISPLAY_ZERO_PR_REPO = BotConfig.github_pull_requests.display_zero_pr_repo;
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
        DISPLAY_ZERO_PR_REPO = message.resource.DISPLAY_ZERO_PR_REPO;
        authTokenDecrypted = "token " + new Buffer(GITHUB_AUTH_TOKEN, 'base64').toString("ascii");
    });
}

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
    helpCommand += ":pushpin: user {username} - Get details for a corp user. \n";
    helpCommand += ":pushpin: rally {username} - Get tasks for a rally user. \n";
    helpCommand += ":pushpin: changelog - Get changelog for bot. \n";
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
    console.log("Hello Human !! ");
    bot.reply(message, 'Hello!');
});

controller.hears('pr (.*)', ['direct_mention', 'mention', 'direct_message'], function(bot, message) {
    console.log("GitHub PR !! ");
    var repo = message.match[1];
    if (typeof repo !== 'undefined' && repo) {
        var githubRepo = BotConfig.github_pull_requests.repos[repo];
        //Check and throw error if team is invalid -- Object.keys(bb.repos.teams).length
        if (isValidTeam(repo, Object.keys(BotConfig.github_pull_requests.repos.teams))) {
            var key = repo,
                teamRepos;
            BotConfig.github_pull_requests.repos.teams.some((v) => Object.keys(v).indexOf(key) !== -1 && (teamRepos = v[key]), teamRepos);
            teamRepos.forEach(function(teamRepo) {
                githubGetPullRequest(teamRepo, bot, message);
            });
        } else if (repo == 'all') {
            getListOfAllGithubReposInOrg(bot, message);
        } else if (isValidRepo(repo, BotConfig.github_pull_requests.repos)) {
            githubGetPullRequest(repo, bot, message);
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

controller.hears(['jira issues (.*)', 'jira issue (.*)', 'jira (.*)'], ['direct_mention', 'mention', 'direct_message'], function(bot, message) {
    console.log("Jira issues !! ");
    var assignee = message.match[1];
    if (typeof assignee !== 'undefined' && assignee) {
        getJiraIssues(bot, message, assignee);
    } else {
        botErrorHandler("assignee is undefined -- Invalid request or assignee does not exist", bot, message, assignee);
    }
});

controller.hears(['user (.*)', 'pp (.*)', 'paypal (.*)', 'bridge (.*)'], ['direct_mention', 'mention', 'direct_message'], function(bot, message) {
    console.log("Corp User Details!! ");
    var user = message.match[1];
    getCorpUserDetails(bot, message, user);
});

controller.hears(['rally tasks (.*)', 'rally task (.*)', 'rally (.*)'], ['direct_mention', 'mention', 'direct_message'], function(bot, message) {
    console.log("Rally User tasks!! ");
    var user = message.match[1];
    getRallyUserTasks(bot, message, user);
});

controller.hears(['dev', 'developer', 'architect'], ['direct_mention', 'mention', 'direct_message'], function(bot, message) {
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

controller.hears(['change', 'changelog', 'version'], ['direct_mention', 'mention', 'direct_message'], function(bot, message) {
    console.log("changelog !!");
    parseChangeLog(bot, message);
});

/* ************************* HTTP Methods ******************************** */

// Make a POST call to GITHUB API to fetch all OPEN PR's
function githubGetPullRequest(repo, bot, message) {
    console.log("*** Invoking githubGetPullRequest ... ***");
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
        parseAndResponse(body, bot, message, repo);
    });
    console.log("*** Invoked githubGetPullRequest successfully. ***");
}

// Make a POST call to GITHUB API to fetch all Issues with specific Label's
function githubGetIssuesWithLabel(repo, repoOrg, bot, message, label) {
    console.log("*** Invoking githubGetIssuesWithLabel ... ***");
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
        parseAndResponseIssuesJson(body, bot, message, repo, repoOrg, label);
    });
    console.log("*** Invoked githubGetIssuesWithLabel successfully. ***");
}

function getStackoverflowIssues(bot, message) {
    console.log("*** Invoking getStackoverflowIssues ... ***");
    var zlib = require("zlib");
    var https = require('https'); //Use NodeJS https module
    var url = BotConfig.stackoverflow.api_url + '2.2/search' + '?order=' + BotConfig.stackoverflow.order + '&sort=' + BotConfig.stackoverflow.sort + '&tagged=' + BotConfig.stackoverflow.tag + '&intitle=' + BotConfig.stackoverflow.intitle + '&site=' + BotConfig.stackoverflow.site;
    https.get(url, function(response) {
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
                botErrorHandler(e, bot, message)
            });
        } else {
            console.log("Error");
        }
    });
    console.log("*** Invoked getStackoverflowIssues successfully. ***");
}

function getJiraIssues(bot, message, assignee) {
    console.log("*** Invoking getJiraIssues ... ***");
    var authToken = 'Basic ' + BotConfig.jira.auth_token;
    var apiPath = BotConfig.jira.search_api_jql + assignee;
    var apiUrl = BotConfig.jira.api_url;
    var http = require("https");

    var options = {
        "method": "GET",
        "hostname": apiUrl,
        "port": null,
        "path": apiPath,
        "headers": {
            "authorization": authToken
        }
    };

    var req = http.request(options, function(res) {
        var chunks = [];
        res.on("data", function(chunk) {
            chunks.push(chunk);
        });
        res.on("end", function() {
            var body = Buffer.concat(chunks);
            parseAndResponseJiraJson(body.toString(), bot, message);
        });
    });
    req.end();
    console.log("*** Invoked getJiraIssues successfully. ***");
}

function getCorpUserDetails(bot, message, user) {
    console.log("*** Invoking getCorpUserDetails ... ***");
    var apiPath = BotConfig.user.user_profile + BotConfig.user.get_details_api + BotConfig.user.auth_token + "/corp/" + user;
    var http = require("https");

    var options = {
        "hostname": BotConfig.user.api_url,
        "method": "GET",
        "port": null,
        "rejectUnauthorized": false, 
        "path": apiPath
    };

    var req = http.request(options, function(res) {
        var chunks = [];
        res.on("data", function(chunk) {
            chunks.push(chunk);
        });
        res.on("end", function() {
            var body = Buffer.concat(chunks);
            parseAndResponseCorpUserDetailsJson(body.toString(), bot, message);
        });
    });
    req.end();
    console.log("*** Invoked getCorpUserDetails successfully. ***");
}

// Getting list of all Github Repos in an Org. Can be 100+. For the initial phase only top 100 results will display
function getListOfAllGithubReposInOrg(bot, message) {
    console.log("*** Invoking getListOfAllGithubReposInOrg ... ***");
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
    console.log("*** Invoked getListOfAllGithubReposInOrg successfully. ***");
}

function getRallyUserTasks(bot, message, user) {
    console.log("*** Invoking getRallyUserTasks ... ***");
    var path = BotConfig.rally.task_query_api + "((" + BotConfig.rally.filter_owner + "%20=%20" + user + "@" + BotConfig.rally.user_domain + ")%20and%20(" +  BotConfig.rally.filter_state + "%20!=%20" + BotConfig.rally.status_filter_state + "))&" + BotConfig.rally.query_params;
    console.log("path: " + path);
    
    var http = require("https");
    var options = {
      "method": "GET",
      "hostname": BotConfig.rally.api_url,
      "port": null,
      "path": path,
      "headers": {
        "zsessionid": BotConfig.rally.api_key
       }
    };
    
    var req = http.request(options, function (res) {
      var chunks = [];

      res.on("data", function (chunk) {
        chunks.push(chunk);
      });

      res.on("end", function () {
        var body = Buffer.concat(chunks);
        parseAndResponseRallyUserTasksJson(bot, message, body.toString(), user);
      });
    });

    req.end();
    console.log("*** Invoked getRallyUserTasks successfully. ***");
}

/* ************************* API RESPONSE PARSERS ******************************** */
// Parse the pull response json and extract PR#, Title, User out of it.
function parseAndResponse(body, bot, message, repo) {
    console.log("*** Invoking parseAndResponse ... ***");
    var repoSource = ":shipit: " + REPO_ORG + repo + " Open Pull Requests : ";
    var response = "";
    var obj = JSON.parse(body);
    var objLength = obj.length;
    if (obj.length == 0) {
        response += "No open PR's @ the moment !";
    } else {
        for (var i = 0; i < objLength; i++) {
            response += "\n :construction: PR # " + obj[i].number + " - " + obj[i].title + " by " + obj[i].user.login;
        }
    }
    bot.reply(message, {
        "attachments": [{
            "fallback": repoSource,
            "color": "#36a64f",
            "title": repoSource,
            "text": response
        }]
    });
    console.log("*** Invoked parseAndResponse for " + repo + " with " + objLength + " PR'(s) executed successfully. ***");
}

// Parse the issue response json and extracting details out of it.
function parseAndResponseIssuesJson(body, bot, message, repo, repoOrg, label) {
    console.log("*** Invoking parseAndResponseIssuesJson ... ***");
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
    } else {
        response += "\n No Issues found for this label !";
    }
    console.log(response);
    console.log("*** Invoked parseAndResponseIssuesJson for " + repo + " with " + objLength + " Issues'(s) executed successfully.***");
}

function parseAndResponseSOFJson(body, bot, message) {
    console.log("*** Invoking parseAndResponseSOFJson ... ***");
    var obj = JSON.parse(body);
    var objLength = obj.items.length;
    var sofHeader = ":fire_engine: Current Issues with label : " + BotConfig.stackoverflow.tag;
    var response = "";
    if (objLength > 0) {
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
    } else {
        response += "\n No Issues found for the label !";
    }

    bot.reply(message, {
        "attachments": [{
            "fallback": sofHeader,
            "color": "#36a64f",
            "title": sofHeader,
            "text": response
        }]
    });
    console.log("*** Invoked parseAndResponseSOFJson successfully. ***");
}

function parseAndResponseJiraJson(body, bot, message) {
    console.log("*** Invoking parseAndResponseJiraJson ... ***");
    var jiraHeader = ":fire_engine: Current Issues : ";
    var response = "";
    try {
        //TODO: Add wait time
        var obj = JSON.parse(body);
        var objLength = obj.total;
        if (objLength > 0) {
            for (var i = 0; i < objLength; i++) {
                if (obj.issues[i].fields.status.name != "Closed") {
                    var issue_icon = ":no_entry:";
                    response += "\n " + issue_icon + " Ticket # " + obj.issues[i].key + " - " + obj.issues[i].fields.description;
                    response += "\n " + BotConfig.jira.static_url + obj.issues[i].key;
                    console.log("Status: " + obj.issues[i].key + " " + obj.issues[i].fields.status.name);
                }
            }
        } else {
            response += "\n No Issues found for this user !";
        }
    } catch (e) {
        response += "\n Unable to parse response JSON - " + e;
    }

    bot.reply(message, {
        "attachments": [{
            "fallback": jiraHeader,
            "color": "#36a64f",
            "title": jiraHeader,
            "text": response
        }]
    });
    console.log("*** Invoked parseAndResponseJiraJson successfully. ***");
}

// Parse the Org Repos response json and extracting Repo details out of it.
function constructAllGithubRepoObject(body, bot, message) {
    console.log("*** Invoking constructAllGithubRepoObject ... ***");
    var orgGithubRepo = new Array();
    var obj = JSON.parse(body);
    var objLength = obj.length;
    for (var i = 0; i < objLength; i++) {
        orgGithubRepo.push(obj[i].name);
        githubGetPullRequest(obj[i].name, bot, message, false);
    }
    console.log("*** Invoked constructAllGithubRepoObject successfully. ***");
}

function parseAndResponseCorpUserDetailsJson(body, bot, message) {
    console.log("Invoking parseAndResponseCorpUserDetailsJson...");
    var userHeader = ":lock_with_ink_pen: Corp User Details: ";
    var response = "";
    try {
        var obj = JSON.parse(body);
        if(obj.DisplayName == null) {
            botErrorHandler("Unable to find the corp user", bot, message);
        } else {
            response += "\n " + ":simple_smile:" + " DisplayName : " + obj.DisplayName;
            response += "\n " + ":neckbeard:" + " SAMAccount : " + obj.SAMAccount;
            response += "\n " + ":email:" + " Email : " + obj.Email;
            response += "\n " + ":octocat:" + " JobTitle : " + obj.JobTitle;
            response += "\n " + ":books:" + " Department : " + obj.Department;
            response += "\n " + ":telephone:" + " Telephone : " + obj.Telephone;
            response += "\n " + ":office:" + " Location : " + obj.Location;
            response += "\n " + ":factory:" + " Company : " + obj.Company;
            response += "\n " + ":sunglasses:" + " ManagerDisplayName : " + obj.ManagerDisplayName;
            response += "\n " + ":space_invader:" + " ManagerSAMAccount : " + obj.ManagerSAMAccount;
            response += "\n " + ":bridge_at_night:" + " Bridge URL : " +  "https://bridge.paypalcorp.com/profile/" + obj.SAMAccount;
            
            // Setting Slack output within conditional flow to avoid duplicate notifications 
            bot.reply(message, {
                "attachments": [{
                    "fallback": userHeader,
                    "color": "#36a64f",
                    "title": userHeader,
                    "text": response
                }]
            });
        }       
    } catch (e) {
        console.log("\n Unable to parse response JSON - " + e);
    }
    console.log("*** Invoked parseAndResponseCorpUserDetailsJson successfully. ***");
}

function parseAndResponseRallyUserTasksJson(bot, message, body, user) {
    console.log("*** Parsing the Rally response json.... ***");    
    var userHeader = ":lock_with_ink_pen: Corp User Details: ";
    var response = "";
    var rallyHeader = "User Tasks for " + user + "...";    
    var obj = JSON.parse(body);
    var objLength = obj.QueryResult.Results.length;
    var response = "";
    if (objLength == 0) {
        response += "No results @ the moment !";
    } else {
        for (var i = 0; i < objLength; i++) {
            response += " :memo: " + (i+1) + ". ";
            var taskUrl = obj.QueryResult.Results[i]._ref;
            if(obj.QueryResult.Results[i].Project != null) {
                var projectId = projectId = obj.QueryResult.Results[i].Project._ref.substr(obj.QueryResult.Results[i].Project._ref.indexOf('project/'));
                var taskId = projectId = obj.QueryResult.Results[i].ObjectID;
                taskUrl = BotConfig.rally.https_url + projectId + "/detail/task/" + taskId;
                response += obj.QueryResult.Results[i].Project._refObjectName + "-" 
            }
            if(obj.QueryResult.Results[i].Iteration != null) {
                response += obj.QueryResult.Results[i].Iteration._refObjectName + ": ";
            }
            response += obj.QueryResult.Results[i]._refObjectName;
            response += " " + taskUrl + "\n";
        }
    }
    bot.reply(message, {
        "attachments": [{
            "fallback": rallyHeader,
            "color": "#36a64f",
            "title": rallyHeader,
            "text": response
        }]
    });
    console.log("*** Parsed the Rally response json successfully. ***");
}

function parseChangeLog(bot, message) {
    console.log("*** Parsing the Changelog response json.... ***");    
    var changeLogObj = BotConfig.change_log;
    var response = "";
    var changeHeader = "Change log for the Bot: ";
    for(var i=0; i<changeLogObj.length; i++) {
        response += BotConfig.change_log[i].version + ": " + BotConfig.change_log[i].change + "\n";
    }
    bot.reply(message, {
        "attachments": [{
            "fallback": changeHeader,
            "color": "#36a64f",
            "title": changeHeader,
            "text": response
        }]
    });
    console.log("*** Parsed the Changelog response successfully. ***");
}

/* ************************* Utility Methods ******************************** */
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
    console.log("*** Checking if a Valid team name is slected in slack channel.... ***");    
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

// Check if a Valid repo slected in slack channel. Matches with config.json 
function isValidRepo(repo, repos) {
    console.log("*** Checking if a Valid repo is slected in slack channel.... ***");    
    var reposLength = repos.teams.length;
    for (var repoList = 0; repoList < reposLength; repoList++) {
        var repoTeam = Object.keys(repos.teams[repoList]);
        console.log("repoTeam: - " + repoTeam);
        var teamRepos = repos.teams[repoList][repoTeam];
        var repoTeamLength = repos.teams[repoList][repoTeam].length;
        for (var i = 0; i < teamRepos.length; i++) {
            if (teamRepos[i] == repo) {
                console.log("isValidRepo:true\n");
                return true;
            }
        }
    }
    console.log("isValidRepo:false\n");
    return false;
}

function getYelpDetails(bot, message) {
    //Yelp reference : https://.io/how-to-use-yelps-api-with-node/
    console.log("*** getYelpDetails invoked ... ***");
    /* require the modules needed */
    var oauthSignature = require('oauth-signature');  
    var n = require('nonce')();  
    var request = require('request');  
    var qs = require('querystring');  
    var _ = require('lodash');

    /* We set the require parameters here */
    var required_parameters = {
        oauth_consumer_key : BotConfig.yelp.oauth_consumer_key,
        oauth_token : BotConfig.yelp.oauth_token,
        oauth_nonce : n(),
        oauth_timestamp : n().toString().substr(0,10),
        oauth_signature_method : 'HMAC-SHA1',
        oauth_version : '1.0'
    };

    console.log("required_parameters ..." + required_parameters);

    var http = require("https");
    var httpMethod = 'GET';
    var url = 'http://api.yelp.com/v2/search';

    /* We can setup default parameters here */
      var default_parameters = {
        location: 'San+Jose'
      };

    /* We combine all the parameters in order of importance */ 
    var parameters = _.assign(default_parameters, required_parameters);
    
    /* We set our secrets here */
    var consumerSecret = BotConfig.yelp.consumer_secret;
    var tokenSecret = BotConfig.yelp.token_secret;

    /* Then we call Yelp's Oauth 1.0a server, and it returns a signature */
    /* Note: This signature is only good for 300 seconds after the oauth_timestamp */
    var signature = oauthSignature.generate(httpMethod, url, parameters, consumerSecret, tokenSecret, { encodeSignature: false});
    
    console.log("signature ..." + signature);
        
    parameters.oauth_signature = signature;
    var paramURL = qs.stringify(parameters);
    var apiURL = url+'?'+paramURL;

    console.log("apiURL ..." + apiURL);

    /* Then we use request to send make the API Request */
      request(apiURL, function(error, response, body){
        parseAndResponseYelpData(body, bot, message);
      });
}
