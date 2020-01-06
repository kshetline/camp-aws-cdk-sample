import cdk = require('@aws-cdk/core');
import s3 = require('@aws-cdk/aws-s3');

export class CampSampleStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    new s3.Bucket(this, 'CampSampleBucket', {
      versioned: true
    });
  }
}
