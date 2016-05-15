# GitBit Slack Bot

## The story of GitBit (Slack) bot
We at Braintree/PayPal have tradition of having every alternate Fridays as Developer Days. This day (one of the most exciting day of the sprint for me) is like a mini hack day. You can spent time learning something new/reading/coding something new. One of the Dev Days I deecided to write my first ever Bot (Slack Bot). And here it is !!

## What is GitBit Slack Bot or What does it do ?
GitBit Slack Bot is a Bot for Slack teams that they can configure and quickly have a look at open pull requests in their configured repositories. 

## Setup Instructions
1. Fork this project.
2. Open up your favorite terminal app, and clone your new repository to your local computer.
3. This is a Node.js project, so you’ll need to install the various dependencies by running: npm install to get all the node_modules
4. Rename `config.clone.json` to `config.json`. Update Organization/Repositories in `config.json`.
5. Add a bot Integration to your slack channel at https://{{$slack_channel}}.slack.com/apps/new/A0F7YS25R-bots
6. From the terminal you can run your bot easily:

    ```bash
    TOKEN=xoxb-your-token-here npm start
    ```
 (Copy token from Integration Settings >> API Token)
7. Once started Go to slack and find a new bot user "gitbit" added
8. Start talking to Bot via commands like : 
    pr all -- Display all open Pull requests in all The Github Repos configured in config.json
    pr `{$repo1_key}` -- Display all open Pull requests in the Github Repos `{$repo1_name}` configured for `{$repo1_key}` configured in `config.json`

e.g. config.json

```json
{
    "repo_org" : "paypal/",
    "github_api_url" : "https://api.github.com/",
    "auth_token" : "token your-token",
    "repos" : {
        "java" : "PayPal-Java-SDK",
        "php" : "PayPal-PHP-SDK",
        "py" : "PayPal-Python-SDK",
        "ruby" : "PayPal-Ruby-SDK",
        "node" : "PayPal-node-SDK"
    }
} 

```

## Future
Configurable Slack button coming soon @ https://vasujain.github.io/gitbitbot/

## Support/Request new features
For Support / Requesting new features -- create an issue at https://github.com/vasujain/gitbitbot/issues  
