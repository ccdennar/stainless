import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { EnterpriseS3Zone } from '../constructs/enterprise-s3-zone';

export class EnterpriseDataLakeStorageStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ==========================================
    // 1. Centralized Access Logs Bucket
    // ==========================================
    const accessLogsBucket = new s3.Bucket(this, 'S3AccessLogsBucket', {
      bucketName: `enterprise-datalake-access-logs-${this.account}-${this.region}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      lifecycleRules: [
        {
          id: 'TransitionToGlacier',
          transitions: [{ storageClass: s3.StorageClass.GLACIER, transitionAfter: cdk.Duration.days(90) }],
          expiration: cdk.Duration.days(3650), // 10 years for compliance
        }
      ],
    });

    // ==========================================
    // 2. Landing Zone (Raw / Bronze)
    // ==========================================
    const landingZone = new EnterpriseS3Zone(this, 'LandingZone', {
      zoneName: 'Landing',
      accessLogsBucket: accessLogsBucket,
      lifecycleRules: [
        {
          id: 'LandingZoneLifecycle',
          transitions: [
            { storageClass: s3.StorageClass.INFREQUENT_ACCESS, transitionAfter: cdk.Duration.days(30) },
            { storageClass: s3.StorageClass.GLACIER, transitionAfter: cdk.Duration.days(90) }
          ],
          noncurrentVersionTransitions: [
            { storageClass: s3.StorageClass.GLACIER, transitionAfter: cdk.Duration.days(7) }
          ],
          noncurrentVersionExpiration: cdk.Duration.days(90)
        }
      ],
    });

    // ==========================================
    // 3. Curated Zone (Silver / Gold)
    // ==========================================
    const curatedZone = new EnterpriseS3Zone(this, 'CuratedZone', {
      zoneName: 'Curated',
      accessLogsBucket: accessLogsBucket,
      enableObjectLock: true, // WORM compliance for Gold data
      retentionDays: 365,
      lifecycleRules: [
        {
          id: 'CuratedZoneLifecycle',
          transitions: [
            { storageClass: s3.StorageClass.INTELLIGENT_TIERING, transitionAfter: cdk.Duration.days(0) }
          ]
        }
      ],
    });

    // ==========================================
    // 4. Enterprise Tagging Strategy
    // ==========================================
    const tags = {
      'Project': 'EnterpriseDataLake',
      'CostCenter': 'DataEngineering',
      'DataClassification': 'Confidential',
      'ManagedBy': 'AWS-CDK'
    };

    for (const [key, value] of Object.entries(tags)) {
      cdk.Tags.of(this).add(key, value);
    }

    // ==========================================
    // 5. Outputs for Downstream Consumption
    // ==========================================
    new cdk.CfnOutput(this, 'LandingZoneBucketName', { value: landingZone.bucket.bucketName });
    new cdk.CfnOutput(this, 'CuratedZoneBucketName', { value: curatedZone.bucket.bucketName });
    new cdk.CfnOutput(this, 'LandingZoneKmsKeyArn', { value: landingZone.kmsKey.keyArn });
    new cdk.CfnOutput(this, 'CuratedZoneKmsKeyArn', { value: curatedZone.kmsKey.keyArn });
  }
}