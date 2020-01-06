import { expect as expectCDK, matchTemplate, MatchStyle } from '@aws-cdk/assert';
import cdk = require('@aws-cdk/core');
import sampleStack = require('../lib/camp-sample-stack');

test('Empty Stack', () => {
  const app = new cdk.App();
  // WHEN
  const stack = new sampleStack.CampSampleStack(app, 'CampSampleStack');
  // THEN
  expectCDK(stack).to(matchTemplate({
    "Resources": {
      "CampSampleBucket594BA924": {
        "Type": "AWS::S3::Bucket",
        "Properties": {
          "VersioningConfiguration": {
            "Status": "Enabled"
          }
        },
        "UpdateReplacePolicy": "Retain",
        "DeletionPolicy": "Retain"
      }
    }
  }, MatchStyle.EXACT))
});
