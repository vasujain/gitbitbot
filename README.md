# GitBit Slack Bot

## Setup
1. Clone the repository
2. Navigate to cloned repo
3. Do a npm instll to get all the node_modules
4. Rename config.clone.json to config.json . Update Org/Repo in config.
5. Add a bot Integration to your slack channel at https://{{$slack_channel}}.slack.com/apps/new/A0F7YS25R-bots
6. From the cloned repo run the command -- TOKEN={{$token}} npm start  (Copy token from Integration Settings >> API Token)
6. Once started Go to slack and find a new bot user "gitbit" added
7. Start talking to Bot via commands like : 
    pr all -- Display all open Pull requests in all The Github Repos configured in config.json
    pr {$repo1_key} -- Display all open Pull requests in the Github Repos {$repo1_name} configured for {$repo1_key} configured in config.json

Request new features at https://github.com/vasujain/gitbitbot/issues  
