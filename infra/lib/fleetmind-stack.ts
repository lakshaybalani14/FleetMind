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
import * as iot from "aws-cdk-lib/aws-iot";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";

export class FleetMindStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const appOrigin = this.node.tryGetContext("appOrigin") ?? "http://localhost:3000";
    const contextString = (key: string, fallback = ""): string => {
      const value = this.node.tryGetContext(key);
      return typeof value === "string" ? value : fallback;
    };

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

    // WebSocket connection IDs and one-use, short-lived tickets used during $connect.
    const websocketTable = new dynamodb.Table(this, "WebSocketConnections", {
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "expiresAt",
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
        WEBSOCKET_TABLE_NAME: websocketTable.tableName,
        TELEMETRY_TTL_DAYS: "30",
        IOT_DATA_ENDPOINT: contextString("iotDataEndpoint"),
        AUTO_CONTROL_ENABLED: contextString("autoControlEnabled", "false"),
        AUTO_GAS_ON_LEVEL: contextString("autoGasOnLevel"),
        AUTO_GAS_OFF_LEVEL: contextString("autoGasOffLevel"),
        AUTO_TEMP_ON_C: contextString("autoTempOnC"),
        AUTO_TEMP_OFF_C: contextString("autoTempOffC"),
        AUTO_COMMAND_COOLDOWN_SECONDS: contextString("autoCommandCooldownSeconds", "10"),
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
      actions: ["dynamodb:PutItem"],
      resources: [websocketTable.tableArn],
    }));
    handler.addToRolePolicy(new iam.PolicyStatement({
      actions: ["dynamodb:Query", "dynamodb:DeleteItem"],
      resources: [websocketTable.tableArn],
    }));
    handler.addToRolePolicy(new iam.PolicyStatement({
      actions: ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem"],
      resources: [fleetTable.tableArn],
    }));
    handler.addToRolePolicy(new iam.PolicyStatement({
      actions: ["s3:PutObject"],
      resources: [historyBucket.arnForObjects("telemetry/*")],
    }));
    // Limit cloud-to-device publishing to the command topic namespace only.
    handler.addToRolePolicy(new iam.PolicyStatement({
      actions: ["iot:Publish"],
      resources: [this.formatArn({
        service: "iot",
        resource: "topic",
        resourceName: "fleetmind/node-*/commands",
        arnFormat: cdk.ArnFormat.SLASH_RESOURCE_NAME,
      })],
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
      { path: "/nodes/{nodeId}/relay", methods: [apigwv2.HttpMethod.POST] },
      { path: "/nodes/{nodeId}/automation", methods: [apigwv2.HttpMethod.POST] },
      { path: "/telemetry", methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST] },
      { path: "/logs", methods: [apigwv2.HttpMethod.GET] },
      { path: "/ws-ticket", methods: [apigwv2.HttpMethod.POST] },
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

    const wsApi = new apigwv2.WebSocketApi(this, "TelemetryWebSocketApi", {
      description: "Authenticated FleetMind real-time telemetry stream",
      routeSelectionExpression: "$request.body.action",
    });
    const wsAuthorizerFn = new nodejs.NodejsFunction(this, "WebSocketTicketAuthorizer", {
      entry: path.join(__dirname, "../lambda/index.ts"),
      handler: "websocketAuthorizer",
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 128,
      timeout: cdk.Duration.seconds(5),
      environment: { WEBSOCKET_TABLE_NAME: websocketTable.tableName },
      logGroup: new logs.LogGroup(this, "WebSocketAuthorizerLogs", {
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      bundling: { minify: true, sourceMap: true, target: "node22", externalModules: [] },
    });
    websocketTable.grant(wsAuthorizerFn, "dynamodb:DeleteItem");
    const wsConnectFn = new nodejs.NodejsFunction(this, "WebSocketConnectHandler", {
      entry: path.join(__dirname, "../lambda/index.ts"),
      handler: "websocketConnect",
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 128,
      timeout: cdk.Duration.seconds(5),
      environment: { WEBSOCKET_TABLE_NAME: websocketTable.tableName },
      logGroup: new logs.LogGroup(this, "WebSocketConnectLogs", {
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      bundling: { minify: true, sourceMap: true, target: "node22", externalModules: [] },
    });
    websocketTable.grant(wsConnectFn, "dynamodb:PutItem");
    const wsDisconnectFn = new nodejs.NodejsFunction(this, "WebSocketDisconnectHandler", {
      entry: path.join(__dirname, "../lambda/index.ts"),
      handler: "websocketDisconnect",
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 128,
      timeout: cdk.Duration.seconds(5),
      environment: { WEBSOCKET_TABLE_NAME: websocketTable.tableName },
      logGroup: new logs.LogGroup(this, "WebSocketDisconnectLogs", {
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      bundling: { minify: true, sourceMap: true, target: "node22", externalModules: [] },
    });
    websocketTable.grant(wsDisconnectFn, "dynamodb:DeleteItem");

    const cfnWsAuthorizer = new apigwv2.CfnAuthorizer(this, "FleetMindTicketAuthorizer", {
      apiId: wsApi.apiId,
      authorizerType: "REQUEST",
      identitySource: ["route.request.querystring.ticket"],
      name: "FleetMindTicketAuthorizer",
      authorizerUri: `arn:${cdk.Aws.PARTITION}:apigateway:${cdk.Aws.REGION}:lambda:path/2015-03-31/functions/${wsAuthorizerFn.functionArn}/invocations`,
      authorizerResultTtlInSeconds: 0,
    });
    wsAuthorizerFn.addPermission("AllowApiGatewayInvokeWebSocketAuthorizer", {
      principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
      sourceArn: cdk.Stack.of(this).formatArn({
        service: "execute-api",
        resource: wsApi.apiId,
        resourceName: `authorizers/${cfnWsAuthorizer.ref}`,
      }),
    });
    const wsRouteAuthorizer: apigwv2.IWebSocketRouteAuthorizer = {
      bind: () => ({ authorizationType: "CUSTOM", authorizerId: cfnWsAuthorizer.ref }),
    };
    wsApi.addRoute("$connect", {
      integration: new integrations.WebSocketLambdaIntegration("WebSocketConnectIntegration", wsConnectFn),
      authorizer: wsRouteAuthorizer,
    });
    wsApi.addRoute("$disconnect", {
      integration: new integrations.WebSocketLambdaIntegration("WebSocketDisconnectIntegration", wsDisconnectFn),
    });
    const wsStage = new apigwv2.WebSocketStage(this, "WebSocketProductionStage", {
      webSocketApi: wsApi,
      stageName: "prod",
      autoDeploy: true,
    });

    // Convert the firmware's MQTT publication into the same validated ingestion path.
    const telemetryRule = new iot.CfnTopicRule(this, "FleetMindTelemetryRule", {
      ruleName: "FleetMindTelemetryToLambda",
      topicRulePayload: {
        sql: "SELECT * FROM 'fleetmind/+/telemetry'",
        awsIotSqlVersion: "2016-03-23",
        ruleDisabled: false,
        actions: [{ lambda: { functionArn: handler.functionArn } }],
      },
    });
    handler.addPermission("AllowIoTRuleInvoke", {
      principal: new iam.ServicePrincipal("iot.amazonaws.com"),
      sourceArn: telemetryRule.attrArn,
    });

    const statusRule = new iot.CfnTopicRule(this, "FleetMindStatusRule", {
      ruleName: "FleetMindStatusToLambda",
      topicRulePayload: {
        sql: "SELECT * FROM 'fleetmind/+/status'",
        awsIotSqlVersion: "2016-03-23",
        ruleDisabled: false,
        actions: [{ lambda: { functionArn: handler.functionArn } }],
      },
    });
    handler.addPermission("AllowIoTStatusRuleInvoke", {
      principal: new iam.ServicePrincipal("iot.amazonaws.com"),
      sourceArn: statusRule.attrArn,
    });

    const actuatorAckRule = new iot.CfnTopicRule(this, "FleetMindActuatorAckRule", {
      ruleName: "FleetMindActuatorAckToLambda",
      topicRulePayload: {
        sql: "SELECT * FROM 'fleetmind/+/events' WHERE eventType = 'actuator_ack'",
        awsIotSqlVersion: "2016-03-23",
        ruleDisabled: false,
        actions: [{ lambda: { functionArn: handler.functionArn } }],
      },
    });
    handler.addPermission("AllowIoTActuatorAckRuleInvoke", {
      principal: new iam.ServicePrincipal("iot.amazonaws.com"),
      sourceArn: actuatorAckRule.attrArn,
    });

    wsApi.grantManageConnections(handler);
    handler.addEnvironment("WEBSOCKET_API_ENDPOINT", wsStage.callbackUrl);

    new cdk.CfnOutput(this, "ApiUrl", { value: api.apiEndpoint });
    new cdk.CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
    new cdk.CfnOutput(this, "UserPoolClientId", { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, "ManagedLoginDomain", {
      value: `https://${managedLoginDomain.domainName}.auth.${this.region}.amazoncognito.com`,
    });
    new cdk.CfnOutput(this, "FleetTableName", { value: fleetTable.tableName });
    new cdk.CfnOutput(this, "HistoryBucketName", { value: historyBucket.bucketName });
    new cdk.CfnOutput(this, "WebSocketUrl", { value: wsStage.url });
    new cdk.CfnOutput(this, "WebSocketTicketUrl", { value: `${api.apiEndpoint}/ws-ticket` });
  }
}
