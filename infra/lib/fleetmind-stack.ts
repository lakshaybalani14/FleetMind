import * as path from "node:path";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as authorizers from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";

export class FleetMindStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const appOrigin = this.node.tryGetContext("appOrigin") ?? "http://localhost:3000";

    const fleetTable = new dynamodb.Table(this, "FleetData", {
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "expiresAt",
      deletionProtection: true,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const historyBucket = new s3.Bucket(this, "TelemetryHistory", {
      bucketName: undefined,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const userPool = new cognito.UserPool(this, "DashboardUsers", {
      signInAliases: { email: true },
      selfSignUpEnabled: true,
      autoVerify: { email: true },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const userPoolClient = userPool.addClient("DashboardWebClient", {
      userPoolClientName: "fleetmind-dashboard-web",
      generateSecret: false,
      authFlows: { userSrp: true },
      oAuth: {
        flows: { authorizationCodeGrant: true, implicitCodeGrant: false },
        callbackUrls: ["http://localhost:3000/auth/callback"],
        logoutUrls: ["http://localhost:3000"],
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL],
      },
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
      accessTokenValidity: cdk.Duration.minutes(30),
      idTokenValidity: cdk.Duration.minutes(30),
      refreshTokenValidity: cdk.Duration.days(7),
      refreshTokenRotationGracePeriod: cdk.Duration.seconds(30),
    });

    const managedLoginDomain = userPool.addDomain("ManagedLoginDomain", {
      cognitoDomain: {
        domainPrefix: cdk.Fn.join("", ["fleetmind-", cdk.Aws.ACCOUNT_ID]),
      },
      managedLoginVersion: cognito.ManagedLoginVersion.NEWER_MANAGED_LOGIN,
    });

    const managedLoginBranding = new cognito.CfnManagedLoginBranding(this, "ManagedLoginBranding", {
      userPoolId: userPool.userPoolId,
      clientId: userPoolClient.userPoolClientId,
      useCognitoProvidedValues: true,
    });
    managedLoginBranding.node.addDependency(managedLoginDomain);

    const lambdaLogs = new logs.LogGroup(this, "TelemetryApiLogs", {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const apiAccessLogs = new logs.LogGroup(this, "ApiAccessLogs", {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const api = new apigwv2.HttpApi(this, "TelemetryApi", {
      description: "Authenticated FleetMind telemetry, node, and action-log API",
      createDefaultStage: false,
      corsPreflight: {
        allowOrigins: [appOrigin],
        allowMethods: [apigwv2.CorsHttpMethod.GET, apigwv2.CorsHttpMethod.POST],
        allowHeaders: ["authorization", "content-type"],
        maxAge: cdk.Duration.hours(1),
      },
    });

    new apigwv2.HttpStage(this, "DefaultStage", {
      httpApi: api,
      stageName: "$default",
      autoDeploy: true,
      accessLogSettings: {
        destination: new apigwv2.LogGroupLogDestination(apiAccessLogs),
        format: apigateway.AccessLogFormat.jsonWithStandardFields({
          httpMethod: true,
          ip: true,
          requestTime: true,
          resourcePath: true,
          status: true,
          caller: false,
          user: false,
          protocol: true,
          responseLength: true,
        }),
      },
    });

    const handler = new nodejs.NodejsFunction(this, "TelemetryHandler", {
      entry: path.join(__dirname, "../lambda/index.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      environment: {
        FLEET_TABLE_NAME: fleetTable.tableName,
        HISTORY_BUCKET_NAME: historyBucket.bucketName,
        TELEMETRY_TTL_DAYS: "30",
      },
      logGroup: lambdaLogs,
      bundling: {
        minify: true,
        sourceMap: true,
        target: "node22",
        externalModules: [],
      },
    });

    handler.addToRolePolicy(new iam.PolicyStatement({
      actions: ["dynamodb:Query"],
      resources: [fleetTable.tableArn, `${fleetTable.tableArn}/index/*`],
    }));
    handler.addToRolePolicy(new iam.PolicyStatement({
      actions: ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem"],
      resources: [fleetTable.tableArn],
    }));
    handler.addToRolePolicy(new iam.PolicyStatement({
      actions: ["s3:PutObject"],
      resources: [historyBucket.arnForObjects("telemetry/*")],
    }));

    const jwtAuthorizer = new authorizers.HttpJwtAuthorizer(
      "FleetMindCognitoAuthorizer",
      userPool.userPoolProviderUrl,
      { jwtAudience: [userPoolClient.userPoolClientId] },
    );
    const integration = new integrations.HttpLambdaIntegration("TelemetryLambdaIntegration", handler);

    const routes: ReadonlyArray<{
      readonly path: string;
      readonly methods: readonly apigwv2.HttpMethod[];
    }> = [
      { path: "/nodes", methods: [apigwv2.HttpMethod.GET] },
      { path: "/telemetry", methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST] },
      { path: "/logs", methods: [apigwv2.HttpMethod.GET] },
    ];

    for (const route of routes) {
      for (const method of route.methods) {
        api.addRoutes({
          path: route.path,
          methods: [method],
          integration,
          authorizer: jwtAuthorizer,
        });
      }
    }

    new cdk.CfnOutput(this, "ApiUrl", { value: api.apiEndpoint });
    new cdk.CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
    new cdk.CfnOutput(this, "UserPoolClientId", { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, "ManagedLoginDomain", {
      value: `https://${managedLoginDomain.domainName}.auth.${this.region}.amazoncognito.com`,
    });
    new cdk.CfnOutput(this, "FleetTableName", { value: fleetTable.tableName });
    new cdk.CfnOutput(this, "HistoryBucketName", { value: historyBucket.bucketName });
  }
}
