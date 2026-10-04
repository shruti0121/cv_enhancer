import * as targets from 'aws-cdk-lib/aws-route53-targets';
import { Duration, Stack, StackProps } from 'aws-cdk-lib/core';
import {Construct} from 'constructs'
import * as route53  from 'aws-cdk-lib/aws-route53'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins'
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdatriggers from 'aws-cdk-lib/aws-lambda-event-sources';
import * as dynamo from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';

import { aws_codeconnections as codeconnections } from 'aws-cdk-lib'


export class InfraStack extends Stack {
  constructor (scope:Construct , id:string , props?:StackProps){ //scope - parent object (where would this stack live in the cdk tree),id-name of this stack, props → configuration options for the stack (region, account, tags, etc.) , app is entire cdk project so ususally scope is app 

    super(scope, id , props);

   


/*   -------- IAM Role for backend lambda database read -------------- */
    //  const  iamrole_database  = new iam.Role(this, "apilambdaiam_database",{
    //   assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
    //   managedPolicies: [
    //     iam.ManagedPolicy.fromAwsManagedPolicyName(
    //       "service-role/AWSLambdaBasicExecutionRole",
    //     ),
    //   ]
    //  }); 

/*   -------- IAM Role for backend lambda database write and bedrock write -------------- */
     const iamrole_cvenhancer = new iam.Role(this, "apilambdaiam_bedrock_database",{
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole",
        ),

      ]
     }); 

     iamrole_cvenhancer.addToPolicy(new iam.PolicyStatement({
      actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
      resources: [
        "arn:aws:bedrock:*::foundation-model/*",
        `arn:aws:bedrock:*:${this.account}:inference-profile/*`,
      ],
    }));


/*   --------------------- App Start  ----------------------------- */
    const hostedzone = route53.HostedZone.fromLookup(
      this,"ExistingZone",
      {
        domainName:"shruti-singla.com"
      }
    );  
     
    const myBucket = new s3.Bucket(this, 'cv-enhancer');
    const oac = new cloudfront.S3OriginAccessControl(this, 'MyOAC', {
      signing: cloudfront.Signing.SIGV4_NO_OVERRIDE
    });
    const s3Origin = origins.S3BucketOrigin.withOriginAccessControl(myBucket, {
      originAccessControl: oac
    })
       
    
   

    const certificate = acm.Certificate.fromCertificateArn(
      this,
      "WebsiteCertificate",
      "arn:aws:acm:us-east-1:882885365745:certificate/a118ca10-d61a-4573-b601-030438118e24"
    );


    const distribution = new cloudfront.Distribution(this, "Distribution", {
      defaultBehavior: {
          origin: s3Origin,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED
      },
      domainNames: ["cvenhancer.shruti-singla.com"],
      certificate: certificate,
      defaultRootObject: "index.html",
  });

    new route53.ARecord(this, 'AliasRecord', {
      zone : hostedzone,  
      recordName: "cvenhancer.shruti-singla.com",
      target: route53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(distribution),
    )        
    });


   
    const apigate = new  apigateway.RestApi(this,"Restapi_cv_enhancer",{
      deployOptions: {
        throttlingRateLimit: 5,   // requests per second, steady state
        throttlingBurstLimit: 10, // short spikes
      },
      defaultCorsPreflightOptions: {
        allowOrigins: ["https://cvenhancer.shruti-singla.com"],
        allowMethods: ["GET", "POST", "OPTIONS"],
        allowHeaders: apigateway.Cors.DEFAULT_HEADERS,
      },
    });


    new s3deploy.BucketDeployment(this, "DeployWebsite", {
      sources: [s3deploy.Source.asset("../frontend"),
      s3deploy.Source.jsonData("config.json", { apiUrl: apigate.url }),
      ],
      destinationBucket: myBucket,
    });



    // const db_pastqueries = new dynamo.Table(this, "CVenhancerTable", {
    //   tableName: "CV_Enhancer",
    
    //   partitionKey: {
    //     name: "query_id",
    //     type: dynamo.AttributeType.STRING
    //   },
    
    //   billingMode: dynamo.BillingMode.PAY_PER_REQUEST
    // });
    // db_pastqueries.grantReadData(iamrole_database);
    // db_pastqueries.grantWriteData(iamrole_cvenhancer);

    const cvenhancer = apigate.root.addResource("cv_enhancer"); 
    //const database = apigate.root.addResource("cv_enhancer_database");


  
    const querylambda = new lambda.Function(this, "querylambda",
      {
        runtime: lambda.Runtime.PYTHON_3_13,
        handler:"query.handler",
        code : lambda.Code.fromAsset("../backend/lambda"),
        timeout: Duration.seconds(25),
        role : iamrole_cvenhancer,
        environment: {
          //TABLE_NAME: db_pastqueries.tableName,
          MODEL_ID: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
        },

      
  });


//   const databaselambda = new lambda.Function(this, "databaselambda",
//     {
//       runtime: lambda.Runtime.NODEJS_24_X,
//       handler:"database.handler",
//       code : lambda.Code.fromAsset("../backend/lambda"),
//       timeout: Duration.seconds(10),
//       role : iamrole_database,
     

// });
    cvenhancer.addMethod(
      "POST",
      new apigateway.LambdaIntegration(querylambda)    
    );

    // database.addMethod(
    //   "GET",
    //   new apigateway.LambdaIntegration(databaselambda)    
    // );

  }



}

