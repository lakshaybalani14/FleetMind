#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { FleetMindStack } from "../lib/fleetmind-stack";

const app = new cdk.App();
const account = process.env.CDK_DEFAULT_ACCOUNT;

new FleetMindStack(app, "FleetMindBackend", {
  env: { account, region: "ap-southeast-2" },
  description: "FleetMind authenticated telemetry API and data storage (IoT Core intentionally deferred)",
});
