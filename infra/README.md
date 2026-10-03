# Welcome to your CDK TypeScript project

This is a blank project for CDK development with TypeScript.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

* `npm run build`   type-check the project
* `npm run watch`   watch for changes and type-check
* `npm run test`    perform the jest unit tests
* `npx cdk deploy`  deploy this stack to your default AWS account/region
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template
2. No rate limit means someone could run up your Bedrock bill. Your POST endpoint is public, and every call costs money. A script hitting it in a loop could cost you real money. Add throttling to the API:

3. Least privilige protocol for lambda database and bedrock 
4. set up an AWS Budgets alert (Billing → Budgets) for something like $10/month so you get an email if costs spike. It takes two minutes and is worth doing for any public project. 
5. Timeout for lambda funciton set to 25 seconds since api gateway has its own timout of 30 seconds we want lambda to be able to finish processing before its timeout 
6. CORS allows any website. The code above restricts it to your domain. Update the header in both Lambda files to match:

javascript
"Access-Control-Allow-Origin": "https://cvenhancer.shruti-singla.com",

CORS doesn't stop scripts or curl, only other websites' JavaScript, which is why throttling (#2) still matters.