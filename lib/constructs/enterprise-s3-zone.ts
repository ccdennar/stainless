import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface EnterpriseS3ZoneProps {
  readonly zoneName: string;
  readonly accessLogsBucket: s3.IBucket;
  readonly enableObjectLock?: boolean;
  readonly retentionDays?: number;
  readonly lifecycleRules?: s3.LifecycleRule[];
}

export class EnterpriseS3Zone extends Construct {
  public readonly bucket: s3.Bucket;
  public readonly kmsKey: kms.Key;

  constructor(scope: Construct, id: string, props: EnterpriseS3ZoneProps) {
    super(scope, id);

    const { zoneName, accessLogsBucket, enableObjectLock = false, retentionDays = 365, lifecycleRules } = props;

    // 1. Dedicated KMS Key for Cryptographic Separation
    this.kmsKey = new kms.Key(this, 'ZoneKmsKey', {
      alias: `datalake/${zoneName.toLowerCase()}-zone`,
      description: `KMS Key for ${zoneName} Zone Encryption`,
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // 2. Secure S3 Bucket
    this.bucket = new s3.Bucket(this, 'ZoneBucket', {
      bucketName: `enterprise-datalake-${zoneName.toLowerCase()}-${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}`,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: this.kmsKey,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      serverAccessLogsBucket: accessLogsBucket,
      serverAccessLogsPrefix: `${zoneName.toLowerCase()}-zone/`,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      enforceSSL: true,
      ...(enableObjectLock && {
        objectLockEnabled: true,
        objectLockDefaultRetention: s3.ObjectLockRetention.modeCompliance(cdk.Duration.days(retentionDays)),
      }),
      lifecycleRules: lifecycleRules || [],
    });

    // 3. Enforce KMS Encryption on PutObject (Zero Trust)
    this.bucket.addToResourcePolicy(new iam.PolicyStatement({
      sid: 'DenyUnencryptedUploads',
      effect: iam.Effect.DENY,
      principals: [new iam.AnyPrincipal()],
      actions: ['s3:PutObject'],
      resources: [this.bucket.arnForObjects('*')],
      conditions: {
        'StringNotEquals': {
          's3:x-amz-server-side-encryption': 'aws:kms',
          's3:x-amz-server-side-encryption-aws-kms-key-id': this.kmsKey.keyArn
        }
      }
    }));

    // 4. Enforce TLS 1.2+ (Secure Transport)
    this.bucket.addToResourcePolicy(new iam.PolicyStatement({
      sid: 'DenyInsecureTransport',
      effect: iam.Effect.DENY,
      principals: [new iam.AnyPrincipal()],
      actions: ['s3:*'],
      resources: [this.bucket.bucketArn, `${this.bucket.bucketArn}/*`],
      conditions: {
        'Bool': { 'aws:SecureTransport': 'false' }
      }
    }));
  }
}