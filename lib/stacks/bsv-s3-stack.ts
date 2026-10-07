import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { BsvS3Zone } from '../constructs/bsv-s3-zone';

export interface BsvS3StackProps extends cdk.StackProps {
  envName: string;            // 'dev'
  ingestionRoleArn: string;   // FileX / Transfer Family role
  glueRoleArn: string;        // Glue job role
}

export class BsvS3Stack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: BsvS3StackProps) {
    super(scope, id, props);

    const account = this.account;
    const region = this.region;

    // 1. KMS Key (Shared for simplicity, or split into two keys for strict crypto-separation)
    const key = new kms.Key(this, 'BsvS3Key', {
      alias: `alias/bsv-s3-key-${props.envName}`,
      description: `KMS Key for BSV Data Lake ${props.envName.toUpperCase()} Zone`,
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // 2. Centralized Access Logs Bucket
    const logBucket = new s3.Bucket(this, 'AccessLogs', {
      bucketName: `bsv-datalake-logs-${props.envName}-${account}-${region}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      lifecycleRules: [
        {
          id: 'LogRetention',
          transitions: [{ storageClass: s3.StorageClass.GLACIER, transitionAfter: cdk.Duration.days(90) }],
          expiration: cdk.Duration.days(365),
        }
      ],
    });

    // 3. Landing Zone (Raw)
    const landingZone = new BsvS3Zone(this, 'LandingZone', {
      zoneName: 'landing',
      envName: props.envName,
      account,
      region,
      kmsKey: key,
      logBucket,
      lifecycleRules: [
        { id: 'LandingCleanup', noncurrentVersionExpiration: cdk.Duration.days(30) }
      ],
    });

    // 4. Curated Zone (Refined)
    const curatedZone = new BsvS3Zone(this, 'CuratedZone', {
      zoneName: 'curated',
      envName: props.envName,
      account,
      region,
      kmsKey: key,
      logBucket,
      lifecycleRules: [
        ...['completed/', 'rejected/', 'dlq/'].map((prefix) => ({
          id: `CuratedCleanup-${prefix.replace('/', '')}`,
          prefix,
          expiration: cdk.Duration.days(30),
        })),
      ],
    });

    // 5. Least Privilege IAM Grants
    const ingestion = iam.Role.fromRoleArn(this, 'IngestRole', props.ingestionRoleArn);
    const glue = iam.Role.fromRoleArn(this, 'GlueRole', props.glueRoleArn);
    
    landingZone.bucket.grantPut(ingestion);       // Ingestion can ONLY write to Landing
    landingZone.bucket.grantRead(glue);           // Glue can read from Landing
    curatedZone.bucket.grantReadWrite(glue);      // Glue can read/write Curated

    // 6. Enterprise Tagging Strategy
    cdk.Tags.of(this).add('app', 'bsv');
    cdk.Tags.of(this).add('environment', props.envName);
    cdk.Tags.of(this).add('owner', 'data-platform-team');       // UPDATE with actual team name
    cdk.Tags.of(this).add('cost-center', 'engineering-data');   // UPDATE with actual cost center
    cdk.Tags.of(this).add('managed-by', 'aws-cdk');

    // 7. Outputs
    new cdk.CfnOutput(this, 'LandingBucketName', { value: landingZone.bucket.bucketName });
    new cdk.CfnOutput(this, 'CuratedBucketName', { value: curatedZone.bucket.bucketName });
    new cdk.CfnOutput(this, 'KmsKeyArn', { value: key.keyArn });
  }
}