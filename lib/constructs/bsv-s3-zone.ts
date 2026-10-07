import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';

export interface BsvS3ZoneProps {
  readonly zoneName: string;            // 'landing' or 'curated'
  readonly envName: string;             // 'dev', 'qa', 'prod'
  readonly account: string;
  readonly region: string;
  readonly kmsKey: kms.IKey;
  readonly logBucket: s3.IBucket;
  readonly lifecycleRules?: s3.LifecycleRule[];
}

export class BsvS3Zone extends Construct {
  public readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: BsvS3ZoneProps) {
    super(scope, id);

    const { zoneName, envName, account, region, kmsKey, logBucket, lifecycleRules } = props;

    this.bucket = new s3.Bucket(this, 'ZoneBucket', {
      bucketName: `bsv-datalake-${zoneName}-${envName}-${account}-${region}`,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: kmsKey,
      bucketKeyEnabled: true,               // Reduces KMS API costs by ~70%
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,                     // Denies non-HTTPS requests
      versioned: true,
      eventBridgeEnabled: true,             // Required for CCAGILE-19716
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      serverAccessLogsBucket: logBucket,
      serverAccessLogsPrefix: `${zoneName}/`,
      lifecycleRules: lifecycleRules || [],
    });
  }
}