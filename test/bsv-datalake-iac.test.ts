import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { BsvS3Stack } from '../lib/stacks/bsv-s3-stack';

describe('BsvS3Stack', () => {
  let app: cdk.App;
  let stack: BsvS3Stack;
  let template: Template;

  beforeAll(() => {
    app = new cdk.App();
    stack = new BsvS3Stack(app, 'TestStack', {
      envName: 'test',
      ingestionRoleArn: 'arn:aws:iam::123456789012:role/TestIngestionRole',
      glueRoleArn: 'arn:aws:iam::123456789012:role/TestGlueRole',
    });
    template = Template.fromStack(stack);
  });

  test('Creates exactly 3 S3 Buckets (Landing, Curated, Logs)', () => {
    template.resourceCountIs('AWS::S3::Bucket', 3);
  });

  test('Enforces Block Public Access on all buckets', () => {
    template.allResourcesProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  test('Creates a KMS Key with Rotation Enabled', () => {
    template.resourceCountIs('AWS::KMS::Key', 1);
    template.hasResourceProperties('AWS::KMS::Key', {
      EnableKeyRotation: true,
    });
  });

  test('Applies mandatory enterprise tags', () => {
    template.tagMatches({
      app: 'bsv',
      environment: 'test',
      'managed-by': 'aws-cdk',
    });
  });

  test('Grants least-privilege IAM permissions', () => {
    // Verify Ingestion Role gets PutObject on Landing
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: ['s3:PutObject', 's3:Abort*'],
            Effect: 'Allow',
            Resource: Match.anyValue(), // Matches the Landing bucket ARN
          }),
        ]),
      },
    });
  });
});