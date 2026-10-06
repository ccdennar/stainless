#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { EnterpriseDataLakeStorageStack } from '../lib/stacks/datalake-storage-stack';

const app = new cdk.App();

new EnterpriseDataLakeStorageStack(app, 'EnterpriseDataLakeStorageStack', {
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1' 
  },
  description: 'Enterprise Data Lake Storage: Landing and Curated Zones with KMS and Object Lock.'
});

// Apply global tags to all resources in the app
cdk.Tags.of(app).add('ManagedBy', 'AWS-CDK');
cdk.Tags.of(app).add('Project', 'EnterpriseDataLake');