import * as path from "path";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const historyTable = new dynamodb.Table(this, "HistoryTable", {
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "createdAt", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, // pay per use, no idle cost
      removalPolicy: cdk.RemovalPolicy.DESTROY, // deletes table on `cdk destroy` (fine for a demo)
    });

    
    const enhanceFn = new lambda.Function(this, "EnhanceFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler", // index.js → exports.handler
      code: lambda.Code.fromAsset(path.join(__dirname, "../../backend/enhance")),
      timeout: cdk.Duration.seconds(30), // default is 3s, too short for a model call
      memorySize: 256,
      environment: {
        TABLE_NAME: historyTable.tableName,
        // Copy the exact model ID from the Bedrock console (Model catalog)
        MODEL_ID: "REPLACE_WITH_BEDROCK_MODEL_ID",
      },
    });

    // Let Lambda read/write the table (CDK writes the IAM policy for you)
    historyTable.grantReadWriteData(enhanceFn);

    // Let Lambda call Bedrock models.
    // Tighten these ARNs to your specific model once it works.
    enhanceFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
        resources: [
          "arn:aws:bedrock:*::foundation-model/*",
          `arn:aws:bedrock:*:${this.account}:inference-profile/*`,
        ],
      })
    );

    // ─────────────────────────────────────────────
    // 3. API Gateway: public POST /enhance endpoint
    // ─────────────────────────────────────────────
    const api = new apigw.RestApi(this, "CvEnhancerApi", {
      restApiName: "cv-enhancer-api",
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS, // later: restrict to your website domain
        allowMethods: ["POST", "OPTIONS"],
        allowHeaders: ["Content-Type"],
      },
      deployOptions: {
        stageName: "prod",
        throttlingRateLimit: 5, // max requests per second (protects your Bedrock bill)
        throttlingBurstLimit: 10,
      },
    });

    const enhance = api.root.addResource("enhance");
    enhance.addMethod("POST", new apigw.LambdaIntegration(enhanceFn));

    // ─────────────────────────────────────────────
    // 4. Frontend: private S3 bucket + CloudFront (HTTPS)
    // ─────────────────────────────────────────────
    const siteBucket = new s3.Bucket(this, "SiteBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, // only CloudFront can read it
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const distribution = new cloudfront.Distribution(this, "SiteDistribution", {
      defaultRootObject: "index.html",
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      // Custom domain later: add `domainNames` + `certificate` (ACM cert in us-east-1)
    });

    // Upload ../frontend files to the bucket on every deploy and clear the CDN cache
    new s3deploy.BucketDeployment(this, "DeploySite", {
      sources: [s3deploy.Source.asset(path.join(__dirname, "../../frontend"))],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ["/*"],
    });

    // ─────────────────────────────────────────────
    // 5. Outputs: printed in the terminal after `cdk deploy`
    // ─────────────────────────────────────────────
    new cdk.CfnOutput(this, "ApiUrl", { value: api.urlForPath("/enhance") });
    new cdk.CfnOutput(this, "WebsiteUrl", {
      value: `https://${distribution.distributionDomainName}`,
    });
  }
}