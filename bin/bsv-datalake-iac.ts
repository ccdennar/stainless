#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { BsvS3Stack } from '../lib/stacks/bsv-s3-stack';

const app = new cdk.App();

// ==========================================================
// Secure Configuration via CDK Context (No .env files!)
// ==========================================================
// In CI/CD, these will pass via command line: 
// cdk deploy -c ingestionRoleArn=arn:aws:iam::123:role/MyRole -c glueRoleArn=arn:aws:iam::123:role/GlueRole
// 
// Locally, this can  be define  in cdk.json under the "context" block, 
// or pass them via the CLI as shown above.

const ingestionRoleArn = app.node.tryGetContext('ingestionRoleArn') || 'arn:aws:iam::000000000000:role/mock-ingestion-role';
const glueRoleArn = app.node.tryGetContext('glueRoleArn') || 'arn:aws:iam::000000000000:role/mock-glue-role';

// ==========================================================
// Stack Instantiation
// ==========================================================
new BsvS3Stack(app, 'BsvDataLakeDevStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  envName: 'dev',
  ingestionRoleArn: ingestionRoleArn,
  glueRoleArn: glueRoleArn,
});